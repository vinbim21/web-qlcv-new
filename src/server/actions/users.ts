"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { userCreateSchema, userUpdateSchema } from "@/lib/schemas/admin";
import { runAction } from "./_helpers";

export async function createUser(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = userCreateSchema.parse(input);
    const passwordHash = await bcrypt.hash(data.password || "Qlcv@12345", 10);
    await prisma.user.create({
      data: {
        username: data.username,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        disciplineId: data.disciplineId || null,
        passwordHash,
        isActive: data.isActive ?? true,
      },
    });
    revalidatePath("/admin/users");
  });
}

export async function updateUser(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = userUpdateSchema.parse(input);
    await prisma.user.update({
      where: { id: data.id },
      data: {
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        disciplineId: data.disciplineId || null,
        isActive: data.isActive,
      },
    });
    revalidatePath("/admin/users");
  });
}

export async function resetUserPassword(id: string, newPassword: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    if (newPassword.length < 8) throw new Error("Mật khẩu tối thiểu 8 ký tự");
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    revalidatePath("/admin/users");
  });
}

export async function toggleUserActive(id: string, isActive: boolean) {
  return runAction(async () => {
    await requireRole("ADMIN");
    await prisma.user.update({ where: { id }, data: { isActive } });
    revalidatePath("/admin/users");
  });
}
