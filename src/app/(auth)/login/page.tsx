import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-svh place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BrandLogo className="size-12" />
          <h1 className="text-xl font-semibold">Web QLCV — Phòng BIM</h1>
          <p className="text-sm text-muted-foreground">Đăng nhập để tiếp tục</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
