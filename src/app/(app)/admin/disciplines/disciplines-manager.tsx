"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteDiscipline, saveDiscipline } from "@/server/actions/disciplines";

type Item = { id: string; code: string; name: string; order: number };

export function DisciplinesManager({ items }: { items: Item[] }) {
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function onDelete(item: Item) {
    if (!confirm(`Xóa bộ môn "${item.name}"?`)) return;
    const res = await deleteDiscipline(item.id);
    if (res.ok) toast.success("Đã xóa");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Khai báo bộ môn</h1>
          <p className="text-sm text-muted-foreground">Danh mục bộ môn / tổ (Level 4)</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Thêm
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead>Thứ tự</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono">{d.code}</TableCell>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{d.order}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(d)} title="Sửa">
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(d)} title="Xóa">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(creating || editing) ? (
        <DisciplineDialog
          item={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DisciplineDialog({ item, onClose }: { item?: Item; onClose: () => void }) {
  const [pending, setPending] = React.useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await saveDiscipline({
      id: item?.id,
      code: String(fd.get("code") || ""),
      name: String(fd.get("name") || ""),
      order: Number(fd.get("order") || 0),
    });
    setPending(false);
    if (res.ok) {
      toast.success("Đã lưu");
      onClose();
    } else toast.error(res.error);
  }
  return (
    <Modal open onClose={onClose} title={item ? "Sửa bộ môn" : "Thêm bộ môn"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">Mã</Label>
            <Input id="code" name="code" defaultValue={item?.code} required />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="name">Tên</Label>
            <Input id="name" name="name" defaultValue={item?.name} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order">Thứ tự</Label>
          <Input id="order" name="order" type="number" defaultValue={item?.order ?? 0} />
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
