"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { canManage, requireUser } from "@/server/auth/permissions";
import { isStartGateLocked } from "@/lib/task-status";
import { canEditEntry } from "@/lib/timesheet";
import { timesheetEntrySchema } from "@/lib/schemas/timesheet";
import { runAction } from "./_helpers";

export async function saveTimesheetEntry(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const data = timesheetEntrySchema.parse(input);
    const isAdmin = user.role === "ADMIN";
    const date = new Date(data.date);

    if (!canEditEntry(date, isAdmin)) {
      throw new Error("Quá hạn sửa (chỉ trong 2 ngày). Liên hệ quản trị.");
    }

    // lấy task (nếu có) để: projectId tổng hợp báo cáo + status + kiểm người được giao.
    let projectId: string | null = null;
    let task: { id: string; status: string; isAssignee: boolean } | null = null;
    if (data.taskId) {
      const t = await prisma.task.findUnique({
        where: { id: data.taskId },
        select: {
          id: true,
          projectId: true,
          status: true,
          approverId: true,
          startApprovedAt: true,
          assignees: { where: { userId: user.id }, select: { id: true } },
        },
      });
      // Cổng duyệt khởi tạo: chưa duyệt thì chưa cho ghi giờ vào việc.
      if (t && isStartGateLocked(t)) throw new Error("Việc đang chờ duyệt — chưa thể ghi giờ");
      projectId = t?.projectId ?? null;
      if (t) task = { id: t.id, status: t.status, isAssignee: t.assignees.length > 0 };
    }

    if (data.id) {
      const existing = await prisma.timeSheetEntry.findUnique({ where: { id: data.id } });
      if (!existing || existing.userId !== user.id) {
        if (!isAdmin) throw new Error("Không tìm thấy hoặc không có quyền");
      }
      await prisma.timeSheetEntry.update({
        where: { id: data.id },
        data: { taskId: data.taskId || null, projectId, date, hours: data.hours, note: data.note || null },
      });
    } else {
      await prisma.timeSheetEntry.create({
        data: {
          userId: user.id,
          taskId: data.taskId || null,
          projectId,
          date,
          hours: data.hours,
          note: data.note || null,
        },
      });
    }

    // Đổi trạng thái công việc theo thao tác ghi giờ — chỉ khi user là người được giao
    // (hoặc Quản trị/Cấp 1) để tránh sửa status việc không phải của mình.
    if (task && (task.isAssignee || canManage(user.role))) {
      if (data.markComplete) {
        // Tích "Hoàn thành" → đặt xong + mốc thực tế (đồng bộ cột "Hạn" ở /tasks).
        await prisma.task.update({
          where: { id: task.id },
          data: { status: "HOAN_THANH", progressPercent: 100, actualEnd: new Date() },
        });
      } else if (task.status === "CHUA_LAM") {
        // Ghi giờ mà việc còn "Chưa làm" → tự chuyển "Đang thực hiện".
        await prisma.task.update({ where: { id: task.id }, data: { status: "DANG_LAM" } });
      }
    }

    revalidatePath("/timesheet");
    revalidatePath("/reports");
    revalidatePath("/tasks");
    revalidatePath("/manage");
  });
}

export async function deleteTimesheetEntry(id: string) {
  return runAction(async () => {
    const user = await requireUser();
    const isAdmin = user.role === "ADMIN";
    const existing = await prisma.timeSheetEntry.findUnique({ where: { id } });
    if (!existing) throw new Error("Không tìm thấy");
    if (existing.userId !== user.id && !isAdmin) throw new Error("Không có quyền");
    if (!canEditEntry(existing.date, isAdmin)) throw new Error("Quá hạn sửa");

    const taskId = existing.taskId;
    await prisma.timeSheetEntry.delete({ where: { id } });

    // PA1: nếu xóa hết timesheet của việc (mọi người) → reset việc về "Chưa làm" + bỏ HT.
    if (taskId) {
      const remaining = await prisma.timeSheetEntry.count({ where: { taskId, deletedAt: null } });
      if (remaining === 0) {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { status: true, assignees: { where: { userId: user.id }, select: { id: true } } },
        });
        const isAssignee = (task?.assignees.length ?? 0) > 0;
        // Guard quyền + chỉ đảo từ Đang làm/Hoàn thành (Tạm dừng/Chưa làm giữ nguyên).
        if (
          task &&
          (isAssignee || canManage(user.role)) &&
          (task.status === "DANG_LAM" || task.status === "HOAN_THANH")
        ) {
          await prisma.task.update({
            where: { id: taskId },
            data: { status: "CHUA_LAM", actualEnd: null, progressPercent: 0 },
          });
        }
      }
    }

    revalidatePath("/timesheet");
    revalidatePath("/reports");
    revalidatePath("/tasks");
    revalidatePath("/manage");
  });
}
