"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { projectSchema } from "@/lib/schemas/project";
import { runAction } from "./_helpers";

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function saveProject(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN", "LEVEL_1");
    const data = projectSchema.parse(input);
    const payload = {
      code: data.code,
      name: data.name,
      status: data.status ?? "DANG_THUC_HIEN",
      startDate: toDate(data.startDate),
      endDate: toDate(data.endDate),
      description: data.description || null,
    };
    if (data.id) {
      await prisma.project.update({ where: { id: data.id }, data: payload });
    } else {
      await prisma.project.create({ data: payload });
    }
    revalidatePath("/admin/projects");
  });
}

export async function deleteProject(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const taskCount = await prisma.task.count({ where: { projectId: id, deletedAt: null } });
    if (taskCount > 0) throw new Error("Dự án còn công việc, không thể xóa");
    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/admin/projects");
  });
}
