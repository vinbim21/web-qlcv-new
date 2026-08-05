import { prisma } from "@/server/db/client";
import { CATALOG_PERMISSION_COLUMNS, type CatalogPermissionColumn } from "@/lib/catalog-permission-columns";

export { CATALOG_PERMISSION_COLUMNS, CATALOG_PERMISSION_COLUMN_LABEL, type CatalogPermissionColumn } from "@/lib/catalog-permission-columns";

/**
 * 3 cột tiến độ MỌI NGƯỜI đều sửa được, không cần cấp quyền riêng (yêu cầu 2026-08-05).
 * Các cột còn lại (hiện là "description") vẫn phải được cấp quyền theo user/bộ phận.
 */
const PUBLIC_EDITABLE_COLUMNS: CatalogPermissionColumn[] = ["startDate", "packagingDate", "scale"];

/**
 * Danh sách cột (trong 4 cột trên) mà user hiện tại được sửa ở Hạng mục.
 * ADMIN được cả 4; mọi vai trò khác luôn có 3 cột tiến độ + các cột được cấp quyền thêm.
 * Hàm này là NGUỒN DUY NHẤT cho cả 2 phía: trang /admin/catalog dùng để bật/tắt ô sửa,
 * và batchUpdateCatalogProjects dùng để chặn ghi — nên sửa ở đây là đồng bộ cả hai.
 */
export async function getEditableCatalogColumns(userId: string, role: string): Promise<CatalogPermissionColumn[]> {
  if (role === "ADMIN") return [...CATALOG_PERMISSION_COLUMNS];
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  const grants = await prisma.catalogColumnPermission.findMany({
    where: {
      OR: [{ userId }, ...(user?.departmentId ? [{ departmentId: user.departmentId }] : [])],
    },
    select: { column: true },
  });
  const set = new Set<string>([...grants.map((g) => g.column), ...PUBLIC_EDITABLE_COLUMNS]);
  return CATALOG_PERMISSION_COLUMNS.filter((c) => set.has(c));
}
