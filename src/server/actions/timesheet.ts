"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireUser } from "@/server/auth/permissions";
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

    // lấy projectId từ task (nếu có) để tổng hợp báo cáo
    let projectId: string | null = null;
    if (data.taskId) {
      const t = await prisma.task.findUnique({ where: { id: data.taskId } });
      projectId = t?.projectId ?? null;
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
    revalidatePath("/timesheet");
    revalidatePath("/reports");
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
    await prisma.timeSheetEntry.delete({ where: { id } });
    revalidatePath("/timesheet");
    revalidatePath("/reports");
  });
}
