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

export async function deleteConstructionType(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const used = await prisma.project.count({ where: { constructionTypeId: id } });
    if (used > 0) throw new Error("Loại hình đang được dùng cho dự án, không thể xóa");
    await prisma.constructionType.delete({ where: { id } });
    revalidatePath("/admin/catalog");
  });
}
