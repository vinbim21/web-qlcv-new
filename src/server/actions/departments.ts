"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { departmentSchema } from "@/lib/schemas/admin";
import { runAction } from "./_helpers";

export async function saveDepartment(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = departmentSchema.parse(input);
    if (data.id) {
      await prisma.department.update({
        where: { id: data.id },
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    } else {
      await prisma.department.create({
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    }
    revalidatePath("/admin/catalog");
    revalidatePath("/admin/users");
  });
}

// Tìm-hoặc-tạo Department theo code, trả về id (dùng khi người dùng nhập mới từ client).
export async function upsertDepartmentReturnId(code: string, name: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const c = code.trim();
    if (!c) throw new Error("Nhập tên bộ phận");
    const existing = await prisma.department.findUnique({ where: { code: c }, select: { id: true } });
    if (existing) return { id: existing.id };
    const created = await prisma.department.create({
      data: { code: c, name: name.trim() || c, order: 0 },
    });
    revalidatePath("/admin/catalog");
    revalidatePath("/admin/users");
    return { id: created.id };
  });
}

export async function deleteDepartment(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const used = await prisma.user.count({ where: { departmentId: id } });
    if (used > 0) throw new Error("Bộ phận đang được sử dụng, không thể xóa");
    await prisma.department.delete({ where: { id } });
    revalidatePath("/admin/catalog");
    revalidatePath("/admin/users");
  });
}
