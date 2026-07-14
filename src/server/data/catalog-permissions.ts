import { prisma } from "@/server/db/client";
import { CATALOG_PERMISSION_COLUMNS, type CatalogPermissionColumn } from "@/lib/catalog-permission-columns";

export { CATALOG_PERMISSION_COLUMNS, CATALOG_PERMISSION_COLUMN_LABEL, type CatalogPermissionColumn } from "@/lib/catalog-permission-columns";

/** Danh sách cột (trong 4 cột trên) mà user hiện tại được sửa ở Hạng mục — ADMIN được cả 4. */
export async function getEditableCatalogColumns(userId: string, role: string): Promise<CatalogPermissionColumn[]> {
  if (role === "ADMIN") return [...CATALOG_PERMISSION_COLUMNS];
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  const grants = await prisma.catalogColumnPermission.findMany({
    where: {
      OR: [{ userId }, ...(user?.departmentId ? [{ departmentId: user.departmentId }] : [])],
    },
    select: { column: true },
  });
  const set = new Set(grants.map((g) => g.column));
  return CATALOG_PERMISSION_COLUMNS.filter((c) => set.has(c));
}
