"use server";

import { revalidatePath } from "next/cache";
import { constructionTypeSchema } from "@/lib/schemas/admin";
import { requireRole } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { runAction } from "./_helpers";

export async function saveConstructionType(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = constructionTypeSchema.parse(input);
    if (data.id) {
      await prisma.constructionType.update({
        where: { id: data.id },
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    } else {
      await prisma.constructionType.create({
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    }
    revalidatePath("/admin/catalog");
  });
}

// Tìm-hoặc-tạo ConstructionType theo code, trả về id (dùng khi người dùng nhập mới từ client).
export async function upsertConstructionTypeReturnId(code: string, name: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const c = code.trim();
    if (!c) throw new Error("Nhập mã loại hình");
    const existing = await prisma.constructionType.findUnique({ where: { code: c }, select: { id: true } });
    if (existing) return { id: existing.id };
    const created = await prisma.constructionType.create({
      data: { code: c, name: name.trim() || c, order: 0 },
    });
    revalidatePath("/admin/catalog");
    return { id: created.id };
  });
}

export async function deleteConstructionType(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const used = await prisma.project.count({ where: { constructionTypeId: id } });
    if (used > 0) throw new Error("Loại hình đang được dùng cho dự án, không thể xóa");
    await prisma.constructionType.delete({ where: { id } });
    revalidatePath("/admin/catalog");
  });
}
