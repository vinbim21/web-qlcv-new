import { auth } from "./config";

export type Role = "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";

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

/** ADMIN và MANAGER được quản lý công việc/dự án; MEMBER tự cập nhật việc của mình. */
export function canManage(role?: string) {
  return role === "ADMIN" || role === "MANAGER";
}
