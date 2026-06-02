"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { canManage, requireUser } from "@/server/auth/permissions";
import { taskSchema, taskStatusSchema } from "@/lib/schemas/task";
import { runAction } from "./_helpers";

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function saveTask(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản lý/Quản trị được tạo & sửa công việc");
    const data = taskSchema.parse(input);

    const name = data.name || data.level5 || data.level3 || data.level2 || "Công việc";
    const assigneeIds = (data.assigneeIds ?? []).filter(Boolean).slice(0, 3);

    const payload = {
      workGroupId: data.workGroupId,
      projectId: data.projectId || null,
      disciplineId: data.disciplineId || null,
      phaseId: data.phaseId || null,
      sumId: data.sumId || null,
      subId: data.subId || null,
      level2: data.level2 || null,
      level3: data.level3 || null,
      level5: data.level5 || null,
      name,
      priority: data.priority ?? "TRUNG_BINH",
      status: data.status ?? "CHUA_LAM",
      progressPercent: data.progressPercent ?? 0,
      plannedStart: toDate(data.plannedStart),
      plannedEnd: toDate(data.plannedEnd),
      note: data.note || null,
    };

    if (data.id) {
      await prisma.task.update({ where: { id: data.id }, data: payload });
      // đồng bộ người thực hiện
      await prisma.taskAssignee.deleteMany({ where: { taskId: data.id } });
      if (assigneeIds.length > 0) {
        await prisma.taskAssignee.createMany({
          data: assigneeIds.map((userId, i) => ({ taskId: data.id as string, userId, roleNo: i + 1 })),
        });
      }
    } else {
      const created = await prisma.task.create({
        data: {
          ...payload,
          wbsPath: data.sumId || randomUUID(),
          level: 5,
          assignees: {
            create: assigneeIds.map((userId, i) => ({ userId, roleNo: i + 1 })),
          },
        },
      });
      void created;
    }

    revalidatePath("/tasks");
    revalidatePath("/reports");
  });
}

export async function updateTaskStatus(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const data = taskStatusSchema.parse(input);

    // MEMBER chỉ cập nhật việc được giao; MANAGER/ADMIN cập nhật mọi việc
    if (!canManage(user.role)) {
      const assigned = await prisma.taskAssignee.findFirst({
        where: { taskId: data.id, userId: user.id },
      });
      if (!assigned) throw new Error("Bạn không được giao công việc này");
    }

    await prisma.task.update({
      where: { id: data.id },
      data: {
        status: data.status,
        progressPercent: data.progressPercent ?? (data.status === "HOAN_THANH" ? 100 : undefined),
        actualEnd: data.status === "HOAN_THANH" ? new Date() : null,
      },
    });
    revalidatePath("/tasks");
    revalidatePath("/reports");
  });
}

export async function deleteTask(id: string) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Không đủ quyền");
    await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/tasks");
    revalidatePath("/reports");
  });
}
