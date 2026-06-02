"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { catalogCrudSchema } from "@/lib/schemas/admin";
import { runAction } from "./_helpers";

// ---------- Nhóm công việc (Level 1) ----------

export async function saveWorkGroup(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = catalogCrudSchema.parse(input);
    if (data.id) {
      await prisma.workGroup.update({
        where: { id: data.id },
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    } else {
      await prisma.workGroup.create({
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    }
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
  });
}

export async function deleteWorkGroup(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const used = await prisma.task.count({ where: { workGroupId: id } });
    if (used > 0) throw new Error(`Nhóm đang có ${used} công việc, không thể xóa`);
    await prisma.workGroup.delete({ where: { id } });
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
  });
}

// ---------- Giai đoạn ----------

export async function savePhase(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = catalogCrudSchema.parse(input);
    if (data.id) {
      await prisma.phase.update({
        where: { id: data.id },
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    } else {
      await prisma.phase.create({
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    }
    revalidatePath("/admin/catalog");
  });
}

export async function deletePhase(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const used = await prisma.task.count({ where: { phaseId: id } });
    if (used > 0) throw new Error(`Giai đoạn đang gắn ${used} công việc, không thể xóa`);
    await prisma.phase.delete({ where: { id } });
    revalidatePath("/admin/catalog");
  });
}
