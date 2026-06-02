"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { disciplineSchema } from "@/lib/schemas/admin";
import { runAction } from "./_helpers";

export async function saveDiscipline(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = disciplineSchema.parse(input);
    if (data.id) {
      await prisma.discipline.update({
        where: { id: data.id },
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    } else {
      await prisma.discipline.create({
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    }
    revalidatePath("/admin/disciplines");
  });
}

export async function deleteDiscipline(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const used = await prisma.user.count({ where: { disciplineId: id } });
    const usedTask = await prisma.task.count({ where: { disciplineId: id } });
    if (used + usedTask > 0) throw new Error("Bộ môn đang được sử dụng, không thể xóa");
    await prisma.discipline.delete({ where: { id } });
    revalidatePath("/admin/disciplines");
  });
}
