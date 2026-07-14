// Lưu ý: KHÔNG chặn ADMIN-only ở đây nữa — /admin/catalog (Khai báo thông tin)
// mở cho mọi vai trò xem (chỉ ADMIN hoặc user được cấp quyền cột mới sửa được).
// Các trang admin thực sự chỉ-ADMIN (/admin/users, /admin/projects) tự chặn ở page.tsx riêng.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
