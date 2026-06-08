"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { changePasswordAction } from "@/server/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Đang lưu..." : "Đổi mật khẩu"}
    </Button>
  );
}

export function AccountPasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("Đã đổi mật khẩu thành công");
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="max-w-md space-y-4">
      {/* Báo cho action ở lại trang + hiện toast thay vì redirect về dashboard */}
      <input type="hidden" name="stay" value="1" />
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">Mật khẩu mới</Label>
        <Input id="newPassword" name="newPassword" type="password" required />
        <p className="text-xs text-muted-foreground">Tối thiểu 8 ký tự.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton />
    </form>
  );
}
