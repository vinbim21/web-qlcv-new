/**
 * Cột "vận hành" của Hạng mục (Project) có thể cấp quyền sửa riêng cho user không phải ADMIN.
 * File này KHÔNG import prisma — dùng an toàn ở cả client và server.
 */
export const CATALOG_PERMISSION_COLUMNS = ["startDate", "packagingDate", "scale", "description"] as const;
export type CatalogPermissionColumn = (typeof CATALOG_PERMISSION_COLUMNS)[number];

export const CATALOG_PERMISSION_COLUMN_LABEL: Record<CatalogPermissionColumn, string> = {
  startDate: "Bắt đầu",
  packagingDate: "Đóng gói",
  scale: "Quy mô",
  description: "Mô tả",
};
