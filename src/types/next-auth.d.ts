import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    fullName: string;
    mustChangePassword: boolean;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      fullName: string;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    fullName: string;
    mustChangePassword: boolean;
  }
}
