import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    fullName: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      fullName: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    fullName: string;
  }
}
