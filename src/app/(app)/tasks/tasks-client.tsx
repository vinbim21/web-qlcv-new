"use client";

import dayjs from "dayjs";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Clock,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { AssignClient, type ProjectOpt } from "@/app/(app)/assign/assign-client";
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
import { completionDateError, effectiveStatus, isCompletedLate } from "@/lib/task-status";
import { deleteTask, saveMyTasks, setTaskCompletion, setTaskStartApproval } from "@/server/actions/tasks";

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
  approved: boolean;
  approvedByName: string | null;
  approverId: string | null;
  approverName: string | null;
  startApproved: boolean;
  assigneeIds: string[];
  assigneeNames: string[];
};

// Việc đang "chờ duyệt khởi tạo" (luồng Thêm công việc) → khóa nhập thời gian.
// Tạm ẩn dòng đường dẫn (Nhóm › Cấp 2 › Cấp 3) dưới tên việc. Đổi true để hiện lại.
const SHOW_TASK_PATH = false;

function isPendingApproval(t: TaskRow): boolean {
  return !!t.approverId && !t.startApproved;
}

function isOverdue(t: TaskRow): boolean {
  if (!t.plannedEnd || t.status === "HOAN_THANH") return false;
  return new Date(t.plannedEnd) < new Date(new Date().toDateString());
}

// Trạng thái hiển thị/đếm: status thật + lớp phủ "Quá hạn".
// Dùng CHUNG với /manage để cùng một việc không hiện 2 trạng thái khác nhau.
function effOf(t: TaskRow): string {
  return effectiveStatus({ status: t.status, plannedEnd: t.plannedEnd });
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

// Kéo giãn cột bảng (theo SortKey). Cột Ghi giờ + Thao tác cố định, không giãn.
const MYTASKS_MIN_W = 80;
const MYTASKS_MAX_W = 600;
const MYTASKS_COL_MIN_W: Record<string, number> = { actualEnd: 160 };
const MYTASKS_WIDTH_KEY = "mytasks-col-widths-v3";
const clampW = (n: number, key?: string) =>
  Math.min(MYTASKS_MAX_W, Math.max(key ? (MYTASKS_COL_MIN_W[key] ?? MYTASKS_MIN_W) : MYTASKS_MIN_W, Math.round(n)));
const MYTASKS_LOG_PX = 72; // cột "Ghi giờ"
const MYTASKS_ACT_PX = 96; // cột "Thao tác" (Sửa + Xóa)
const MYTASKS_COL_PX: Record<string, number> = {
  sumId: 160,
  project: 180,
  name: 340,
  discipline: 150,
  assignee: 200,
  priority: 90,
  status: 160,
  start: 100,
  deadline: 110,
  actualEnd: 180,
};
// Thứ tự cột: Mã · Dự án · Công việc · Bộ môn · Người · Ưu tiên · Trạng thái · Bắt đầu · Hạn · Thực tế HT.
const MYTASKS_SORT_KEYS = [
  "sumId",
  "project",
  "name",
  "discipline",
  "assignee",
  "priority",
  "status",
  "start",
  "deadline",
  "actualEnd",
] as const;

export function TasksClient({
  currentUserId,
  canManage,
  isAdmin,
  tasks,
  workGroups,
  disciplines,
  phases,
  projects,
  users,
  approvers,
  catalog,
}: {
  currentUserId: string;
  canManage: boolean;
  isAdmin: boolean;
  tasks: TaskRow[];
  // workGroups kèm abbr/lastSeq (gốc mã) cho lưới "Thêm công việc".
  workGroups: (Opt & { abbr?: string | null; lastSeq?: number })[];
  disciplines: Opt[];
  phases: Opt[];
  projects: ProjectOpt[];
  users: UserOpt[];
  approvers: UserOpt[];
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
  const [addOpen, setAddOpen] = React.useState(false);
  const [logging, setLogging] = React.useState<TaskRow | null>(null); // ghi giờ cho việc này
  // Lọc nhanh từ dải KPI (riêng với dropdown Trạng thái để không xung đột).
  const [quick, setQuick] = React.useState<"" | "QUA_HAN" | "SAP_HAN" | "DANG_LAM">("");

  // Bề rộng cột bảng (kéo giãn) — nhớ bằng localStorage.
  const [colWidths, setColWidths] = React.useState<Record<string, number>>(() => ({
    ...MYTASKS_COL_PX,
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
        const raw = window.localStorage.getItem(MYTASKS_WIDTH_KEY);
        if (raw) setColWidths((w) => ({ ...w, ...(JSON.parse(raw) as Record<string, number>) }));
      } catch {
        /* bỏ qua localStorage lỗi */
      }
    }
    loadWidths();
  }, []);
  const persistWidths = (w: Record<string, number>) => {
    try {
      window.localStorage.setItem(MYTASKS_WIDTH_KEY, JSON.stringify(w));
    } catch {
      /* bỏ qua localStorage lỗi */
    }
  };
  const setColW = (k: string, px: number) => setColWidths((w) => ({ ...w, [k]: px }));
  const endResize = () => persistWidths(colWidthsRef.current);
  const resetColW = (k: string) => {
    const nw = { ...colWidthsRef.current, [k]: MYTASKS_COL_PX[k] };
    setColWidths(nw);
    persistWidths(nw);
  };

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

  // Nền KPI: lọc theo dự án/bộ môn/ưu tiên/tìm-kiếm/thời-gian, NHƯNG bỏ qua trạng thái,
  // lọc nhanh KPI và tab nhóm → số trên dải KPI ổn định khi bấm vào một KPI.
  const kpiBase = React.useMemo(() => {
    const q = removeVietnameseTones(deferredSearch.trim());
    return tasks.filter((t) => {
      if (f.projectId && t.projectId !== f.projectId) return false;
      if (f.disciplineId && t.disciplineId !== f.disciplineId) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (q && !(haystacks.get(t.id) ?? "").includes(q)) return false;
      // Lọc theo thời gian (theo Hạn). "Quá hạn" dùng lại isOverdue.
      if (f.datePreset === "QUA_HAN") {
        if (!isOverdue(t)) return false;
      } else if (f.datePreset) {
        const { from, to } =
          f.datePreset === "CUSTOM" ? { from: f.dateFrom, to: f.dateTo } : presetRange(f.datePreset);
        if (from || to) {
          if (!t.plannedEnd) return false; // không có Hạn → ẩn khi đang lọc thời gian
          if (from && t.plannedEnd < from) return false;
          if (to && t.plannedEnd > to) return false;
        }
      }
      return true;
    });
  }, [tasks, f.projectId, f.disciplineId, f.priority, f.datePreset, f.dateFrom, f.dateTo, deferredSearch, haystacks]);

  const kpi = React.useMemo(() => {
    let overdue = 0;
    let soon = 0;
    let doing = 0;
    for (const t of kpiBase) {
      if (isOverdue(t)) overdue++;
      else if (isDueSoon(t)) soon++;
      if (effOf(t) === "DANG_LAM") doing++;
    }
    return { overdue, soon, doing };
  }, [kpiBase]);

  // Áp thêm dropdown Trạng thái + lọc nhanh KPI (vẫn TRỪ tab nhóm để đếm theo tab).
  const base = React.useMemo(() => {
    return kpiBase.filter((t) => {
      if (f.status && effOf(t) !== f.status) return false;
      if (quick === "QUA_HAN" && !isOverdue(t)) return false;
      if (quick === "SAP_HAN" && !isDueSoon(t)) return false;
      if (quick === "DANG_LAM" && effOf(t) !== "DANG_LAM") return false;
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

  // Số việc quá hạn trên TOÀN bộ việc của tôi (không phụ thuộc bộ lọc) — đã hiển thị ở KPI.
  // ---- Sắp xếp ----
  type SortKey =
    | "sumId"
    | "name"
    | "project"
    | "discipline"
    | "assignee"
    | "priority"
    | "status"
    | "start"
    | "deadline"
    | "actualEnd";
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
        return removeVietnameseTones(t.projectName ?? "");
      case "discipline":
        return removeVietnameseTones(t.disciplineName ?? "");
      case "assignee":
        return removeVietnameseTones(t.assigneeNames.join(", "));
      case "priority":
        return PRIO_ORDER[t.priority] ?? 9;
      case "status":
        return STATUS_ORDER[effOf(t)] ?? 9;
      case "start":
        return t.plannedStart || "9999-12-31";
      case "deadline":
        return t.plannedEnd || "9999-12-31";
      case "actualEnd":
        return t.actualEnd || "9999-12-31";
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

  // Ô tiêu đề: bấm nhãn để sắp xếp + kéo mép phải để giãn cột.
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
            setColW(s.key, clampW(s.w + (e.clientX - s.x), s.key));
          }}
          onPointerUp={(e) => {
            if (!resizeStartRef.current) return;
            resizeStartRef.current = null;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            endResize();
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

  // Đánh dấu/bỏ hoàn thành bằng ngày Thực tế hoàn thành → trạng thái tự suy (không set trạng thái tay).
  async function onCompletion(t: TaskRow, value: string) {
    // Chặn sớm: ngày hoàn thành không được trước ngày bắt đầu.
    if (value) {
      const err = completionDateError(value, t.plannedStart || null);
      if (err) {
        toast.error(err);
        return;
      }
    }
    const res = await setTaskCompletion({ id: t.id, actualEnd: value || null });
    if (res.ok) {
      const late = value && t.plannedEnd && value > t.plannedEnd;
      toast.success(value ? (late ? "Đã hoàn thành — TRỄ HẠN" : "Đã đánh dấu hoàn thành") : "Đã bỏ hoàn thành");
    } else toast.error(res.error);
  }

  // Duyệt khởi tạo (luồng Thêm công việc) — mở khóa nhập thời gian.
  async function approveStart(t: TaskRow) {
    const res = await setTaskStartApproval({ id: t.id, approved: true });
    if (res.ok) toast.success("Đã duyệt — cho phép nhập thời gian");
    else toast.error(res.error);
  }

  async function onDelete(t: TaskRow) {
    if (!confirm(`Xóa công việc "${t.name}"?`)) return;
    const res = await deleteTask(t.id);
    if (res.ok) toast.success("Đã xóa");
    else toast.error(res.error);
  }

  function renderRow(t: TaskRow) {
    const overdue = isOverdue(t);
    const eff = effOf(t);
    const pendingApproval = isPendingApproval(t);
    const late = isCompletedLate(t);
    const canApproveStart = isAdmin || t.approverId === currentUserId;
    // Sửa được Thực tế hoàn thành nếu là quản lý hoặc người được giao việc (và việc KHÔNG chờ duyệt).
    const canEditDone = (canManage || t.assigneeIds.includes(currentUserId)) && !pendingApproval;
    return (
      <TableRow key={t.id}>
        <TableCell className="font-mono text-xs">{t.sumId ?? "—"}</TableCell>
        <TableCell className="text-xs">{t.projectName ?? "—"}</TableCell>
        <TableCell className="max-w-xs">
          <div className="font-medium">{t.name}</div>
          {SHOW_TASK_PATH ? (
            <div className="text-xs text-muted-foreground">
              {[t.workGroupName, t.level2, t.level3].filter(Boolean).join(" › ")}
            </div>
          ) : null}
        </TableCell>
        <TableCell className="text-xs">{t.disciplineName ?? "—"}</TableCell>
        <TableCell className="text-xs">{t.assigneeNames.join(", ") || "—"}</TableCell>
        <TableCell>
          <Badge variant={priorityVariant(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
        </TableCell>
        {/* Trạng thái: CHỈ XEM (suy từ Thực tế hoàn thành/ngày) + cờ duyệt (tooltip người duyệt). */}
        <TableCell>
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-1">
              <Badge variant={statusVariant(eff)}>{TASK_STATUS_LABEL[eff] ?? eff}</Badge>
              {late ? (
                <Badge variant="destructive" title={`Hoàn thành trễ hạn (hạn ${t.plannedEnd})`}>
                  Trễ hạn
                </Badge>
              ) : null}
            </div>
            {pendingApproval ? (
              <div className="flex items-center gap-1">
                <Badge variant="warning" title={t.approverName ? `Chờ ${t.approverName} duyệt` : "Chờ duyệt"}>
                  Chờ duyệt
                </Badge>
                {canApproveStart ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    title="Duyệt — cho phép nhập thời gian"
                    onClick={() => approveStart(t)}
                  >
                    <ShieldCheck className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            ) : null}
            {!pendingApproval ? (
              <Badge
                variant="success"
                title={t.approvedByName ? `Đã duyệt bởi ${t.approvedByName}` : "Đã giao / được duyệt để làm"}
              >
                Đã duyệt
              </Badge>
            ) : null}
          </div>
        </TableCell>
        {/* Ngày bắt đầu — chỉ xem */}
        <TableCell className="text-xs text-muted-foreground">{t.plannedStart || "—"}</TableCell>
        {/* Hạn — chỉ xem (đỏ nếu quá hạn) */}
        <TableCell className="text-xs">
          {t.plannedEnd ? (
            <span className={cn(overdue && "font-medium text-red-600")}>{t.plannedEnd}</span>
          ) : (
            "—"
          )}
        </TableCell>
        {/* Thực tế hoàn thành — nhập ngày → trạng thái tự nhảy Hoàn thành (giống /manage).
            Ô input cần ~150px để Chromium hiện đủ "dd/mm/yyyy" + icon lịch (hẹp hơn sẽ bị cắt icon)
            → cột rộng + giảm padding ô (px-1) để input đủ rộng. */}
        <TableCell className="px-1">
          <Input
            type="date"
            className={cn("h-9 w-full px-2 text-xs", late && "font-medium text-red-600")}
            value={t.actualEnd}
            min={t.plannedStart || undefined}
            disabled={!canEditDone}
            title={
              pendingApproval
                ? "Việc đang chờ duyệt — chưa thể nhập"
                : canEditDone
                  ? "Đặt/đổi ngày hoàn thành thực tế (không trước ngày bắt đầu)"
                  : "Chỉ người được giao hoặc quản lý"
            }
            onChange={(e) => onCompletion(t, e.target.value)}
          />
        </TableCell>
        {/* Ghi giờ — đặc thù trang cá nhân (khóa khi việc đang chờ duyệt) */}
        <TableCell className="px-2 text-center">
          <Button
            size="icon"
            variant="ghost"
            disabled={pendingApproval}
            onClick={() => setLogging(t)}
            title={pendingApproval ? "Việc đang chờ duyệt — chưa thể ghi giờ" : "Ghi giờ cho công việc này"}
          >
            <Clock className="size-4" />
          </Button>
        </TableCell>
        {canManage ? (
          <TableCell className="px-2">
            <div className="flex items-center justify-center gap-0">
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

  function clearAllFilters() {
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
    setQuick("");
  }

  // Tổng cột để đặt min-width cho bảng cuộn ngang (table-fixed).
  const tableMinWidth =
    MYTASKS_LOG_PX +
    (canManage ? MYTASKS_ACT_PX : 0) +
    MYTASKS_SORT_KEYS.reduce((s, k) => s + colWidths[k], 0);
  const colCount = MYTASKS_SORT_KEYS.length + 1 + (canManage ? 1 : 0); // + Ghi giờ (+ Thao tác)

  return (
    <div className="space-y-4 pb-[5px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Công việc của tôi</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} / {tasks.length} việc được giao
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Thêm công việc
        </Button>
      </div>

      {/* Dải KPI cảnh báo — bấm để lọc nhanh */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { key: "QUA_HAN", label: "Quá hạn", n: kpi.overdue, Icon: AlertTriangle, tone: "border-red-200 bg-red-50 text-red-700" },
            { key: "SAP_HAN", label: "Sắp đến hạn (≤3 ngày)", n: kpi.soon, Icon: Clock, tone: "border-amber-200 bg-amber-50 text-amber-700" },
            { key: "DANG_LAM", label: "Đang làm", n: kpi.doing, Icon: Activity, tone: "border-blue-200 bg-blue-50 text-blue-700" },
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
            activeWg === "" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
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
              activeWg === w.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
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
            onClick={clearAllFilters}
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

      <Table
        className="table-fixed"
        wrapperClassName="max-h-[calc(100svh-40px)] overflow-auto rounded-lg border"
        style={{ minWidth: tableMinWidth }}
      >
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {renderHeadCell("Mã", "sumId")}
            {renderHeadCell("Dự án", "project")}
            {renderHeadCell("Công việc", "name")}
            {renderHeadCell("Bộ môn", "discipline")}
            {renderHeadCell("Người thực hiện", "assignee")}
            {renderHeadCell("Ưu tiên", "priority")}
            {renderHeadCell("Trạng thái", "status")}
            {renderHeadCell("Ngày bđ", "start")}
            {renderHeadCell("Hạn", "deadline")}
            {renderHeadCell("Thực tế ht", "actualEnd")}
            <TableHead style={{ width: MYTASKS_LOG_PX }} className="px-2 text-center">
              Ghi giờ
            </TableHead>
            {canManage ? (
              <TableHead style={{ width: MYTASKS_ACT_PX }} className="px-2 text-center">
                Thao tác
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((t) => renderRow(t))}
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="py-8 text-center text-muted-foreground">
                Không có công việc phù hợp
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {editing && canManage ? (
        <TaskDialog
          task={editing}
          defaultWorkGroupId={activeWg}
          workGroups={workGroups}
          disciplines={disciplines}
          phases={phases}
          projects={projects}
          users={users}
          catalog={catalog}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {/* "Thêm công việc" (tự note): lưới có cột Người duyệt, tự gán mình làm người thực hiện;
          việc tạo ra ở trạng thái chờ sếp duyệt. */}
      {addOpen ? (
        <Modal
          open
          onClose={() => setAddOpen(false)}
          title="Thêm công việc (chờ duyệt)"
          className="max-w-[96vw]"
        >
          <AssignClient
            embedded
            withApprover
            approvers={approvers}
            selfAssignUserId={currentUserId}
            saveAction={saveMyTasks}
            workGroups={workGroups}
            disciplines={disciplines}
            phases={phases}
            projects={projects}
            users={users}
            catalog={catalog}
            onSaved={() => setAddOpen(false)}
          />
        </Modal>
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
    <Modal open onClose={onClose} title={task ? "Sửa công việc" : "Thêm công việc"} className="max-w-2xl">
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
