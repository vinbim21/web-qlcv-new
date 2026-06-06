"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deletePhase,
  deleteWorkGroup,
  savePhase,
  saveWorkGroup,
} from "@/server/actions/catalog";
import {
  deleteConstructionType,
  saveConstructionType,
} from "@/server/actions/construction-types";
import type { Result } from "@/server/actions/_helpers";

type Item = { id: string; code: string; name: string; order: number; abbr?: string | null };
type Kind = "wg" | "phase" | "ct";

const SAVE: Record<Kind, (input: unknown) => Promise<Result<unknown>>> = {
  wg: saveWorkGroup,
  phase: savePhase,
  ct: saveConstructionType,
};
const DELETE: Record<Kind, (id: string) => Promise<Result<unknown>>> = {
  wg: deleteWorkGroup,
  phase: deletePhase,
  ct: deleteConstructionType,
};

export function CatalogManager({
  workGroups,
  phases,
  constructionTypes,
}: {
  workGroups: Item[];
  phases: Item[];
  constructionTypes: Item[];
}) {
  const [dialog, setDialog] = React.useState<{ kind: Kind; item?: Item } | null>(null);

  async function onDelete(kind: Kind, item: Item) {
    if (!confirm(`Xóa "${item.name}"?`)) return;
    const res = await DELETE[kind](item.id);
    if (res.ok) toast.success("Đã xóa");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Khai báo danh mục</h1>
        <p className="text-sm text-muted-foreground">
          Nhóm công việc (Level 1), Giai đoạn dự án và Loại hình công trình
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CatalogTable
          title="Nhóm công việc"
          items={workGroups}
          showAbbr
          onAdd={() => setDialog({ kind: "wg" })}
          onEdit={(item) => setDialog({ kind: "wg", item })}
          onDelete={(item) => onDelete("wg", item)}
          detailHref={(item) => `/admin/catalog/${item.id}`}
        />
        <CatalogTable
          title="Giai đoạn"
          items={phases}
          onAdd={() => setDialog({ kind: "phase" })}
          onEdit={(item) => setDialog({ kind: "phase", item })}
          onDelete={(item) => onDelete("phase", item)}
        />
        <CatalogTable
          title="Loại hình công trình"
          items={constructionTypes}
          onAdd={() => setDialog({ kind: "ct" })}
          onEdit={(item) => setDialog({ kind: "ct", item })}
          onDelete={(item) => onDelete("ct", item)}
        />
      </div>

      {dialog ? (
        <EditDialog kind={dialog.kind} item={dialog.item} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function CatalogTable({
  title,
  items,
  showAbbr = false,
  onAdd,
  onEdit,
  onDelete,
  detailHref,
}: {
  title: string;
  items: Item[];
  showAbbr?: boolean;
  onAdd: () => void;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  detailHref?: (item: Item) => string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <Button size="sm" onClick={onAdd}>
          <Plus className="size-4" /> Thêm
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Mã</TableHead>
              {showAbbr ? <TableHead className="w-24">Viết tắt</TableHead> : null}
              <TableHead>Tên</TableHead>
              <TableHead className="w-24 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono">{it.code}</TableCell>
                {showAbbr ? (
                  <TableCell className="font-mono">{it.abbr || "—"}</TableCell>
                ) : null}
                <TableCell className="font-medium">{it.name}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {detailHref ? (
                      <Link
                        href={detailHref(it)}
                        title="Sửa danh mục Level 2/3/5"
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                      >
                        <Pencil className="size-4" />
                      </Link>
                    ) : (
                      <Button size="icon" variant="ghost" onClick={() => onEdit(it)} title="Sửa">
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => onDelete(it)} title="Xóa">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showAbbr ? 4 : 3} className="py-6 text-center text-muted-foreground">
                  Chưa có mục nào
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  kind,
  item,
  onClose,
}: {
  kind: Kind;
  item?: Item;
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const title =
    kind === "wg" ? "Nhóm công việc" : kind === "phase" ? "Giai đoạn" : "Loại hình công trình";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await SAVE[kind]({
      id: item?.id,
      code: String(fd.get("code") || ""),
      name: String(fd.get("name") || ""),
      abbr: kind === "wg" ? String(fd.get("abbr") || "") : undefined,
      order: Number(fd.get("order") || 0),
    });
    setPending(false);
    if (res.ok) {
      toast.success("Đã lưu");
      onClose();
    } else toast.error(res.error);
  }

  return (
    <Modal open onClose={onClose} title={`${item ? "Sửa" : "Thêm"} ${title.toLowerCase()}`}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">Mã</Label>
            <Input id="code" name="code" defaultValue={item?.code} required />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="name">Tên</Label>
            <Input id="name" name="name" defaultValue={item?.name} required autoFocus />
          </div>
        </div>
        {kind === "wg" ? (
          <div className="space-y-1.5">
            <Label htmlFor="abbr">Viết tắt (tiền tố Id, vd XD → XD-001)</Label>
            <Input
              id="abbr"
              name="abbr"
              defaultValue={item?.abbr ?? ""}
              placeholder="XD"
              maxLength={6}
              className="uppercase"
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="order">Thứ tự hiển thị</Label>
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
