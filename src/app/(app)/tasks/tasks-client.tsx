"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { UserMultiSelect } from "@/components/user-multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
  priorityVariant,
  statusVariant,
} from "@/lib/labels";
import { cn, removeVietnameseTones } from "@/lib/utils";
import { deleteTask, saveTask, updateTaskStatus } from "@/server/actions/tasks";

type Opt = { id: string; name: string };
type UserOpt = { id: string; fullName: string };

export type TaskRow = {
  id: string;
  sumId: string | null;
  workGroupId: string;
  workGroupName: string;
  projectId: string | null;
  projectName: string | null;
  disciplineId: string | null;
  disciplineName: string | null;
  phaseId: string | null;
  phaseName: string | null;
  level2: string | null;
  level3: string | null;
  level5: string | null;
  name: string;
  priority: string;
  status: string;
  progressPercent: number;
  plannedStart: string;
  plannedEnd: string;
  note: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
};

function isOverdue(t: TaskRow): boolean {
  if (!t.plannedEnd || t.status === "HOAN_THANH") return false;
  return new Date(t.plannedEnd) < new Date(new Date().toDateString());
}

export function TasksClient({
  currentUserId,
  canManage,
  tasks,
  workGroups,
  disciplines,
  phases,
  projects,
  users,
}: {
  currentUserId: string;
  canManage: boolean;
  tasks: TaskRow[];
  workGroups: Opt[];
  disciplines: Opt[];
  phases: Opt[];
  projects: Opt[];
  users: UserOpt[];
}) {
  const [f, setF] = React.useState({
    workGroupId: "",
    projectId: "",
    disciplineId: "",
    status: "",
    priority: "",
    mine: false,
  });
  const [search, setSearch] = React.useState("");
  // Gõ tới đâu ô phản hồi ngay; việc lọc dùng giá trị "trễ" nên không giật (React 19).
  const deferredSearch = React.useDeferredValue(search);
  const [editing, setEditing] = React.useState<TaskRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  // Chỉ mục tìm kiếm: chuẩn-hóa bỏ dấu MỘT LẦN cho mỗi công việc (không tính lại mỗi phím gõ).
  const haystacks = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) {
      m.set(
        t.id,
        removeVietnameseTones(
          [t.name, t.sumId, t.level2, t.level3, t.level5, t.assigneeNames.join(" ")]
            .filter(Boolean)
            .join(" "),
        ),
      );
    }
    return m;
  }, [tasks]);

  const filtered = React.useMemo(() => {
    const q = removeVietnameseTones(deferredSearch.trim());
    return tasks.filter((t) => {
      if (f.workGroupId && t.workGroupId !== f.workGroupId) return false;
      if (f.projectId && t.projectId !== f.projectId) return false;
      if (f.disciplineId && t.disciplineId !== f.disciplineId) return false;
      if (f.status === "QUA_HAN" ? !isOverdue(t) : f.status && t.status !== f.status) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.mine && !t.assigneeIds.includes(currentUserId)) return false;
      if (q && !(haystacks.get(t.id) ?? "").includes(q)) return false;
      return true;
    });
  }, [tasks, f, deferredSearch, haystacks, currentUserId]);

  // ---- Sắp xếp ----
  type SortKey = "sumId" | "name" | "project" | "assignee" | "priority" | "status" | "deadline";
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const PRIO_ORDER: Record<string, number> = { CAO: 0, TRUNG_BINH: 1, THAP: 2 };
  const STATUS_ORDER: Record<string, number> = {
    QUA_HAN: 0,
    DANG_LAM: 1,
    CHUA_LAM: 2,
    TAM_DUNG: 3,
    HOAN_THANH: 4,
  };
  function sortVal(t: TaskRow, key: SortKey): string | number {
    switch (key) {
      case "sumId":
        return t.sumId ?? "";
      case "name":
        return removeVietnameseTones(t.name);
      case "project":
        return removeVietnameseTones(`${t.projectName ?? ""} ${t.disciplineName ?? ""}`);
      case "assignee":
        return removeVietnameseTones(t.assigneeNames.join(", "));
      case "priority":
        return PRIO_ORDER[t.priority] ?? 9;
      case "status":
        return STATUS_ORDER[isOverdue(t) ? "QUA_HAN" : t.status] ?? 9;
      case "deadline":
        return t.plannedEnd || "9999-12-31";
    }
  }
  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortVal(a, sort.key);
      const vb = sortVal(b, sort.key);
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "vi");
      return sort.dir === "asc" ? c : -c;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function SortHead({
    label,
    sortKey,
    className,
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) {
    const active = sort?.key === sortKey;
    return (
      <TableHead
        className={cn("cursor-pointer select-none hover:text-foreground", className)}
        onClick={() => toggleSort(sortKey)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active ? (
            sort?.dir === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ChevronsUpDown className="size-3 opacity-40" />
          )}
        </span>
      </TableHead>
    );
  }

  async function quickStatus(t: TaskRow, status: string) {
    const res = await updateTaskStatus({ id: t.id, status });
    if (res.ok) toast.success("Đã cập nhật trạng thái");
    else toast.error(res.error);
  }

  async function onDelete(t: TaskRow) {
    if (!confirm(`Xóa công việc "${t.name}"?`)) return;
    const res = await deleteTask(t.id);
    if (res.ok) toast.success("Đã xóa");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Công việc</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} / {tasks.length} công việc
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Thêm công việc
          </Button>
        ) : null}
      </div>

      {/* Ô tìm kiếm nổi bật trên đầu */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm kiếm công việc theo tên, mã, hạng mục, người thực hiện..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 pl-9 pr-9 text-base"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Xóa tìm kiếm"
            className="absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Bộ lọc */}
      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={f.workGroupId} onChange={(e) => setF({ ...f, workGroupId: e.target.value })}>
          <option value="">— Nhóm công việc —</option>
          {workGroups.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
          <option value="">— Dự án —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={f.disciplineId} onChange={(e) => setF({ ...f, disciplineId: e.target.value })}>
          <option value="">— Bộ môn —</option>
          {disciplines.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">— Trạng thái —</option>
          {TASK_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </option>
          ))}
          <option value="QUA_HAN">Quá hạn</option>
        </Select>
        <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
          <option value="">— Ưu tiên —</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.mine}
            onChange={(e) => setF({ ...f, mine: e.target.checked })}
          />
          Chỉ việc của tôi
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setF({
              workGroupId: "",
              projectId: "",
              disciplineId: "",
              status: "",
              priority: "",
              mine: false,
            });
            setSearch("");
          }}
        >
          Xóa lọc
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Mã" sortKey="sumId" />
              <SortHead label="Công việc" sortKey="name" />
              <SortHead label="Dự án / Bộ môn" sortKey="project" />
              <SortHead label="Người thực hiện" sortKey="assignee" />
              <SortHead label="Ưu tiên" sortKey="priority" />
              <SortHead label="Trạng thái" sortKey="status" />
              <SortHead label="Hạn" sortKey="deadline" />
              {canManage ? <TableHead className="text-right">Thao tác</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((t) => {
              const overdue = isOverdue(t);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.sumId ?? "—"}</TableCell>
                  <TableCell className="max-w-xs">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[t.workGroupName, t.level2, t.level3].filter(Boolean).join(" › ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.projectName ?? "—"}
                    {t.disciplineName ? (
                      <span className="text-muted-foreground"> · {t.disciplineName}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">{t.assigneeNames.join(", ") || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      className="h-7 w-32 text-xs"
                      value={t.status}
                      onChange={(e) => quickStatus(t, e.target.value)}
                      disabled={!canManage && !t.assigneeIds.includes(currentUserId)}
                    >
                      {TASK_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {TASK_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">
                    {overdue ? (
                      <Badge variant={statusVariant("QUA_HAN")}>Quá hạn</Badge>
                    ) : (
                      t.plannedEnd || "—"
                    )}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(t)} title="Sửa">
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onDelete(t)} title="Xóa">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 8 : 7} className="py-8 text-center text-muted-foreground">
                  Không có công việc phù hợp
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {(creating || editing) && canManage ? (
        <TaskDialog
          task={editing ?? undefined}
          workGroups={workGroups}
          disciplines={disciplines}
          phases={phases}
          projects={projects}
          users={users}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TaskDialog({
  task,
  workGroups,
  disciplines,
  phases,
  projects,
  users,
  onClose,
}: {
  task?: TaskRow;
  workGroups: Opt[];
  disciplines: Opt[];
  phases: Opt[];
  projects: Opt[];
  users: UserOpt[];
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>(task?.assigneeIds ?? []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await saveTask({
      id: task?.id,
      workGroupId: String(fd.get("workGroupId") || ""),
      projectId: (fd.get("projectId") as string) || null,
      disciplineId: (fd.get("disciplineId") as string) || null,
      phaseId: (fd.get("phaseId") as string) || null,
      sumId: (fd.get("sumId") as string) || null,
      level2: (fd.get("level2") as string) || null,
      level3: (fd.get("level3") as string) || null,
      level5: (fd.get("level5") as string) || null,
      name: (fd.get("name") as string) || null,
      priority: String(fd.get("priority") || "TRUNG_BINH"),
      status: String(fd.get("status") || "CHUA_LAM"),
      plannedStart: (fd.get("plannedStart") as string) || null,
      plannedEnd: (fd.get("plannedEnd") as string) || null,
      note: (fd.get("note") as string) || null,
      assigneeIds,
    });
    setPending(false);
    if (res.ok) {
      toast.success(task ? "Đã cập nhật" : "Đã thêm công việc");
      onClose();
    } else toast.error(res.error);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={task ? "Sửa công việc" : "Thêm công việc"}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="workGroupId">Nhóm công việc (L1) *</Label>
            <Select id="workGroupId" name="workGroupId" defaultValue={task?.workGroupId ?? ""} required>
              <option value="">— Chọn —</option>
              {workGroups.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projectId">Dự án</Label>
            <Select id="projectId" name="projectId" defaultValue={task?.projectId ?? ""}>
              <option value="">— Không —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="level2">Hạng mục (L2)</Label>
            <Input id="level2" name="level2" defaultValue={task?.level2 ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="level3">Chi tiết (L3)</Label>
            <Input id="level3" name="level3" defaultValue={task?.level3 ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="level5">Đầu việc (L5)</Label>
            <Input id="level5" name="level5" defaultValue={task?.level5 ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Tên hiển thị (để trống → tự lấy đầu việc)</Label>
            <Input id="name" name="name" defaultValue={task?.name ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="disciplineId">Bộ môn (L4)</Label>
            <Select id="disciplineId" name="disciplineId" defaultValue={task?.disciplineId ?? ""}>
              <option value="">— Không —</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phaseId">Giai đoạn</Label>
            <Select id="phaseId" name="phaseId" defaultValue={task?.phaseId ?? ""}>
              <option value="">— Không —</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sumId">Mã (Sum ID)</Label>
            <Input id="sumId" name="sumId" defaultValue={task?.sumId ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="priority">Ưu tiên</Label>
            <Select id="priority" name="priority" defaultValue={task?.priority ?? "TRUNG_BINH"}>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Trạng thái</Label>
            <Select id="status" name="status" defaultValue={task?.status ?? "CHUA_LAM"}>
              {TASK_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="plannedStart">Bắt đầu</Label>
            <Input id="plannedStart" name="plannedStart" type="date" defaultValue={task?.plannedStart} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plannedEnd">Kết thúc</Label>
            <Input id="plannedEnd" name="plannedEnd" type="date" defaultValue={task?.plannedEnd} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Người thực hiện (tối đa 3)</Label>
          <UserMultiSelect users={users} value={assigneeIds} onChange={setAssigneeIds} max={3} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Ghi chú</Label>
          <Textarea id="note" name="note" defaultValue={task?.note ?? ""} />
        </div>

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
