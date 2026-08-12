import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/config.base";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Bảo vệ mọi route trừ static, image, favicon, API auth và API cron.
  //
  // `api/cron` phải nằm ngoài: job chạy ngầm không có session nên NextAuth sẽ đá về /login,
  // endpoint không bao giờ chạy được. Nó tự bảo vệ bằng `CRON_SECRET` (so sánh timing-safe)
  // trong chính route handler — xem src/app/api/cron/smartsheet/route.ts.
  matcher: [
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)",
  ],
};
