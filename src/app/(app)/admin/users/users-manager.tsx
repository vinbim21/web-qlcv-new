"use client";

import { KeyRound, Pencil, UserPlus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABEL, ROLE_OPTIONS } from "@/lib/labels";
import { removeVietnameseTones } from "@/lib/utils";
import { createUser, resetUserPassword, updateUser } from "@/server/actions/users";

type UserRow = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  disciplineId: string | null;
  disciplineName: string | null;
  isActive: boolean;
};

type Discipline = { id: string; name: string };

export function UsersManager({
  users,
  disciplines,
}: {
  users: UserRow[];
  disciplines: Discipline[];
}) {
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [pwUser, setPwUser] = React.useState<UserRow | null>(null);

  const filtered = users.filter((u) => {
    const q = removeVietnameseTones(search);
    return (
      removeVietnameseTones(u.fullName).includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Người dùng</h1>
          <p className="text-sm text-muted-foreground">Quản lý tài khoản và phân quyền</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus className="size-4" /> Thêm người dùng
        </Button>
      </div>

      <Input
        placeholder="Tìm theo tên, tài khoản, email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ tên</TableHead>
              <TableHead>Tài khoản</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Bộ môn</TableHead>
              <TableHead>Quyền</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.fullName}</TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>{u.disciplineName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "success" : "outline"}>
                    {u.isActive ? "Hoạt động" : "Khóa"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Sửa" onClick={() => setEditing(u)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Đặt lại mật khẩu"
                      onClick={() => setPwUser(u)}
                    >
                      <KeyRound className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Không có người dùng
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {creating ? (
        <UserDialog disciplines={disciplines} onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <UserDialog user={editing} disciplines={disciplines} onClose={() => setEditing(null)} />
      ) : null}
      {pwUser ? <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} /> : null}
    </div>
  );
}

function UserDialog({
  user,
  disciplines,
  onClose,
}: {
  user?: UserRow;
  disciplines: Discipline[];
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      id: user?.id,
      username: String(fd.get("username") || ""),
      fullName: String(fd.get("fullName") || ""),
      email: String(fd.get("email") || ""),
      role: String(fd.get("role") || "MEMBER") as "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER",
      disciplineId: (fd.get("disciplineId") as string) || null,
      isActive: fd.get("isActive") === "on",
      ...(user ? {} : { password: (fd.get("password") as string) || undefined }),
    };
    const res = user ? await updateUser(payload) : await createUser(payload);
    setPending(false);
    if (res.ok) {
      toast.success(user ? "Đã cập nhật" : "Đã thêm người dùng");
      onClose();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Modal open onClose={onClose} title={user ? "Sửa người dùng" : "Thêm người dùng"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Họ tên</Label>
          <Input id="fullName" name="fullName" defaultValue={user?.fullName} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="username">Tài khoản</Label>
            <Input
              id="username"
              name="username"
              defaultValue={user?.username}
              disabled={!!user}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={user?.email} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="role">Quyền</Label>
            <Select id="role" name="role" defaultValue={user?.role ?? "MEMBER"}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disciplineId">Bộ môn</Label>
            <Select id="disciplineId" name="disciplineId" defaultValue={user?.disciplineId ?? ""}>
              <option value="">— Không —</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {!user ? (
          <div className="space-y-1.5">
            <Label htmlFor="password">Mật khẩu (để trống → buộc đổi lần đầu)</Label>
            <Input id="password" name="password" type="text" placeholder="Qlcv@12345" />
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={user?.isActive ?? true} />
          Tài khoản hoạt động
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [pending, setPending] = React.useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await resetUserPassword(user.id, String(fd.get("newPassword") || ""));
    setPending(false);
    if (res.ok) {
      toast.success("Đã đặt lại mật khẩu (người dùng phải đổi khi đăng nhập)");
      onClose();
    } else {
      toast.error(res.error);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Đặt lại mật khẩu — ${user.fullName}`}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">Mật khẩu mới</Label>
          <Input id="newPassword" name="newPassword" type="text" required minLength={8} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Đặt lại"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
