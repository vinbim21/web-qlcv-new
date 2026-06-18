"use client";

import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { removeVietnameseTones } from "@/lib/utils";
import {
  addCatalogValue,
  deleteCatalogValue,
  saveWorkGroup,
  updateCatalogValue,
} from "@/server/actions/catalog";
import { deleteProject, saveBimProject } from "@/server/actions/projects";

type Item = { id: string; value: string };
type ProjectRow = { id: string; code: string; name: string; scale: string | null };

export function CatalogDetail({
  workGroupId,
  workGroupName,
  workGroupCode,
  workGroupAbbr,
  workGroupOrder,
  level2,
  level3,
  level5,
  isBim = false,
  projects = [],
}: {
  workGroupId: string;
  workGroupName: string;
  workGroupCode: string;
  workGroupAbbr?: string | null;
  workGroupOrder: number;
  level2: Item[];
  level3: Item[];
  level5: Item[];
  isBim?: boolean;
  projects?: ProjectRow[];
}) {
  const [editOpen, setEditOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/catalog" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{workGroupName}</h1>
            <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)} title="Sửa nhóm">
              <Pencil className="size-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Viết tắt: <span className="font-mono">{workGroupAbbr || "—"}</span>
            {isBim
              ? " · Khai báo Dự án (Level 2 = mã, Level 3 = tên, Quy mô CT) + Level 5 — Đầu việc"
              : " · Danh mục Level 2 / Level 3 / Level 5 (nguồn gợi ý khi tạo công việc)"}
          </p>
        </div>
      </div>

      {isBim ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ProjectTable projects={projects} />
          </div>
          <LevelColumn title="Level 5 — Đầu việc" workGroupId={workGroupId} level={5} items={level5} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <LevelColumn title="Level 2 — Loại hình" workGroupId={workGroupId} level={2} items={level2} />
          <LevelColumn title="Level 3 — Hạng mục" workGroupId={workGroupId} level={3} items={level3} />
          <LevelColumn title="Level 5 — Đầu việc" workGroupId={workGroupId} level={5} items={level5} />
        </div>
      )}

      {editOpen ? (
        <EditGroupDialog
          id={workGroupId}
          code={workGroupCode}
          name={workGroupName}
          abbr={workGroupAbbr}
          order={workGroupOrder}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </div>
  );
}

function EditGroupDialog({
  id,
  code,
  name,
  abbr,
  order,
  onClose,
}: {
  id: string;
  code: string;
  name: string;
  abbr?: string | null;
  order: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await saveWorkGroup({
      id,
      code: String(fd.get("code") || ""),
      name: String(fd.get("name") || ""),
      abbr: String(fd.get("abbr") || ""),
      order,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Đã lưu");
      onClose();
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <Modal open onClose={onClose} title="Sửa nhóm công việc">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">Mã</Label>
            <Input id="code" name="code" defaultValue={code} required />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="name">Tên</Label>
            <Input id="name" name="name" defaultValue={name} required autoFocus />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="abbr">Viết tắt (tiền tố Id, vd XD → XD-001)</Label>
          <Input
            id="abbr"
            name="abbr"
            defaultValue={abbr ?? ""}
            placeholder="XD"
            maxLength={6}
            className="uppercase"
          />
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

export function LevelColumn({
  title,
  workGroupId,
  level,
  items,
}: {
  title: string;
  workGroupId: string;
  level: number;
  items: Item[];
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editVal, setEditVal] = React.useState("");

  const q = removeVietnameseTones(search);
  const shown = search ? items.filter((i) => removeVietnameseTones(i.value).includes(q)) : items;

  async function add() {
    const v = adding.trim();
    if (!v) return;
    setPending(true);
    const res = await addCatalogValue(workGroupId, level, v);
    setPending(false);
    if (res.ok) {
      setAdding("");
      toast.success("Đã thêm");
      router.refresh();
    } else toast.error(res.error);
  }
  async function save(id: string) {
    const res = await updateCatalogValue(id, editVal);
    if (res.ok) {
      setEditId(null);
      toast.success("Đã lưu");
      router.refresh();
    } else toast.error(res.error);
  }
  async function remove(it: Item) {
    if (!confirm(`Xóa "${it.value}"?`)) return;
    const res = await deleteCatalogValue(it.id);
    if (res.ok) {
      toast.success("Đã xóa");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {title} <span className="text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Thêm giá trị mới..."
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button size="icon" onClick={add} disabled={pending} title="Thêm">
            <Plus className="size-4" />
          </Button>
        </div>
        {items.length > 8 ? (
          <Input
            placeholder="Lọc..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
        ) : null}

        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {shown.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
            >
              {editId === it.id ? (
                <>
                  <Input
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    className="h-7"
                    autoFocus
                  />
                  <button type="button" onClick={() => save(it.id)} title="Lưu">
                    <Check className="size-4 text-emerald-600" />
                  </button>
                  <button type="button" onClick={() => setEditId(null)} title="Hủy">
                    <X className="size-4 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">{it.value}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(it.id);
                      setEditVal(it.value);
                    }}
                    title="Sửa"
                  >
                    <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button type="button" onClick={() => remove(it)} title="Xóa">
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </>
              )}
            </div>
          ))}
          {shown.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Chưa có giá trị</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// Bảng Dự án cho nhóm Quản lý BIM: mỗi dòng = 1 dự án (Level 2 = mã, Level 3 = tên, Quy mô CT).
function ProjectTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({ code: "", name: "", scale: "" });
  const [adding, setAdding] = React.useState({ code: "", name: "", scale: "" });

  const q = removeVietnameseTones(search);
  const shown = search
    ? projects.filter((p) =>
        removeVietnameseTones(`${p.code} ${p.name} ${p.scale ?? ""}`).includes(q)
      )
    : projects;

  async function add() {
    if (!adding.code.trim() || !adding.name.trim()) {
      toast.error("Nhập mã (Level 2) và tên (Level 3)");
      return;
    }
    setPending(true);
    const res = await saveBimProject(adding);
    setPending(false);
    if (res.ok) {
      setAdding({ code: "", name: "", scale: "" });
      toast.success("Đã thêm dự án");
      router.refresh();
    } else toast.error(res.error);
  }
  async function save(id: string) {
    setPending(true);
    const res = await saveBimProject({ id, ...draft });
    setPending(false);
    if (res.ok) {
      setEditId(null);
      toast.success("Đã lưu");
      router.refresh();
    } else toast.error(res.error);
  }
  async function remove(p: ProjectRow) {
    if (!confirm(`Xóa dự án "${p.code} — ${p.name}"?`)) return;
    const res = await deleteProject(p.id);
    if (res.ok) {
      toast.success("Đã xóa");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Dự án <span className="text-muted-foreground">({projects.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Dòng thêm mới */}
        <div className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-2">
          <Input
            placeholder="Level 2 — Mã"
            value={adding.code}
            onChange={(e) => setAdding((s) => ({ ...s, code: e.target.value }))}
          />
          <Input
            placeholder="Level 3 — Tên"
            value={adding.name}
            onChange={(e) => setAdding((s) => ({ ...s, name: e.target.value }))}
          />
          <Input
            placeholder="Quy mô CT"
            value={adding.scale}
            onChange={(e) => setAdding((s) => ({ ...s, scale: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button size="icon" onClick={add} disabled={pending} title="Thêm dự án">
            <Plus className="size-4" />
          </Button>
        </div>

        {projects.length > 8 ? (
          <Input
            placeholder="Lọc..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
        ) : null}

        {/* Tiêu đề cột */}
        <div className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-2 px-2 pt-1 text-xs font-medium text-muted-foreground">
          <span>Level 2 — Mã</span>
          <span>Level 3 — Tên</span>
          <span>Quy mô CT</span>
          <span className="w-12 text-right">Thao tác</span>
        </div>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {shown.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_1.5fr_1fr_auto] items-center gap-2 rounded-md border px-2 py-1 text-sm"
            >
              {editId === p.id ? (
                <>
                  <Input
                    value={draft.code}
                    onChange={(e) => setDraft((s) => ({ ...s, code: e.target.value }))}
                    className="h-7"
                    autoFocus
                  />
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
                    className="h-7"
                  />
                  <Input
                    value={draft.scale}
                    onChange={(e) => setDraft((s) => ({ ...s, scale: e.target.value }))}
                    className="h-7"
                  />
                  <div className="flex w-12 justify-end gap-1">
                    <button type="button" onClick={() => save(p.id)} title="Lưu">
                      <Check className="size-4 text-emerald-600" />
                    </button>
                    <button type="button" onClick={() => setEditId(null)} title="Hủy">
                      <X className="size-4 text-muted-foreground" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="truncate font-mono">{p.code}</span>
                  <span className="truncate">{p.name}</span>
                  <span className="truncate text-muted-foreground">{p.scale || "—"}</span>
                  <div className="flex w-12 justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(p.id);
                        setDraft({ code: p.code, name: p.name, scale: p.scale ?? "" });
                      }}
                      title="Sửa"
                    >
                      <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button type="button" onClick={() => remove(p)} title="Xóa">
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {shown.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Chưa có dự án</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
