"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserX,
  Users,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TaskRowEditor } from "@/components/task-row-editor";
import { UserMultiSelect } from "@/components/user-multi-select";
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
import {
  bulkReassign,
  bulkSetDeadline,
  bulkSetPriority,
  bulkSetStatus,
  deleteTask,
  updateTaskStatus,
} from "@/server/actions/tasks";

type Opt = { id: string; name: string };
// Nhóm công việc kèm mã + tiền tố Id (abbr) + bộ đếm (lastSeq) cho editor.
type WgOpt = Opt & { code?: string; abbr?: string | null; lastSeq?: number };
type UserOpt = { id: string; fullName: string };
type Catalog = Record<string, { l2: string[]; l3: string[]; l5: string[] }>;

export type TaskRow = {
  id: string;
  sumId: string | null;
  seq: number | null;
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

// Số ngày từ hôm nay đến hạn (âm = đã quá hạn). null nếu không có hạn / sai định dạng.
function daysUntil(end: string): number | null {
  if (!end) return null;
  const d = new Date(end);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(new Date().toDateString());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// Sắp đến hạn: còn 0..3 ngày, chưa hoàn thành, chưa quá hạn.
function isDueSoon(t: TaskRow): boolean {
  if (t.status === "HOAN_THANH") return false;
  const n = daysUntil(t.plannedEnd);
  return n !== null && n >= 0 && n <= 3;
}

// Nhãn hạn ngắn gọn cho card Kanban.
function deadlineLabel(t: TaskRow): string {
  if (!t.plannedEnd) return "Không hạn";
  const n = daysUntil(t.plannedEnd);
  if (n === null) return t.plannedEnd;
  if (n < 0) return `Quá hạn ${-n} ngày`;
  if (n === 0) return "Hạn hôm nay";
  return `Còn ${n} ngày · ${t.plannedEnd}`;
}

// Thứ tự cột Kanban + số thẻ tối đa hiển thị mỗi cột trước khi gập (bấm "xem thêm").
const KANBAN_ORDER = ["CHUA_LAM", "DANG_LAM", "TAM_DUNG", "HOAN_THANH"] as const;
const KANBAN_COL_LIMIT = 40;

// Kéo giãn cột bảng /manage (theo SortKey). Checkbox + Thao tác cố định, không giãn.
const MANAGE_MIN_W = 80;
const MANAGE_MAX_W = 600;
const MANAGE_WIDTH_KEY = "manage-col-widths-v1";
const clampManageW = (n: number) => Math.min(MANAGE_MAX_W, Math.max(MANAGE_MIN_W, Math.round(n)));
const MANAGE_SEL_PX = 36; // cột checkbox
const MANAGE_ACT_PX = 88; // cột thao tác
const MANAGE_COL_PX: Record<string, number> = {
  sumId: 150,
  name: 240,
  project: 160,
  assignee: 180,
  priority: 90,
  status: 140,
  deadline: 110,
};
const MANAGE_SORT_KEYS = ["sumId", "name", "project", "assignee", "priority", "status", "deadline"] as const;

export function ManageClient({
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
  workGroups: WgOpt[];
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
    mine: false,
  });
  const [activeWg, setActiveWg] = React.useState(""); // "" = Tất cả (tab Bảng)
  const [search, setSearch] = React.useState("");
  // Gõ tới đâu ô phản hồi ngay; việc lọc dùng giá trị "trễ" nên không giật (React 19).
  const deferredSearch = React.useDeferredValue(search);
  const [editing, setEditing] = React.useState<TaskRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  // Lọc nhanh từ dải KPI (riêng với dropdown Trạng thái để không xung đột).
  const [quick, setQuick] = React.useState<"" | "QUA_HAN" | "SAP_HAN" | "CHUA_GIAO" | "DANG_LAM">(
    "",
  );
  // Chế độ xem: gom theo người (mặc định) / bảng phẳng / Kanban.
  const [viewMode, setViewMode] = React.useState<"people" | "table" | "kanban">("people");
  // Nhóm người đang thu gọn (mặc định mở hết).
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  // Cột Kanban đang được kéo card vào (để tô viền).
  const [dragCol, setDragCol] = React.useState<string | null>(null);
  // Cột Kanban đã bấm "xem thêm" (hiện hết thẻ thay vì giới hạn).
  const [expandedCols, setExpandedCols] = React.useState<Set<string>>(() => new Set());
  // Bề rộng cột bảng (kéo giãn) — nhớ bằng localStorage.
  const [colWidths, setColWidths] = React.useState<Record<string, number>>(() => ({
    ...MANAGE_COL_PX,
  }));
  const colWidthsRef = React.useRef(colWidths);
  React.useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);
  const draggingRef = React.useRef(false);
  const resizeStartRef = React.useRef<{ x: number; w: number; key: string } | null>(null);
  React.useEffect(() => {
    function loadWidths() {
      try {
        const raw = window.localStorage.getItem(MANAGE_WIDTH_KEY);
        if (raw) setColWidths((w) => ({ ...w, ...(JSON.parse(raw) as Record<string, number>) }));
      } catch {
        /* bỏ qua localStorage lỗi */
      }
    }
    loadWidths();
  }, []);
  const persistWidths = (w: Record<string, number>) => {
    try {
      window.localStorage.setItem(MANAGE_WIDTH_KEY, JSON.stringify(w));
    } catch {
      /* bỏ qua localStorage lỗi */
    }
  };
  const setColW = (k: string, px: number) => setColWidths((w) => ({ ...w, [k]: px }));
  const endResize = () => persistWidths(colWidthsRef.current);
  const resetColW = (k: string) => {
    const nw = { ...colWidthsRef.current, [k]: MANAGE_COL_PX[k] };
    setColWidths(nw);
    persistWidths(nw);
  };
  // Chọn nhiều việc để thao tác hàng loạt.
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  // Modal giao lại / đổi hạn (chụp lại danh sách id lúc mở).
  const [reassign, setReassign] = React.useState<{
    ids: string[];
    mode: "replace" | "add";
    users: string[];
  } | null>(null);
  const [deadline, setDeadline] = React.useState<{ ids: string[]; date: string } | null>(null);

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

  // Nền KPI: lọc theo dự án/bộ môn/ưu tiên/của-tôi/tìm-kiếm, NHƯNG bỏ qua trạng thái,
  // lọc nhanh KPI và tab nhóm → số trên dải KPI ổn định khi bấm vào một KPI.
  const kpiBase = React.useMemo(() => {
    const q = removeVietnameseTones(deferredSearch.trim());
    return tasks.filter((t) => {
      if (f.projectId && t.projectId !== f.projectId) return false;
      if (f.disciplineId && t.disciplineId !== f.disciplineId) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.mine && !t.assigneeIds.includes(currentUserId)) return false;
      if (q && !(haystacks.get(t.id) ?? "").includes(q)) return false;
      return true;
    });
  }, [tasks, f.projectId, f.disciplineId, f.priority, f.mine, deferredSearch, haystacks, currentUserId]);

  const kpi = React.useMemo(() => {
    let overdue = 0;
    let soon = 0;
    let unassigned = 0;
    let doing = 0;
    let progSum = 0;
    for (const t of kpiBase) {
      if (isOverdue(t)) overdue++;
      else if (isDueSoon(t)) soon++;
      if (t.assigneeIds.length === 0) unassigned++;
      if (t.status === "DANG_LAM") doing++;
      progSum += t.progressPercent;
    }
    return {
      overdue,
      soon,
      unassigned,
      doing,
      avg: kpiBase.length ? Math.round(progSum / kpiBase.length) : 0,
    };
  }, [kpiBase]);

  // Áp thêm dropdown Trạng thái + lọc nhanh KPI (vẫn TRỪ tab nhóm để đếm theo tab).
  const base = React.useMemo(() => {
    return kpiBase.filter((t) => {
      if (f.status === "QUA_HAN" ? !isOverdue(t) : f.status && t.status !== f.status) return false;
      if (quick === "QUA_HAN" && !isOverdue(t)) return false;
      if (quick === "SAP_HAN" && !isDueSoon(t)) return false;
      if (quick === "CHUA_GIAO" && t.assigneeIds.length !== 0) return false;
      if (quick === "DANG_LAM" && t.status !== "DANG_LAM") return false;
      return true;
    });
  }, [kpiBase, f.status, quick]);

  const wgCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of base) m.set(t.workGroupId, (m.get(t.workGroupId) ?? 0) + 1);
    return m;
  }, [base]);

  const filtered = React.useMemo(
    () => (activeWg ? base.filter((t) => t.workGroupId === activeWg) : base),
    [base, activeWg],
  );

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

  // ---- Gom theo người ----
  // Việc nhiều người -> xuất hiện ở mỗi người (số là "lần tham gia", không phải unique).
  // Việc chưa giao gom vào bucket "⚠ Chưa giao" ghim trên cùng.
  const NONE_KEY = "__none__";
  const groups = React.useMemo(() => {
    if (viewMode !== "people") return [];
    const map = new Map<string, { key: string; name: string; tasks: TaskRow[] }>();
    for (const t of filtered) {
      if (t.assigneeIds.length === 0) {
        const g = map.get(NONE_KEY) ?? { key: NONE_KEY, name: "⚠ Chưa giao", tasks: [] };
        g.tasks.push(t);
        map.set(NONE_KEY, g);
      } else {
        t.assigneeIds.forEach((uid, i) => {
          const g = map.get(uid) ?? { key: uid, name: t.assigneeNames[i] ?? "?", tasks: [] };
          g.tasks.push(t);
          map.set(uid, g);
        });
      }
    }
    const arr = [...map.values()].map((g) => {
      // Trong nhóm: quá hạn lên đầu, rồi theo hạn tăng dần.
      g.tasks.sort((a, b) => {
        const oa = isOverdue(a) ? 0 : 1;
        const ob = isOverdue(b) ? 0 : 1;
        if (oa !== ob) return oa - ob;
        return (a.plannedEnd || "9999-12-31").localeCompare(b.plannedEnd || "9999-12-31");
      });
      return { ...g, overdue: g.tasks.filter(isOverdue).length };
    });
    // Sắp nhóm: "Chưa giao" trước, rồi nhiều quá hạn trước, rồi theo tên.
    arr.sort((a, b) => {
      if (a.key === NONE_KEY) return -1;
      if (b.key === NONE_KEY) return 1;
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      return a.name.localeCompare(b.name, "vi");
    });
    return arr;
  }, [viewMode, filtered]);

  function toggleGroup(key: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }
  function collapseAllGroups() {
    setCollapsed(new Set(groups.map((g) => g.key)));
  }
  function expandAllGroups() {
    setCollapsed(new Set());
  }

  // Ô tiêu đề: bấm nhãn để sắp xếp (3 trạng thái) + kéo mép phải để giãn cột.
  // Hàm render (không phải component) để tránh tạo component trong render.
  const renderHeadCell = (label: string, sortKey: SortKey) => {
    const active = sort?.key === sortKey;
    return (
      <TableHead style={{ width: colWidths[sortKey] }} className="relative select-none">
        <button
          type="button"
          className="flex w-full items-center gap-1 text-left hover:text-foreground"
          onClick={() => {
            if (draggingRef.current) return;
            toggleSort(sortKey);
          }}
        >
          <span className="truncate">{label}</span>
          {active ? (
            sort?.dir === "asc" ? (
              <ArrowUp className="size-3 shrink-0" />
            ) : (
              <ArrowDown className="size-3 shrink-0" />
            )
          ) : (
            <ChevronsUpDown className="size-3 shrink-0 opacity-40" />
          )}
        </button>
        <div
          role="separator"
          aria-orientation="vertical"
          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
          title="Kéo để giãn cột · nhấp đúp để đặt lại"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            resizeStartRef.current = { x: e.clientX, w: colWidths[sortKey], key: sortKey };
            draggingRef.current = true;
          }}
          onPointerMove={(e) => {
            const s = resizeStartRef.current;
            if (!s) return;
            setColW(s.key, clampManageW(s.w + (e.clientX - s.x)));
          }}
          onPointerUp={(e) => {
            if (!resizeStartRef.current) return;
            resizeStartRef.current = null;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            endResize();
            // Bỏ cờ kéo sau vòng sự kiện click → tránh kích hoạt sort.
            setTimeout(() => {
              draggingRef.current = false;
            }, 0);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            resetColW(sortKey);
          }}
        />
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

  // ---- Chọn nhiều + thao tác hàng loạt ----
  const allVisibleSelected = sorted.length > 0 && sorted.every((t) => selected.has(t.id));
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAllVisible() {
    setSelected((s) => {
      const n = new Set(s);
      if (sorted.every((t) => n.has(t.id))) sorted.forEach((t) => n.delete(t.id));
      else sorted.forEach((t) => n.add(t.id));
      return n;
    });
  }
  function clearSel() {
    setSelected(new Set());
  }

  async function applyBatch(promise: ReturnType<typeof bulkSetStatus>, okMsg: string) {
    const res = await promise;
    if (res.ok) {
      toast.success(`${okMsg} ${res.data ?? ""} việc`.replace("  ", " "));
      clearSel();
    } else {
      toast.error(res.error);
    }
  }
  async function batchStatus(status: string) {
    if (!status) return;
    if (!confirm(`Đổi trạng thái ${selected.size} công việc?`)) return;
    await applyBatch(bulkSetStatus({ ids: [...selected], status }), "Đã đổi trạng thái");
  }
  async function batchPriority(priority: string) {
    if (!priority) return;
    if (!confirm(`Đổi ưu tiên ${selected.size} công việc?`)) return;
    await applyBatch(bulkSetPriority({ ids: [...selected], priority }), "Đã đổi ưu tiên");
  }
  async function submitDeadline() {
    if (!deadline?.date) return;
    await applyBatch(
      bulkSetDeadline({ ids: deadline.ids, plannedEnd: deadline.date }),
      "Đã đổi hạn",
    );
    setDeadline(null);
  }
  async function submitReassign() {
    if (!reassign) return;
    if (reassign.mode === "replace" && !confirm(`Thay toàn bộ người của ${reassign.ids.length} việc?`))
      return;
    await applyBatch(
      bulkReassign({ ids: reassign.ids, assigneeIds: reassign.users, mode: reassign.mode }),
      "Đã giao lại",
    );
    setReassign(null);
  }

  // Một dòng việc — dùng chung cho cả view Bảng và view Gom theo người.
  // keyExtra để key duy nhất khi 1 việc hiện ở nhiều nhóm người.
  function renderRow(t: TaskRow, keyExtra = "") {
    const overdue = isOverdue(t);
    return (
      <TableRow key={`${keyExtra}${t.id}`} className={cn(selected.has(t.id) && "bg-muted/40")}>
        {canManage ? (
          <TableCell className="w-8">
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={() => toggleOne(t.id)}
              aria-label="Chọn việc"
            />
          </TableCell>
        ) : null}
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
  }

  // Dòng tiêu đề nhóm người (chiếm hết chiều ngang, bấm để gập/mở).
  function groupHeaderRow(g: { key: string; name: string; overdue: number; tasks: TaskRow[] }) {
    const Chevron = collapsed.has(g.key) ? ChevronRight : ChevronDown;
    return (
      <TableRow key={`grp-${g.key}`} className="bg-muted/60 hover:bg-muted/60">
        <TableCell colSpan={canManage ? 9 : 7} className="py-2">
          <button
            type="button"
            onClick={() => toggleGroup(g.key)}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Chevron className="size-4 text-muted-foreground" />
            {g.name}
            <span className="font-normal text-muted-foreground">
              ({g.tasks.length} việc{g.overdue ? ` · ${g.overdue} quá hạn` : ""})
            </span>
          </button>
        </TableCell>
      </TableRow>
    );
  }

  // ---- Kanban (kéo-thả đổi trạng thái) ----
  async function onDropStatus(status: string, e: React.DragEvent) {
    e.preventDefault();
    setDragCol(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    const res = await updateTaskStatus({ id, status });
    if (res.ok) toast.success(`Chuyển sang "${TASK_STATUS_LABEL[status]}"`);
    else toast.error(res.error);
  }

  function kanbanCard(t: TaskRow) {
    const overdue = isOverdue(t);
    return (
      <div
        key={t.id}
        draggable={canManage}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
        onClick={() => (canManage ? setEditing(t) : undefined)}
        className={cn(
          "rounded-md border bg-card p-2 text-xs shadow-sm",
          canManage && "cursor-grab active:cursor-grabbing",
          overdue ? "border-red-400 ring-1 ring-red-200" : "",
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">{t.sumId ?? "—"}</span>
          <Badge variant={priorityVariant(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
        </div>
        <div className="mt-1 font-medium leading-snug">{t.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1">{t.workGroupName}</span>
          {t.assigneeNames.length ? (
            <span>· {t.assigneeNames.join(", ")}</span>
          ) : (
            <span className="text-amber-600">· chưa giao</span>
          )}
        </div>
        <div
          className={cn(
            "mt-1 text-[11px]",
            overdue ? "font-medium text-red-600" : "text-muted-foreground",
          )}
        >
          {deadlineLabel(t)}
        </div>
      </div>
    );
  }

  function toggleExpandCol(s: string) {
    setExpandedCols((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  }

  function renderKanban() {
    const byStatus = KANBAN_ORDER.map((s) => ({
      s,
      items: filtered.filter((t) => t.status === s),
    }));
    const overflow = byStatus.some(({ items }) => items.length > KANBAN_COL_LIMIT);
    return (
      <div className="space-y-2">
        {overflow ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Đang hiển thị tối đa {KANBAN_COL_LIMIT} thẻ/cột — lọc Nhóm/Dự án hoặc dùng ô tìm để xem
            đầy đủ.
          </div>
        ) : null}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {byStatus.map(({ s, items }) => {
            const expanded = expandedCols.has(s);
            const shown = expanded ? items : items.slice(0, KANBAN_COL_LIMIT);
            const hidden = items.length - shown.length;
            return (
              <div
                key={s}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragCol(s);
                }}
                onDragLeave={() => setDragCol((c) => (c === s ? null : c))}
                onDrop={(e) => onDropStatus(s, e)}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30",
                  dragCol === s && "ring-2 ring-primary",
                )}
              >
                <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
                  <span>{TASK_STATUS_LABEL[s]}</span>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="flex min-h-16 flex-col gap-2 p-2">
                  {shown.map(kanbanCard)}
                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggleExpandCol(s)}
                      className="rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      + {hidden} việc nữa
                    </button>
                  ) : expanded && items.length > KANBAN_COL_LIMIT ? (
                    <button
                      type="button"
                      onClick={() => toggleExpandCol(s)}
                      className="rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Thu gọn
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quản lý công việc</h1>
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

      {/* Dải KPI cảnh báo — bấm để lọc nhanh */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            { key: "QUA_HAN", label: "Quá hạn", n: kpi.overdue, Icon: AlertTriangle, tone: "border-red-200 bg-red-50 text-red-700" },
            { key: "SAP_HAN", label: "Sắp đến hạn (≤3 ngày)", n: kpi.soon, Icon: Clock, tone: "border-amber-200 bg-amber-50 text-amber-700" },
            { key: "CHUA_GIAO", label: "Chưa giao người", n: kpi.unassigned, Icon: UserX, tone: "border-slate-200 bg-slate-50 text-slate-700" },
            { key: "DANG_LAM", label: `Đang làm · TB ${kpi.avg}%`, n: kpi.doing, Icon: Activity, tone: "border-blue-200 bg-blue-50 text-blue-700" },
          ] as const
        ).map(({ key, label, n, Icon, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => setQuick((q) => (q === key ? "" : key))}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition",
              tone,
              quick === key ? "ring-2 ring-primary ring-offset-1" : "hover:brightness-95",
            )}
          >
            <Icon className="size-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xl font-semibold leading-none">{n}</div>
              <div className="truncate text-xs opacity-80">{label}</div>
            </div>
          </button>
        ))}
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
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Xóa lọc"
            aria-label="Xóa lọc"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              setF({ projectId: "", disciplineId: "", status: "", priority: "", mine: false });
              setSearch("");
              setActiveWg("");
              setQuick("");
              clearSel();
            }}
          >
            <X />
          </Button>
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={f.mine}
            onChange={(e) => setF({ ...f, mine: e.target.checked })}
          />
          Chỉ việc của tôi
        </label>
      </div>

      {/* Chuyển chế độ xem */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5">
          {(
            [
              { key: "people", label: "Gom theo người" },
              { key: "table", label: "Bảng" },
              { key: "kanban", label: "Kanban" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setViewMode(v.key)}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium transition-colors",
                viewMode === v.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        {viewMode === "people" ? (
          <div className="inline-flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={collapseAllGroups}
              disabled={groups.length > 0 && collapsed.size === groups.length}
              title="Thu gọn tất cả nhóm"
            >
              <ChevronsDownUp className="size-4" /> Collapse
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={expandAllGroups}
              disabled={collapsed.size === 0}
              title="Mở rộng tất cả nhóm"
            >
              <ChevronsUpDown className="size-4" /> Expand
            </Button>
          </div>
        ) : null}
      </div>

      {viewMode === "kanban" ? (
        renderKanban()
      ) : (
        <div className="rounded-lg border">
        <Table
          className="table-fixed"
          style={{
            minWidth:
              (canManage ? MANAGE_SEL_PX + MANAGE_ACT_PX : 0) +
              MANAGE_SORT_KEYS.reduce((s, k) => s + colWidths[k], 0),
          }}
        >
          <TableHeader>
            <TableRow>
              {canManage ? (
                <TableHead style={{ width: MANAGE_SEL_PX }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Chọn tất cả việc đang hiển thị"
                  />
                </TableHead>
              ) : null}
              {renderHeadCell("Mã", "sumId")}
              {renderHeadCell("Công việc", "name")}
              {renderHeadCell("Dự án / Bộ môn", "project")}
              {renderHeadCell("Người thực hiện", "assignee")}
              {renderHeadCell("Ưu tiên", "priority")}
              {renderHeadCell("Trạng thái", "status")}
              {renderHeadCell("Hạn", "deadline")}
              {canManage ? (
                <TableHead style={{ width: MANAGE_ACT_PX }} className="text-right">
                  Thao tác
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {viewMode === "people"
              ? groups.flatMap((g) =>
                  collapsed.has(g.key)
                    ? [groupHeaderRow(g)]
                    : [groupHeaderRow(g), ...g.tasks.map((t) => renderRow(t, `${g.key}-`))],
                )
              : sorted.map((t) => renderRow(t))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 7} className="py-8 text-center text-muted-foreground">
                  Không có công việc phù hợp
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </div>
      )}

      {/* Thanh thao tác hàng loạt — dính đáy khi đã chọn việc */}
      {canManage && selected.size > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-lg">
          <span className="px-2 text-sm font-medium">Đã chọn {selected.size}</span>
          <Select
            className="h-8 w-36 text-xs"
            value=""
            onChange={(e) => batchStatus(e.target.value)}
          >
            <option value="">Đổi trạng thái…</option>
            {TASK_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            className="h-8 w-32 text-xs"
            value=""
            onChange={(e) => batchPriority(e.target.value)}
          >
            <option value="">Đổi ưu tiên…</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDeadline({ ids: [...selected], date: "" })}
          >
            <Calendar className="size-4" /> Đổi hạn
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReassign({ ids: [...selected], mode: "replace", users: [] })}
          >
            <Users className="size-4" /> Giao lại
          </Button>
          <Button size="icon" variant="ghost" onClick={clearSel} title="Bỏ chọn" aria-label="Bỏ chọn">
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {/* Modal giao lại người hàng loạt */}
      {reassign ? (
        <Modal
          open
          onClose={() => setReassign(null)}
          title={`Giao lại ${reassign.ids.length} công việc`}
          className="max-w-md"
        >
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={reassign.mode === "replace"}
                  onChange={() => setReassign({ ...reassign, mode: "replace" })}
                />
                Thay toàn bộ
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={reassign.mode === "add"}
                  onChange={() => setReassign({ ...reassign, mode: "add" })}
                />
                Thêm người
              </label>
            </div>
            <UserMultiSelect
              users={users}
              value={reassign.users}
              onChange={(ids) => setReassign({ ...reassign, users: ids })}
            />
            <p className="text-xs text-muted-foreground">
              {reassign.mode === "replace"
                ? "Xóa hết người cũ rồi gán danh sách trên" +
                  (reassign.users.length === 0 ? " (để trống = gỡ hết người)." : ".")
                : "Giữ người cũ, chỉ thêm người mới vào danh sách."}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReassign(null)}>
                Hủy
              </Button>
              <Button onClick={submitReassign}>Áp dụng</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Modal đổi hạn hàng loạt */}
      {deadline ? (
        <Modal
          open
          onClose={() => setDeadline(null)}
          title={`Đổi hạn ${deadline.ids.length} công việc`}
          className="max-w-sm"
        >
          <div className="space-y-3">
            <Input
              type="date"
              value={deadline.date}
              onChange={(e) => setDeadline({ ...deadline, date: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeadline(null)}>
                Hủy
              </Button>
              <Button disabled={!deadline.date} onClick={submitDeadline}>
                Áp dụng
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

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
  workGroups: WgOpt[];
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
      className="max-w-3xl"
    >
      <TaskRowEditor
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
