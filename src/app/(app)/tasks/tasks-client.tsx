"use client";

import dayjs from "dayjs";
import { ArrowDown, ArrowUp, ChevronsUpDown, Clock, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TaskForm } from "@/components/task-form";
import { TimesheetEntryDialog } from "@/components/timesheet-entry-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
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
import { effectiveStatus } from "@/lib/task-status";
import { deleteTask, updateTaskStatus } from "@/server/actions/tasks";

type Opt = { id: string; name: string };
type UserOpt = { id: string; fullName: string };
type Catalog = Record<string, { l2: string[]; l3: string[]; l5: string[] }>;

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
  actualEnd: string;
  note: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
};

function isOverdue(t: TaskRow): boolean {
  if (!t.plannedEnd || t.status === "HOAN_THANH") return false;
  return new Date(t.plannedEnd) < new Date(new Date().toDateString());
}

// Trạng thái hiển thị/đếm: status thật + lớp phủ "Quá hạn".
// Dùng CHUNG với /manage để cùng một việc không hiện 2 trạng thái khác nhau.
function effOf(t: TaskRow): string {
  return effectiveStatus({ status: t.status, plannedEnd: t.plannedEnd });
}

// YYYY-MM-DD theo giờ địa phương (tránh lệch timezone của toISOString).
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Khoảng [from, to] (YYYY-MM-DD) suy ra từ preset thời gian, mốc hôm nay.
function presetRange(preset: string): { from: string; to: string } {
  const today = new Date(new Date().toDateString());
  switch (preset) {
    case "TODAY":
      return { from: localIso(today), to: localIso(today) };
    case "NEXT7": {
      const end = new Date(today);
      end.setDate(end.getDate() + 7);
      return { from: localIso(today), to: localIso(end) };
    }
    case "MONTH": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: localIso(first), to: localIso(last) };
    }
    default:
      return { from: "", to: "" };
  }
}

const DATE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "— Thời gian —" },
  { value: "TODAY", label: "Hôm nay" },
  { value: "NEXT7", label: "7 ngày tới" },
  { value: "MONTH", label: "Tháng này" },
  { value: "QUA_HAN", label: "Quá hạn" },
  { value: "CUSTOM", label: "Khoảng tùy chọn…" },
];

export function TasksClient({
  currentUserId,
  canManage,
  tasks,
  workGroups,
  disciplines,
  phases,
  projects,
  users,
  catalog,
}: {
  currentUserId: string;
  canManage: boolean;
  tasks: TaskRow[];
  workGroups: Opt[];
  disciplines: Opt[];
  phases: Opt[];
  projects: Opt[];
  users: UserOpt[];
  catalog: Catalog;
}) {
  const [f, setF] = React.useState({
    projectId: "",
    disciplineId: "",
    status: "",
    priority: "",
    // Lọc theo thời gian (Hạn). datePreset: "" | TODAY | NEXT7 | MONTH | QUA_HAN | CUSTOM.
    datePreset: "",
    dateFrom: "",
    dateTo: "",
  });
  const [activeWg, setActiveWg] = React.useState(""); // "" = Tất cả (tab Bảng)
  const [search, setSearch] = React.useState("");
  // Gõ tới đâu ô phản hồi ngay; việc lọc dùng giá trị "trễ" nên không giật (React 19).
  const deferredSearch = React.useDeferredValue(search);
  const [editing, setEditing] = React.useState<TaskRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [logging, setLogging] = React.useState<TaskRow | null>(null); // ghi giờ cho việc này

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

  // Lọc theo MỌI tiêu chí TRỪ nhóm (để đếm số việc mỗi tab Bảng theo bộ lọc hiện tại).
  const base = React.useMemo(() => {
    const q = removeVietnameseTones(deferredSearch.trim());
    return tasks.filter((t) => {
      if (f.projectId && t.projectId !== f.projectId) return false;
      if (f.disciplineId && t.disciplineId !== f.disciplineId) return false;
      // Trạng thái dùng effOf để khớp /manage ("Quá hạn" suy ra từ hạn).
      if (f.status && effOf(t) !== f.status) return false;
      if (f.priority && t.priority !== f.priority) return false;
      // Lọc theo thời gian (theo Hạn). "Quá hạn" dùng lại isOverdue.
      if (f.datePreset === "QUA_HAN") {
        if (!isOverdue(t)) return false;
      } else if (f.datePreset) {
        const { from, to } =
          f.datePreset === "CUSTOM"
            ? { from: f.dateFrom, to: f.dateTo }
            : presetRange(f.datePreset);
        if (from || to) {
          if (!t.plannedEnd) return false; // không có Hạn → ẩn khi đang lọc thời gian
          if (from && t.plannedEnd < from) return false;
          if (to && t.plannedEnd > to) return false;
        }
      }
      if (q && !(haystacks.get(t.id) ?? "").includes(q)) return false;
      return true;
    });
  }, [tasks, f, deferredSearch, haystacks]);

  const wgCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of base) m.set(t.workGroupId, (m.get(t.workGroupId) ?? 0) + 1);
    return m;
  }, [base]);

  const filtered = React.useMemo(
    () => (activeWg ? base.filter((t) => t.workGroupId === activeWg) : base),
    [base, activeWg],
  );

  // Số việc quá hạn trên TOÀN bộ việc của tôi (không phụ thuộc bộ lọc) — nhắc ưu tiên.
  const overdueCount = React.useMemo(() => tasks.filter(isOverdue).length, [tasks]);

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
        return STATUS_ORDER[effOf(t)] ?? 9;
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

  // Hàm render (không phải component) để tránh tạo component trong render.
  const renderSortHead = (label: string, sortKey: SortKey, className?: string) => {
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
  };

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
          <h1 className="text-2xl font-semibold tracking-tight">Công việc của tôi</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} / {tasks.length} việc được giao
            {overdueCount > 0 ? (
              <span className="ml-2 font-medium text-red-600">· {overdueCount} quá hạn</span>
            ) : null}
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

      {/* Tab theo Bảng giao việc (Nhóm công việc 1-7) */}
      <div className="flex flex-wrap gap-1.5 border-b pb-2">
        <button
          type="button"
          onClick={() => setActiveWg("")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeWg === ""
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Tất cả <span className="opacity-70">({base.length})</span>
        </button>
        {workGroups.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setActiveWg(w.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeWg === w.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {w.name} <span className="opacity-70">({wgCounts.get(w.id) ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Bộ lọc */}
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex items-start gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
            <Select
              value={f.datePreset}
              onChange={(e) => setF({ ...f, datePreset: e.target.value })}
              title="Lọc theo Hạn"
            >
              {DATE_PRESETS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Xóa lọc"
            aria-label="Xóa lọc"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              setF({
                projectId: "",
                disciplineId: "",
                status: "",
                priority: "",
                datePreset: "",
                dateFrom: "",
                dateTo: "",
              });
              setSearch("");
              setActiveWg("");
            }}
          >
            <X />
          </Button>
        </div>
        {f.datePreset === "CUSTOM" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Hạn từ</span>
            <Input
              type="date"
              className="h-9 w-40"
              value={f.dateFrom}
              onChange={(e) => setF({ ...f, dateFrom: e.target.value })}
            />
            <span className="text-muted-foreground">đến</span>
            <Input
              type="date"
              className="h-9 w-40"
              value={f.dateTo}
              onChange={(e) => setF({ ...f, dateTo: e.target.value })}
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {renderSortHead("Mã", "sumId")}
              {renderSortHead("Công việc", "name")}
              {renderSortHead("Dự án / Bộ môn", "project")}
              {renderSortHead("Người thực hiện", "assignee")}
              {renderSortHead("Ưu tiên", "priority")}
              {renderSortHead("Trạng thái", "status")}
              {renderSortHead("Hạn", "deadline")}
              <TableHead className="text-center">Ghi giờ</TableHead>
              {canManage ? <TableHead className="text-right">Thao tác</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((t) => {
              const overdue = isOverdue(t);
              // Đã hoàn thành + có ngày HT thực tế → hiện gọn dưới cột Hạn (xanh: đúng hạn, đỏ: trễ).
              const done = t.status === "HOAN_THANH" && !!t.actualEnd;
              const lateDone = done && !!t.plannedEnd && t.actualEnd > t.plannedEnd;
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
                    <SearchableCombobox
                      className="h-8 text-xs"
                      creatable={false}
                      disabled={!canManage && !t.assigneeIds.includes(currentUserId)}
                      value={TASK_STATUS_LABEL[t.status] ?? ""}
                      options={TASK_STATUS_OPTIONS.map((s) => TASK_STATUS_LABEL[s])}
                      onChange={(label) => {
                        const st = TASK_STATUS_OPTIONS.find((s) => TASK_STATUS_LABEL[s] === label);
                        if (st) quickStatus(t, st);
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    {overdue ? (
                      <Badge variant={statusVariant("QUA_HAN")}>Quá hạn</Badge>
                    ) : (
                      t.plannedEnd || "—"
                    )}
                    {done ? (
                      <div
                        className={cn(
                          "text-[11px]",
                          !t.plannedEnd
                            ? "text-muted-foreground"
                            : lateDone
                              ? "text-red-600"
                              : "text-emerald-600",
                        )}
                      >
                        HT: {t.actualEnd}
                        {t.plannedEnd ? (lateDone ? " (trễ)" : " ✓") : null}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setLogging(t)}
                      title="Ghi giờ cho công việc này"
                    >
                      <Clock className="size-4" />
                    </Button>
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
                <TableCell colSpan={canManage ? 9 : 8} className="py-8 text-center text-muted-foreground">
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
          defaultWorkGroupId={activeWg}
          workGroups={workGroups}
          disciplines={disciplines}
          phases={phases}
          projects={projects}
          users={users}
          catalog={catalog}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      {logging ? (
        <TimesheetEntryDialog
          lockedTask={{ id: logging.id, name: logging.sumId ? `${logging.sumId} — ${logging.name}` : logging.name }}
          defaultDate={dayjs().format("YYYY-MM-DD")}
          onClose={() => setLogging(null)}
        />
      ) : null}
    </div>
  );
}

function TaskDialog({
  task,
  defaultWorkGroupId,
  workGroups,
  disciplines,
  phases,
  projects,
  users,
  catalog,
  onClose,
}: {
  task?: TaskRow;
  defaultWorkGroupId?: string;
  workGroups: Opt[];
  disciplines: Opt[];
  phases: Opt[];
  projects: Opt[];
  users: UserOpt[];
  catalog: Catalog;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={task ? "Sửa công việc" : "Thêm công việc"}
      className="max-w-2xl"
    >
      <TaskForm
        task={task}
        defaultWorkGroupId={defaultWorkGroupId}
        workGroups={workGroups}
        disciplines={disciplines}
        phases={phases}
        projects={projects}
        users={users}
        catalog={catalog}
        onSuccess={onClose}
        onCancel={onClose}
      />
    </Modal>
  );
}
