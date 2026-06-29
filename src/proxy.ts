import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/config.base";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Bảo vệ mọi route trừ static, image, favicon và API auth
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)"],
};
