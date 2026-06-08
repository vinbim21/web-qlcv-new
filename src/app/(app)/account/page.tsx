import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/labels";
import { auth } from "@/server/auth/config";
import { AccountPasswordForm } from "./account-password-form";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;
  const name = user.fullName ?? user.name ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tài khoản</h1>
        <p className="text-sm text-muted-foreground">Thông tin cá nhân và bảo mật.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Họ tên: </span>
            {name}
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            {user.email ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Vai trò: </span>
            {ROLE_LABEL[user.role] ?? user.role}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
