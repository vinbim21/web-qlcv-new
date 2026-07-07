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

// Tìm-hoặc-tạo Discipline theo code, trả về id (dùng khi người dùng nhập mới từ client).
export async function upsertDisciplineReturnId(code: string, name: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const c = code.trim();
    if (!c) throw new Error("Nhập tên bộ môn");
    const existing = await prisma.discipline.findUnique({ where: { code: c }, select: { id: true } });
    if (existing) return { id: existing.id };
    const created = await prisma.discipline.create({
      data: { code: c, name: name.trim() || c, order: 0 },
    });
    revalidatePath("/admin/catalog");
    revalidatePath("/admin/users");
    return { id: created.id };
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
