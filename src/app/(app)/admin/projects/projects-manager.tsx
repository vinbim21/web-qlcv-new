"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_OPTIONS } from "@/lib/labels";
import { removeVietnameseTones } from "@/lib/utils";
import { deleteProject, saveProject } from "@/server/actions/projects";

type Item = {
  id: string;
  code: string;
  name: string;
  status: string;
  constructionTypeId: string;
  startDate: string;
  endDate: string;
  description: string;
  taskCount: number;
};

type CtOpt = { id: string; name: string };

export function ProjectsManager({ items, constructionTypes }: { items: Item[]; constructionTypes: CtOpt[] }) {
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [creating, setCreating] = React.useState(false);

  const filtered = items.filter((p) => {
    const q = removeVietnameseTones(search);
    return removeVietnameseTones(p.name).includes(q) || p.code.toLowerCase().includes(q);
  });

  async function onDelete(item: Item) {
    if (!confirm(`Xóa dự án "${item.name}"?`)) return;
    const res = await deleteProject(item.id);
    if (res.ok) toast.success("Đã xóa");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dự án</h1>
          <p className="text-sm text-muted-foreground">Danh mục dự án</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Thêm dự án
        </Button>
      </div>

      <Input
        placeholder="Tìm mã / tên dự án..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Tên dự án</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Số công việc</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono">{p.code}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{PROJECT_STATUS_LABEL[p.status] ?? p.status}</Badge>
                </TableCell>
                <TableCell>{p.taskCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(p)} title="Sửa">
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(p)} title="Xóa">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Chưa có dự án
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {(creating || editing) ? (
        <ProjectDialog
          item={editing ?? undefined}
          constructionTypes={constructionTypes}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectDialog({
  item,
  constructionTypes,
  onClose,
}: {
  item?: Item;
  constructionTypes: CtOpt[];
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await saveProject({
      id: item?.id,
      code: String(fd.get("code") || ""),
      name: String(fd.get("name") || ""),
      status: String(fd.get("status") || "DANG_THUC_HIEN"),
      constructionTypeId: (fd.get("constructionTypeId") as string) || null,
      startDate: (fd.get("startDate") as string) || null,
      endDate: (fd.get("endDate") as string) || null,
      description: (fd.get("description") as string) || null,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Đã lưu");
      onClose();
    } else toast.error(res.error);
  }
  return (
    <Modal open onClose={onClose} title={item ? "Sửa dự án" : "Thêm dự án"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">Mã</Label>
            <Input id="code" name="code" defaultValue={item?.code} required />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="name">Tên dự án</Label>
            <Input id="name" name="name" defaultValue={item?.name} required />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="status">Trạng thái</Label>
            <Select id="status" name="status" defaultValue={item?.status ?? "DANG_THUC_HIEN"}>
              {PROJECT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startDate">Bắt đầu</Label>
            <DateInput id="startDate" name="startDate" defaultValue={item?.startDate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endDate">Kết thúc</Label>
            <DateInput id="endDate" name="endDate" defaultValue={item?.endDate} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="constructionTypeId">Loại hình công trình</Label>
          <Select id="constructionTypeId" name="constructionTypeId" defaultValue={item?.constructionTypeId ?? ""}>
            <option value="">— Chưa xác định —</option>
            {constructionTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Textarea id="description" name="description" defaultValue={item?.description} />
        </div>
        <div className="flex justify-end gap-2">
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
