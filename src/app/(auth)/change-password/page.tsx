import { BrandLogo } from "@/components/brand-logo";
import { ChangePasswordForm } from "./change-password-form";

export default function ChangePasswordPage() {
  return (
    <div className="grid min-h-svh place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BrandLogo className="size-12" />
          <h1 className="text-xl font-semibold">Đổi mật khẩu</h1>
          <p className="text-sm text-muted-foreground">
            Vui lòng đặt mật khẩu mới trước khi tiếp tục
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
