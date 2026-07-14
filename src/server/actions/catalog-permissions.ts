"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { CATALOG_PERMISSION_COLUMNS, type CatalogPermissionColumn } from "@/server/data/catalog-permissions";
import { runAction } from "./_helpers";

export async function listCatalogColumnPermissions() {
  return runAction(async () => {
    await requireRole("ADMIN");
    const rows = await prisma.catalogColumnPermission.findMany({
      include: {
        user: { select: { id: true, fullName: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      column: r.column,
      userId: r.userId,
      userName: r.user?.fullName ?? null,
      departmentId: r.departmentId,
      departmentName: r.department?.name ?? null,
    }));
  });
}

export async function grantCatalogColumnPermission(input: {
  column: string;
  userId?: string | null;
  departmentId?: string | null;
}) {
  return runAction(async () => {
    await requireRole("ADMIN");
    if (!CATALOG_PERMISSION_COLUMNS.includes(input.column as CatalogPermissionColumn)) {
      throw new Error("Cột không hợp lệ");
    }
    const userId = input.userId || null;
    const departmentId = input.departmentId || null;
    if (!userId && !departmentId) throw new Error("Chọn người dùng hoặc bộ phận");
    if (userId && departmentId) throw new Error("Chỉ chọn 1 trong 2: người dùng hoặc bộ phận");

    const dup = await prisma.catalogColumnPermission.findFirst({
      where: { column: input.column, userId, departmentId },
    });
    if (dup) throw new Error("Đã cấp quyền này rồi");

    await prisma.catalogColumnPermission.create({
      data: { column: input.column, userId, departmentId },
    });
    revalidatePath("/admin/catalog", "layout");
  });
}

export async function revokeCatalogColumnPermission(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    await prisma.catalogColumnPermission.delete({ where: { id } });
    revalidatePath("/admin/catalog", "layout");
  });
}
