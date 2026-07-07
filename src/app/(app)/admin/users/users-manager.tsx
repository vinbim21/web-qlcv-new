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
import { SearchableCombobox } from "@/components/searchable-combobox";
import { ROLE_LABEL, ROLE_OPTIONS } from "@/lib/labels";
import { removeVietnameseTones } from "@/lib/utils";
import { createUser, resetUserPassword, updateUser } from "@/server/actions/users";
import { upsertDepartmentReturnId } from "@/server/actions/departments";
import { upsertDisciplineReturnId } from "@/server/actions/disciplines";

type UserRow = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  disciplineId: string | null;
  disciplineName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isActive: boolean;
};

type Discipline = { id: string; name: string };
type Department = { id: string; name: string };

export function UsersManager({
  users,
  disciplines,
  departments,
}: {
  users: UserRow[];
  disciplines: Discipline[];
  departments: Department[];
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
              <TableHead>Bộ phận</TableHead>
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
                <TableCell>{u.departmentName ?? "—"}</TableCell>
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
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Không có người dùng
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {creating ? (
        <UserDialog disciplines={disciplines} departments={departments} onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <UserDialog user={editing} disciplines={disciplines} departments={departments} onClose={() => setEditing(null)} />
      ) : null}
      {pwUser ? <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} /> : null}
    </div>
  );
}

function UserDialog({
  user,
  disciplines,
  departments,
  onClose,
}: {
  user?: UserRow;
  disciplines: Discipline[];
  departments: Department[];
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [disciplineName, setDisciplineName] = React.useState(user?.disciplineName ?? "");
  const [departmentName, setDepartmentName] = React.useState(user?.departmentName ?? "");

  // Tên → id: khớp mục có sẵn, hoặc tạo mới (tìm-hoặc-tạo theo tên) nếu người dùng gõ tên chưa có.
  async function resolveDisciplineId(): Promise<string | null> {
    const name = disciplineName.trim();
    if (!name) return null;
    const found = disciplines.find((d) => d.name === name);
    if (found) return found.id;
    const res = await upsertDisciplineReturnId(name, name);
    if (!res.ok) throw new Error(res.error);
    if (!res.data) throw new Error("Không tạo được bộ môn mới");
    return res.data.id;
  }
  async function resolveDepartmentId(): Promise<string | null> {
    const name = departmentName.trim();
    if (!name) return null;
    const found = departments.find((d) => d.name === name);
    if (found) return found.id;
    const res = await upsertDepartmentReturnId(name, name);
    if (!res.ok) throw new Error(res.error);
    if (!res.data) throw new Error("Không tạo được bộ phận mới");
    return res.data.id;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      const disciplineId = await resolveDisciplineId();
      const departmentId = await resolveDepartmentId();
      const payload = {
        id: user?.id,
        username: String(fd.get("username") || ""),
        fullName: String(fd.get("fullName") || ""),
        email: String(fd.get("email") || ""),
        role: String(fd.get("role") || "LEVEL_2") as "ADMIN" | "LEVEL_1" | "LEVEL_2" | "LEVEL_3",
        disciplineId,
        departmentId,
        isActive: fd.get("isActive") === "on",
        ...(user ? {} : { password: (fd.get("password") as string) || undefined }),
      };
      const res = user ? await updateUser(payload) : await createUser(payload);
      if (res.ok) {
        toast.success(user ? "Đã cập nhật" : "Đã thêm người dùng");
        onClose();
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setPending(false);
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
            <Select id="role" name="role" defaultValue={user?.role ?? "LEVEL_2"}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bộ môn</Label>
            <SearchableCombobox
              creatable
              value={disciplineName}
              options={disciplines.map((d) => d.name)}
              placeholder="— Không —"
              className="h-9"
              onChange={setDisciplineName}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Bộ phận</Label>
          <SearchableCombobox
            creatable
            value={departmentName}
            options={departments.map((d) => d.name)}
            placeholder="— Không —"
            className="h-9"
            onChange={setDepartmentName}
          />
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
