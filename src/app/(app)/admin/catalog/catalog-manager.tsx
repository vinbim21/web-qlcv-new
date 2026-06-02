"use client";

import { Pencil } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updatePhase, updateWorkGroup } from "@/server/actions/catalog";

type Item = { id: string; code: string; name: string; order: number };

export function CatalogManager({
  workGroups,
  phases,
}: {
  workGroups: Item[];
  phases: Item[];
}) {
  const [editing, setEditing] = React.useState<{ item: Item; kind: "wg" | "phase" } | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Danh mục</h1>
        <p className="text-sm text-muted-foreground">
          Nhóm công việc (Level 1) và Giai đoạn dự án
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CatalogTable
          title="Nhóm công việc"
          items={workGroups}
          onEdit={(item) => setEditing({ item, kind: "wg" })}
        />
        <CatalogTable
          title="Giai đoạn"
          items={phases}
          onEdit={(item) => setEditing({ item, kind: "phase" })}
        />
      </div>

      {editing ? (
        <EditDialog
          item={editing.item}
          kind={editing.kind}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function CatalogTable({
  title,
  items,
  onEdit,
}: {
  title: string;
  items: Item[];
  onEdit: (item: Item) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead className="text-right">Sửa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono">{it.code}</TableCell>
                <TableCell className="font-medium">{it.name}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(it)} title="Sửa">
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  item,
  kind,
  onClose,
}: {
  item: Item;
  kind: "wg" | "phase";
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      id: item.id,
      name: String(fd.get("name") || ""),
      order: Number(fd.get("order") || 0),
    };
    const res = kind === "wg" ? await updateWorkGroup(payload) : await updatePhase(payload);
    setPending(false);
    if (res.ok) {
      toast.success("Đã lưu");
      onClose();
    } else toast.error(res.error);
  }
  return (
    <Modal open onClose={onClose} title={`Sửa: ${item.code}`}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Tên</Label>
          <Input id="name" name="name" defaultValue={item.name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order">Thứ tự</Label>
          <Input id="order" name="order" type="number" defaultValue={item.order} />
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
