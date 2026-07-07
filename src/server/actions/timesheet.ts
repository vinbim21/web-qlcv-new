"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { canManage, requireUser } from "@/server/auth/permissions";
import { isStartGateLocked } from "@/lib/task-status";
import { canEditEntry } from "@/lib/timesheet";
import { bulkTimesheetEntrySchema, timesheetEntrySchema } from "@/lib/schemas/timesheet";
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
      // Cổng duyệt: đã bỏ chặn — user được phép ghi giờ kể cả khi task đang chờ duyệt khởi tạo.
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
      const taskPatch: Record<string, unknown> = {};
      if (data.markComplete) {
        taskPatch.status = "HOAN_THANH";
        taskPatch.progressPercent = 100;
        taskPatch.actualEnd = date;
      } else if (task.status === "CHUA_LAM") {
        taskPatch.status = "DANG_LAM";
      }
      // Ghi đường dẫn kết quả nếu user cung cấp (kể cả chuỗi rỗng → xóa).
      if (data.result !== undefined) {
        taskPatch.result = data.result.trim() || null;
      }
      if (Object.keys(taskPatch).length > 0) {
        await prisma.task.update({ where: { id: task.id }, data: taskPatch });
      }
    }

    revalidatePath("/timesheet");
    revalidatePath("/reports");
    revalidatePath("/tasks");
    revalidatePath("/manage");
  });
}

/** Ghi giờ hàng loạt: tạo 1 entry cho mỗi task trong danh sách. */
export async function bulkSaveTimesheetEntry(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const data = bulkTimesheetEntrySchema.parse(input);
    const date = new Date(data.date);

    if (!canEditEntry(date, user.role === "ADMIN")) {
      throw new Error("Quá hạn ghi (chỉ trong 2 ngày). Liên hệ quản trị.");
    }

    // Lấy task info để kiểm cổng duyệt + projectId
    const tasks = await prisma.task.findMany({
      where: { id: { in: data.taskIds }, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        status: true,
        approverId: true,
        startApprovedAt: true,
        assignees: { where: { userId: user.id }, select: { id: true } },
      },
    });

    const entries: { userId: string; taskId: string; projectId: string | null; date: Date; hours: number; note: string | null }[] = [];
    const toStart: string[] = [];

    for (const t of tasks) {
      // isStartGateLocked: không còn chặn ghi giờ — bỏ qua check này
      const isAssignee = t.assignees.length > 0;
      if (!isAssignee && !canManage(user.role)) continue; // chỉ ghi giờ việc mình được giao
      entries.push({ userId: user.id, taskId: t.id, projectId: t.projectId ?? null, date, hours: data.hours, note: data.note || null });
      if (t.status === "CHUA_LAM" && (isAssignee || canManage(user.role))) toStart.push(t.id);
    }

    if (entries.length === 0) throw new Error("Không có công việc hợp lệ để ghi giờ (không phải việc của bạn)");

    await prisma.$transaction([
      prisma.timeSheetEntry.createMany({ data: entries }),
      ...(toStart.length > 0
        ? [prisma.task.updateMany({ where: { id: { in: toStart } }, data: { status: "DANG_LAM" } })]
        : []),
    ]);

    revalidatePath("/timesheet");
    revalidatePath("/reports");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    return entries.length;
  });
}

/** Lấy các entry timesheet của user trong tuần hiện tại cho 1 task. */
export async function getTaskWeekEntries(taskId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const today = new Date();
    const dow = today.getDay(); // 0=CN, 1=T2...
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const entries = await prisma.timeSheetEntry.findMany({
      where: { userId: user.id, taskId, deletedAt: null, date: { gte: monday, lte: sunday } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, hours: true, note: true },
    });
    return entries.map((e) => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      hours: Number(e.hours),
      note: e.note,
    }));
  });
}

/** Lấy toàn bộ giờ đã ghi (mọi người, mọi thời điểm) cho 1 task — dùng cho modal chi tiết ở /manage. */
export async function getTaskAllEntries(taskId: string) {
  return runAction(async () => {
    await requireUser();
    const entries = await prisma.timeSheetEntry.findMany({
      where: { taskId, deletedAt: null },
      orderBy: { date: "asc" },
      select: { id: true, date: true, hours: true, note: true, user: { select: { fullName: true } } },
    });
    return entries.map((e) => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      hours: Number(e.hours),
      note: e.note,
      userName: e.user.fullName,
    }));
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
