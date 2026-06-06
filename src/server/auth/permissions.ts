import { auth } from "./config";

export type Role = "ADMIN" | "LEVEL_1" | "LEVEL_2" | "LEVEL_3";

/** Lấy session, ném lỗi nếu chưa đăng nhập. Dùng trong Server Action. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Chưa đăng nhập");
  return session.user;
}

/** Yêu cầu một trong các role; ném lỗi nếu không đủ quyền. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role as Role)) {
    throw new Error("Không đủ quyền thực hiện thao tác này");
  }
  return user;
}

export function isAdmin(role?: string) {
  return role === "ADMIN";
}

/** ADMIN và LEVEL_1 được quản lý công việc/dự án; LEVEL_2 tự cập nhật việc của mình. */
export function canManage(role?: string) {
  return role === "ADMIN" || role === "LEVEL_1";
}

/** Được tạo & giao việc mới: ADMIN, LEVEL_1, LEVEL_2 (LEVEL_3 chỉ xem). */
export function canAssign(role?: string) {
  return role === "ADMIN" || role === "LEVEL_1" || role === "LEVEL_2";
}

/** Được xem báo cáo nhạy cảm (toàn phòng, theo nhân sự, định mức): ADMIN, LEVEL_1, LEVEL_2. */
export function canViewPersonReports(role?: string) {
  return role === "ADMIN" || role === "LEVEL_1" || role === "LEVEL_2";
}

/**
 * Được vào trang Báo cáo: mọi vai trò (đã đăng nhập).
 * LEVEL_3 vào được nhưng chỉ thấy dữ liệu của CHÍNH MÌNH (self-only) — xem `canViewPersonReports`.
 */
export function canViewReports(role?: string) {
  return role === "ADMIN" || role === "LEVEL_1" || role === "LEVEL_2" || role === "LEVEL_3";
}
