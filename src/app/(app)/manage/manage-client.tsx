"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Filter,
  Flag,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserX,
  Users,
  X,
} from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AssignClient, type ProjectOpt } from "@/app/(app)/assign/assign-client";
import { TaskRowEditor } from "@/components/task-row-editor";
import { UserMultiSelect } from "@/components/user-multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
  priorityVariant,
} from "@/lib/labels";
import { cn, removeVietnameseTones } from "@/lib/utils";
import { PHONG_LABEL, phongOf } from "@/lib/dept-map";
import { completionDateError, effectiveStatus, isCompletedLate } from "@/lib/task-status";
import {
  bulkReassign,
  bulkSetDeadline,
  bulkSetMeasureNorm,
  bulkSetPriority,
  bulkSetStatus,
  deleteTask,
  setTaskCompletion,
  setTaskPaused,
  setTaskStartApproval,
  updateTaskStatus,
} from "@/server/actions/tasks";

// Nhóm việc hiện Level 3 ở cột "Dự án" (vì nhóm này không gắn dự án).
const WG_SHOW_L3_IN_PROJECT = "Phát triển BIM Tools";

// Tinh chỉnh hiển thị bảng (mặc định chốt theo bản thiết kế — chưa làm panel Tweaks).
const DENSITY: "compact" | "regular" | "comfy" = "regular";
const GROUPING: "dim" | "merge" | "flat" = "dim"; // gộp cấp trực quan: làm mờ giá trị cha lặp
const FREEZE = true; // ghim checkbox + 4 cột phân cấp khi cuộn ngang
const SHOW_MA = false; // ẩn cột Mã mặc định

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
  disciplineCode: string | null;
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
  // Duyệt khởi tạo (luồng "Thêm công việc"): approverId != null & !startApproved => đang chờ duyệt.
  approverId: string | null;
  approverName: string | null;
  startApproved: boolean;
  assigneeIds: string[];
  assigneeNames: string[];
};

// Việc đang "chờ duyệt khởi tạo" → khóa nhập thời gian.
function isPendingApproval(t: TaskRow): boolean {
  return !!t.approverId && !t.startApproved;
}

function isOverdue(t: TaskRow): boolean {
  if (!t.plannedEnd || t.status === "HOAN_THANH") return false;
  return new Date(t.plannedEnd) < new Date(new Date().toDateString());
}

// Trạng thái suy diễn (gồm Quá hạn + nâng "Đang thực hiện" khi đã khai báo thời gian
// & đã giao người). KHÔNG dùng cho Kanban (kéo-thả ghi status thật).
function effOf(t: TaskRow): string {
  return effectiveStatus({
    status: t.status,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    assigneeCount: t.assigneeIds.length,
  });
}

// Trạng thái duyệt cho cột Tình trạng (dòng phụ): chờ duyệt khởi tạo / đã hoàn thành chưa duyệt / đã duyệt.
type DuyetState = "CHO_DUYET" | "CHUA_DUYET" | "DA_DUYET";
function duyetState(t: TaskRow): DuyetState {
  if (isPendingApproval(t)) return "CHO_DUYET";
  if (effOf(t) === "HOAN_THANH" && !t.approved) return "CHUA_DUYET";
  return "DA_DUYET";
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

// YYYY-MM-DD theo giờ địa phương (tránh lệch timezone của toISOString).
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Tháng hiện tại (YYYY-MM) — mốc cho preset "Trong tháng này".
const THIS_MONTH = localIso(new Date()).slice(0, 7);
function thisMonth(iso: string): boolean {
  return !!iso && iso.slice(0, 7) === THIS_MONTH;
}

const norm = removeVietnameseTones;

// ---- Cấu hình cột bảng (4 cấp phân cấp: Dự án → Loại hình → Hạng mục → Công việc) ----
type FilterKind = "text" | "multi" | "status" | "date";
type SortKey =
  | "sumId"
  | "duAn"
  | "loaiHinh"
  | "hangMuc"
  | "congViec"
  | "boMon"
  | "thucHien"
  | "uuTien"
  | "tinhTrang"
  | "batDau"
  | "ketThuc"
  | "thucTe";
type ColDef = {
  key: SortKey;
  label: string;
  lvl?: 1 | 2 | 3 | 4; // huy hiệu cấp + ghim trái
  leaf?: boolean; // cấp lá (Công việc)
  mono?: boolean;
  filter: FilterKind;
  opts?: string[]; // cho filter "multi"
  labelMap?: Record<string, string>;
};

// Giá trị text của một ô (cho hiển thị + lọc multi). "thucHien" trả mảng (xem riêng).
function colText(t: TaskRow, key: SortKey): string {
  switch (key) {
    case "sumId":
      return t.sumId ?? "";
    case "duAn":
      return t.projectName ?? (t.workGroupName === WG_SHOW_L3_IN_PROJECT ? (t.level3 ?? "") : "");
    case "loaiHinh":
      return t.level2 ?? "";
    case "hangMuc":
      return t.level3 ?? "";
    case "congViec":
      return t.name;
    case "boMon":
      return t.disciplineName ?? "";
    case "batDau":
      return t.plannedStart;
    case "ketThuc":
      return t.plannedEnd;
    case "thucTe":
      return t.actualEnd;
    default:
      return "";
  }
}

// Preset của các cột ngày.
const DATE_PRESETS: Record<string, [string, string][]> = {
  batDau: [
    ["thang", "Trong tháng này"],
    ["co", "Đã có ngày"],
    ["trong", "Chưa có ngày"],
  ],
  ketThuc: [
    ["quahan", "Quá hạn"],
    ["sap", "Sắp đến hạn (≤3 ngày)"],
    ["thang", "Trong tháng này"],
    ["co", "Đã có ngày"],
    ["trong", "Chưa có ngày"],
  ],
  thucTe: [
    ["co", "Đã hoàn thành"],
    ["trong", "Chưa hoàn thành"],
    ["tre", "Hoàn thành trễ hạn"],
  ],
};
function matchDate(t: TaskRow, key: SortKey, val: string): boolean {
  const iso = colText(t, key);
  switch (val) {
    case "co":
      return !!iso;
    case "trong":
      return !iso;
    case "thang":
      return thisMonth(iso);
    case "quahan":
      return isOverdue(t);
    case "sap":
      return isDueSoon(t);
    case "tre":
      return isCompletedLate(t);
    default:
      return true;
  }
}

type StatusFilterVal = { status: string[]; duyet: string[]; tre?: boolean };
type ColFilterVal = string | string[] | StatusFilterVal | undefined;

function colActive(col: ColDef, v: ColFilterVal): boolean {
  if (v == null) return false;
  if (col.filter === "status") {
    const sv = v as StatusFilterVal;
    return (sv.status?.length ?? 0) > 0 || (sv.duyet?.length ?? 0) > 0 || !!sv.tre;
  }
  if (col.filter === "multi") return Array.isArray(v) && v.length > 0;
  return !!v; // text / date string
}

function rowMatchesCol(t: TaskRow, col: ColDef, v: ColFilterVal): boolean {
  if (!colActive(col, v)) return true;
  switch (col.filter) {
    case "text":
      return norm(colText(t, col.key)).includes(norm(v as string));
    case "date":
      return matchDate(t, col.key, v as string);
    case "status": {
      const sv = v as StatusFilterVal;
      const okS = !sv.status?.length || sv.status.includes(effOf(t));
      const okD = !sv.duyet?.length || sv.duyet.includes(duyetState(t));
      const okTre = !sv.tre || isCompletedLate(t);
      return okS && okD && okTre;
    }
    case "multi": {
      const arr = v as string[];
      if (col.key === "thucHien") return arr.some((x) => t.assigneeNames.includes(x));
      if (col.key === "uuTien") return arr.includes(t.priority);
      return arr.includes(colText(t, col.key));
    }
    default:
      return true;
  }
}

// Tóm tắt điều kiện lọc của 1 cột → chip.
function chipText(col: ColDef, v: ColFilterVal): string {
  if (col.filter === "text") return `"${v as string}"`;
  if (col.filter === "date") {
    const found = DATE_PRESETS[col.key]?.find(([k]) => k === (v as string));
    return found ? found[1] : (v as string);
  }
  if (col.filter === "status") {
    const sv = v as StatusFilterVal;
    const parts = [
      ...(sv.status ?? []).map((s) => TASK_STATUS_LABEL[s] ?? s),
      ...(sv.duyet ?? []).map((d) => DUYET_LABEL[d] ?? d),
      ...(sv.tre ? ["Trễ hạn"] : []),
    ];
    return parts.length <= 2 ? parts.join(", ") : `${parts.length} mục`;
  }
  const arr = v as string[];
  if (arr.length === 1) return col.labelMap ? (col.labelMap[arr[0]] ?? arr[0]) : arr[0];
  return `${arr.length} mục`;
}

const DUYET_LABEL: Record<string, string> = {
  DA_DUYET: "Đã duyệt",
  CHO_DUYET: "Chờ duyệt",
  CHUA_DUYET: "Chưa duyệt",
};

// Pill mềm "chấm + chữ" cho cột Tình trạng (nhẹ màu hơn badge tô đặc).
const STATUS_SOFT: Record<string, { dot: string; pill: string }> = {
  CHUA_LAM: { dot: "bg-slate-400", pill: "bg-slate-50 text-slate-600 ring-slate-200" },
  DANG_LAM: { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 ring-blue-200" },
  HOAN_THANH: { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  TAM_DUNG: { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  QUA_HAN: { dot: "bg-red-500", pill: "bg-red-50 text-red-700 ring-red-200" },
};

// Kéo giãn cột bảng /manage.
const MANAGE_MIN_W = 80;
const MANAGE_MAX_W = 600;
const MANAGE_COL_MIN_W: Record<string, number> = { thucTe: 120 };
const MANAGE_WIDTH_KEY = "manage-col-widths-v4";
const MANAGE_SEL_PX = 36; // cột checkbox (ghim trái)
const MANAGE_ACT_PX = 132; // cột "Thao tác"
const MANAGE_COL_W: Record<string, number> = {
  sumId: 150,
  duAn: 162,
  loaiHinh: 150,
  hangMuc: 168,
  congViec: 212,
  boMon: 120,
  thucHien: 170,
  uuTien: 106,
  tinhTrang: 160,
  batDau: 116,
  ketThuc: 116,
  thucTe: 150,
};
const clampManageW = (n: number, key?: string) =>
  Math.min(MANAGE_MAX_W, Math.max(key ? (MANAGE_COL_MIN_W[key] ?? MANAGE_MIN_W) : MANAGE_MIN_W, Math.round(n)));

// Nhãn gọn cho khoảng Hạn đến từ deep-link Báo cáo (năm trọn / tất cả thời gian / khoảng tùy ý).
function rangeLabel(from: string, to: string): string {
  if (from === "0001-01-01" && to === "9999-12-31") return "tất cả thời gian (có hạn)";
  const m = /^(\d{4})-01-01$/.exec(from);
  if (m && to === `${m[1]}-12-31`) return `năm ${m[1]}`;
  return `${from || "?"} → ${to || "?"}`;
}

// Thứ tự cột Kanban + số thẻ tối đa hiển thị mỗi cột trước khi gập (bấm "xem thêm").
const KANBAN_ORDER = ["CHUA_LAM", "DANG_LAM", "TAM_DUNG", "HOAN_THANH"] as const;
const KANBAN_COL_LIMIT = 40;

export function ManageClient({
  currentUserId,
  canManage,
  canAssign,
  tasks,
  workGroups,
  disciplines,
  phases,
  projects,
  users,
  catalog,
  initial,
}: {
  currentUserId: string;
  canManage: boolean;
  // canAssign (ADMIN/Cấp 1/Cấp 2): được tạo việc bằng lưới "Thêm công việc".
  canAssign: boolean;
  isAdmin: boolean;
  tasks: TaskRow[];
  workGroups: WgOpt[];
  disciplines: Opt[];
  phases: Opt[];
  projects: ProjectOpt[];
  users: UserOpt[];
  catalog: Catalog;
  // Bộ lọc khởi tạo từ deep-link Báo cáo (?user/group/phong/from/to) — server đọc & truyền xuống.
  initial?: { user: string; group: string; phong: string; from: string; to: string };
}) {
  const router = useRouter();
  // Deep-link từ Báo cáo: chỉ còn các điều kiện không nằm trong filter-theo-cột
  // (1 nhân sự, 1 Phòng, khoảng Hạn từ/đến). Các điều kiện còn lại đã chuyển thành filter cột.
  const [f, setF] = React.useState({
    userId: initial?.user ?? "",
    phong: initial?.phong ?? "",
    dateFrom: initial?.from ?? "",
    dateTo: initial?.to ?? "",
  });
  const [activeWg, setActiveWg] = React.useState(initial?.group ?? ""); // "" = Tất cả (tab Bảng)
  const fromReport = Boolean(
    initial && (initial.user || initial.group || initial.phong || initial.from || initial.to),
  );
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [editing, setEditing] = React.useState<TaskRow | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  // Lọc nhanh từ dải KPI.
  const [quick, setQuick] = React.useState<"" | "QUA_HAN" | "SAP_HAN" | "CHUA_GIAO" | "DANG_LAM">("");
  // Chế độ xem: gom theo người (mặc định) / bảng phẳng / Kanban.
  const [viewMode, setViewMode] = React.useState<"people" | "table" | "kanban">("people");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [dragCol, setDragCol] = React.useState<string | null>(null);
  const [expandedCols, setExpandedCols] = React.useState<Set<string>>(() => new Set());

  // Lọc theo từng cột (funnel + popover). key = col.key.
  const [colFilters, setColFilters] = React.useState<Record<string, ColFilterVal>>({});
  // Popover lọc đang mở: { key, rect }.
  const [openFilter, setOpenFilter] = React.useState<{ key: SortKey; rect: DOMRect } | null>(null);
  const setCF = (k: SortKey, v: ColFilterVal) => setColFilters((s) => ({ ...s, [k]: v }));
  const clearCol = (k: SortKey) =>
    setColFilters((s) => {
      const n = { ...s };
      delete n[k];
      return n;
    });

  // Bề rộng cột bảng (kéo giãn) — nhớ bằng localStorage.
  const [colWidths, setColWidths] = React.useState<Record<string, number>>(() => ({ ...MANAGE_COL_W }));
  const colWidthsRef = React.useRef(colWidths);
  React.useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);
  const draggingRef = React.useRef(false);
  const resizeStartRef = React.useRef<{ x: number; w: number; key: string } | null>(null);
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MANAGE_WIDTH_KEY);
      // Nạp bề rộng đã lưu 1 lần khi mount (window chỉ có ở client) — chấp nhận set-state trong effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setColWidths((w) => ({ ...w, ...(JSON.parse(raw) as Record<string, number>) }));
    } catch {
      /* bỏ qua localStorage lỗi */
    }
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
    const nw = { ...colWidthsRef.current, [k]: MANAGE_COL_W[k] };
    setColWidths(nw);
    persistWidths(nw);
  };

  // Chọn nhiều việc để thao tác hàng loạt.
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [reassign, setReassign] = React.useState<{
    ids: string[];
    mode: "replace" | "add";
    users: string[];
  } | null>(null);
  const [deadline, setDeadline] = React.useState<{ ids: string[]; date: string } | null>(null);

  // Chỉ mục tìm kiếm: chuẩn-hóa bỏ dấu MỘT LẦN cho mỗi công việc.
  const haystacks = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) {
      m.set(
        t.id,
        norm(
          [t.name, t.sumId, t.level2, t.level3, t.level5, t.assigneeNames.join(" ")]
            .filter(Boolean)
            .join(" "),
        ),
      );
    }
    return m;
  }, [tasks]);

  // Giá trị phân biệt cho các cột lọc "multi".
  const distinct = React.useMemo(() => {
    const uniq = (vals: string[]) =>
      [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    return {
      duAn: uniq(tasks.map((t) => colText(t, "duAn"))),
      loaiHinh: uniq(tasks.map((t) => colText(t, "loaiHinh"))),
      hangMuc: uniq(tasks.map((t) => colText(t, "hangMuc"))),
      congViec: uniq(tasks.map((t) => colText(t, "congViec"))),
      boMon: uniq(tasks.map((t) => colText(t, "boMon"))),
      thucHien: uniq(tasks.flatMap((t) => t.assigneeNames)),
    };
  }, [tasks]);

  // Danh sách cột (ẩn cột Mã mặc định).
  const cols = React.useMemo<ColDef[]>(() => {
    const all: ColDef[] = [
      { key: "sumId", label: "Mã", mono: true, filter: "text" },
      { key: "duAn", label: "Dự án", lvl: 1, filter: "multi", opts: distinct.duAn },
      { key: "loaiHinh", label: "Hạng mục", lvl: 2, filter: "multi", opts: distinct.loaiHinh },
      { key: "hangMuc", label: "Chi tiết", lvl: 3, filter: "multi", opts: distinct.hangMuc },
      { key: "congViec", label: "Công việc", lvl: 4, leaf: true, filter: "multi", opts: distinct.congViec },
      { key: "boMon", label: "Bộ môn", filter: "multi", opts: distinct.boMon },
      { key: "thucHien", label: "Thực hiện", filter: "multi", opts: distinct.thucHien },
      {
        key: "uuTien",
        label: "Ưu tiên",
        filter: "multi",
        opts: [...PRIORITY_OPTIONS],
        labelMap: PRIORITY_LABEL,
      },
      { key: "tinhTrang", label: "Tình trạng", filter: "status" },
      { key: "batDau", label: "Bắt đầu", filter: "date" },
      { key: "ketThuc", label: "Kết thúc", filter: "date" },
      { key: "thucTe", label: "Hoàn thành thực tế", filter: "date" },
    ];
    return SHOW_MA ? all : all.filter((c) => c.key !== "sumId");
  }, [distinct]);

  const activeCols = cols.filter((c) => colActive(c, colFilters[c.key]));

  // Nền KPI: deep-link + tìm + filter cột (KHÔNG gồm quick & tab) → số KPI ổn định khi bấm.
  const kpiBase = React.useMemo(() => {
    const q = norm(deferredSearch.trim());
    return tasks.filter((t) => {
      // deep-link Báo cáo
      if (f.userId && !t.assigneeIds.includes(f.userId)) return false;
      if (f.phong && phongOf(t.disciplineCode) !== f.phong) return false;
      if (f.dateFrom || f.dateTo) {
        if (!t.plannedEnd) return false;
        if (f.dateFrom && t.plannedEnd < f.dateFrom) return false;
        if (f.dateTo && t.plannedEnd > f.dateTo) return false;
      }
      if (q && !(haystacks.get(t.id) ?? "").includes(q)) return false;
      for (const c of cols) if (!rowMatchesCol(t, c, colFilters[c.key])) return false;
      return true;
    });
  }, [tasks, f.userId, f.phong, f.dateFrom, f.dateTo, deferredSearch, haystacks, cols, colFilters]);

  const kpi = React.useMemo(() => {
    // KPI bám theo tab nhóm (+ tìm kiếm + lọc cột) nhưng KHÔNG bám quick:
    // bấm vào 1 thẻ không làm các thẻ khác về 0.
    const scope = activeWg ? kpiBase.filter((t) => t.workGroupId === activeWg) : kpiBase;
    let overdue = 0;
    let soon = 0;
    let unassigned = 0;
    let doing = 0;
    let progSum = 0;
    for (const t of scope) {
      if (isOverdue(t)) overdue++;
      else if (isDueSoon(t)) soon++;
      if (t.assigneeIds.length === 0) unassigned++;
      if (effOf(t) === "DANG_LAM") doing++;
      progSum += t.progressPercent;
    }
    return {
      overdue,
      soon,
      unassigned,
      doing,
      avg: scope.length ? Math.round(progSum / scope.length) : 0,
    };
  }, [kpiBase, activeWg]);

  // Áp lọc nhanh KPI (vẫn TRỪ tab nhóm để đếm theo tab).
  const base = React.useMemo(() => {
    return kpiBase.filter((t) => {
      if (quick === "QUA_HAN" && !isOverdue(t)) return false;
      if (quick === "SAP_HAN" && !isDueSoon(t)) return false;
      if (quick === "CHUA_GIAO" && t.assigneeIds.length !== 0) return false;
      if (quick === "DANG_LAM" && effOf(t) !== "DANG_LAM") return false;
      return true;
    });
  }, [kpiBase, quick]);

  const wgCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of base) m.set(t.workGroupId, (m.get(t.workGroupId) ?? 0) + 1);
    return m;
  }, [base]);

  const filtered = React.useMemo(
    () => (activeWg ? base.filter((t) => t.workGroupId === activeWg) : base),
    [base, activeWg],
  );

  // ---- Sắp xếp ---- (mặc định theo phân cấp Dự án → … để đọc như cây)
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "duAn",
    dir: "asc",
  });

  const PRIO_ORDER: Record<string, number> = { CAO: 0, TRUNG_BINH: 1, THAP: 2 };
  const STATUS_ORDER: Record<string, number> = {
    QUA_HAN: 0,
    DANG_LAM: 1,
    CHUA_LAM: 2,
    TAM_DUNG: 3,
    HOAN_THANH: 4,
  };
  const hierKey = (t: TaskRow) =>
    norm(colText(t, "duAn") + colText(t, "loaiHinh") + colText(t, "hangMuc") + colText(t, "congViec"));
  function sortVal(t: TaskRow, key: SortKey): string | number {
    switch (key) {
      case "uuTien":
        return PRIO_ORDER[t.priority] ?? 9;
      case "tinhTrang":
        return STATUS_ORDER[effOf(t)] ?? 9;
      case "thucHien":
        return norm(t.assigneeNames.join(", "));
      case "batDau":
        return t.plannedStart || "9999-12-31";
      case "ketThuc":
        return t.plannedEnd || "9999-12-31";
      case "thucTe":
        return t.actualEnd || "9999-12-31";
      default:
        return norm(colText(t, key));
    }
  }
  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortVal(a, sort.key);
      const vb = sortVal(b, sort.key);
      let c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "vi");
      if (c === 0) c = hierKey(a).localeCompare(hierKey(b), "vi"); // tie-break giữ gom nhóm
      return sort.dir === "asc" ? c : -c;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  // Cờ gộp cấp (dedup giá trị cha lặp ở dòng liền kề) — tính trên danh sách đã sort.
  const rowMeta = React.useMemo(
    () =>
      sorted.map((t, i) => {
        const p = sorted[i - 1];
        const sameDu = !!p && colText(p, "duAn") === colText(t, "duAn");
        const sameLoai = sameDu && colText(p, "loaiHinh") === colText(t, "loaiHinh");
        const sameHang = sameLoai && colText(p, "hangMuc") === colText(t, "hangMuc");
        return {
          repeat: { duAn: sameDu, loaiHinh: sameLoai, hangMuc: sameHang } as Record<string, boolean>,
          newProject: !sameDu,
        };
      }),
    [sorted],
  );

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  // ---- Gom theo người ----
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
      // Trong mỗi nhóm: sắp theo CỘT đang chọn ở header (để mũi tên ⇅ có tác dụng cả ở view này),
      // tie-break theo chuỗi phân cấp để giữ gom nhóm.
      g.tasks.sort((a, b) => {
        const va = sortVal(a, sort.key);
        const vb = sortVal(b, sort.key);
        let c =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb), "vi");
        if (c === 0) c = hierKey(a).localeCompare(hierKey(b), "vi");
        return sort.dir === "asc" ? c : -c;
      });
      return { ...g, overdue: g.tasks.filter(isOverdue).length };
    });
    arr.sort((a, b) => {
      if (a.key === NONE_KEY) return -1;
      if (b.key === NONE_KEY) return 1;
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      return a.name.localeCompare(b.name, "vi");
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filtered, sort]);

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

  // Việc được phép sửa Thực tế HT: quản lý hoặc người được giao, & không chờ duyệt.
  const canEditDoneOf = (t: TaskRow) =>
    (canManage || t.assigneeIds.includes(currentUserId)) && !isPendingApproval(t);

  // Đánh dấu/bỏ hoàn thành bằng ngày Thực tế hoàn thành → trạng thái tự suy.
  // Nếu dòng vừa sửa đang nằm trong nhóm chọn (≥2) → áp cùng ngày cho TẤT CẢ dòng đang chọn được phép sửa.
  async function onCompletion(t: TaskRow, value: string) {
    if (value) {
      const err = completionDateError(value, t.plannedStart || null);
      if (err) {
        toast.error(err);
        return;
      }
    }
    if (selected.has(t.id) && selected.size >= 2) {
      const targets = tasks.filter((x) => selected.has(x.id) && canEditDoneOf(x));
      let ok = 0;
      let skip = 0;
      for (const x of targets) {
        if (value && completionDateError(value, x.plannedStart || null)) {
          skip++;
          continue;
        }
        const r = await setTaskCompletion({ id: x.id, actualEnd: value || null });
        if (r.ok) ok++;
        else skip++;
      }
      toast.success(
        (value ? `Đã cập nhật hoàn thành ${ok} việc đang chọn` : `Đã bỏ hoàn thành ${ok} việc đang chọn`) +
          (skip ? ` · bỏ qua ${skip}` : ""),
      );
      router.refresh();
      return;
    }
    const res = await setTaskCompletion({ id: t.id, actualEnd: value || null });
    if (res.ok) {
      const late = value && t.plannedEnd && value > t.plannedEnd;
      toast.success(value ? (late ? "Đã hoàn thành — TRỄ HẠN" : "Đã đánh dấu hoàn thành") : "Đã bỏ hoàn thành");
      router.refresh();
    } else toast.error(res.error);
  }

  async function togglePause(t: TaskRow, paused: boolean) {
    const res = await setTaskPaused({ id: t.id, paused });
    if (res.ok) {
      toast.success(paused ? "Đã tạm dừng" : "Đã bỏ tạm dừng");
      router.refresh();
    } else toast.error(res.error);
  }

  async function toggleStartApproval(t: TaskRow, approved: boolean) {
    const res = await setTaskStartApproval({ id: t.id, approved });
    if (res.ok) {
      toast.success(approved ? "Đã duyệt — cho phép nhập thời gian" : "Đã bỏ duyệt khởi tạo");
      router.refresh();
    } else toast.error(res.error);
  }

  async function onDelete(t: TaskRow) {
    if (!confirm(`Xóa công việc "${t.name}"?`)) return;
    const res = await deleteTask(t.id);
    if (res.ok) {
      toast.success("Đã xóa");
      router.refresh();
    } else toast.error(res.error);
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
  // Thứ tự dòng đang hiển thị (để Shift+click chọn dải) — theo view hiện tại.
  function visibleOrderIds(): string[] {
    if (viewMode === "people") {
      return groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.tasks.map((t) => t.id)));
    }
    return sorted.map((t) => t.id);
  }
  // Shift+click = chọn dải (anchor → dòng hiện tại); click/Ctrl = bật-tắt 1 dòng.
  const anchorRef = React.useRef<string | null>(null);
  function onCheckClick(e: React.MouseEvent, id: string) {
    if (e.shiftKey && anchorRef.current) {
      const ids = visibleOrderIds();
      const a = ids.indexOf(anchorRef.current);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = ids.slice(lo, hi + 1);
        setSelected((s) => {
          const n = new Set(s);
          range.forEach((r) => n.add(r));
          return n;
        });
        anchorRef.current = id;
        return;
      }
    }
    toggleOne(id);
    anchorRef.current = id;
  }

  // Xóa toàn bộ bộ lọc + dọn sạch query trên URL (gồm deep-link từ Báo cáo).
  function clearAllFilters() {
    setF({ userId: "", phong: "", dateFrom: "", dateTo: "" });
    setColFilters({});
    setSearch("");
    setActiveWg("");
    setQuick("");
    clearSel();
    if (window.location.search) router.replace("/manage", { scroll: false });
  }

  async function applyBatch(promise: ReturnType<typeof bulkSetStatus>, okMsg: string) {
    const res = await promise;
    if (res.ok) {
      toast.success(`${okMsg} ${res.data ?? ""} việc`.replace("  ", " "));
      clearSel();
      router.refresh();
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
  async function batchMeasureNorm(v: string) {
    if (!v) return;
    const on = v === "on";
    await applyBatch(
      bulkSetMeasureNorm({ ids: [...selected], measureNorm: on }),
      on ? "Đã bật cần đo định mức" : "Đã tắt cần đo định mức",
    );
  }
  async function submitDeadline() {
    if (!deadline?.date) return;
    await applyBatch(bulkSetDeadline({ ids: deadline.ids, plannedEnd: deadline.date }), "Đã đổi hạn");
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

  // ---- Ghim cột (freeze) + bố cục ----
  const dens = DENSITY === "compact" ? "py-1" : DENSITY === "comfy" ? "py-3" : "py-2";
  const cellPad = `px-2.5 ${dens}`;
  const widthOf = (k: string) => (k === "__sel__" ? MANAGE_SEL_PX : (colWidths[k] ?? MANAGE_COL_W[k] ?? 120));
  const frozenKeys = FREEZE
    ? ["__sel__", ...cols.filter((c) => c.lvl).map((c) => c.key)]
    : ([] as string[]);
  const isFrozen = (k: string) => frozenKeys.includes(k);
  const frozenLast = frozenKeys[frozenKeys.length - 1];
  const leftOf = (k: string): number | undefined => {
    if (!isFrozen(k)) return undefined;
    let x = 0;
    for (const fk of frozenKeys) {
      if (fk === k) return x;
      x += widthOf(fk);
    }
    return undefined;
  };
  // Shadow tách mép phải của vùng cột ghim (đặt ở cột ghim cuối).
  const FROZEN_SHADOW = "2px 0 0 rgba(15,23,42,0.06)";
  // Ô THÂN bảng ở cột ghim: sticky-left, z=10, NỀN ĐỤC tường minh (KHÔNG dựa bg-inherit).
  // Nền lấy theo biến --row-bg của <tr> (đổi khi hover/selected) để ô ghim luôn đồng màu hàng + đúng dark mode.
  const bodyFrozenStyle = (k: string): React.CSSProperties | undefined =>
    isFrozen(k)
      ? {
          position: "sticky",
          left: leftOf(k),
          zIndex: 10,
          background: "var(--row-bg)",
          boxShadow: k === frozenLast ? FROZEN_SHADOW : undefined,
        }
      : undefined;
  // Ô TIÊU ĐỀ: sticky-top (đặt trên từng <th> vì border-collapse bỏ qua sticky ở <thead>),
  // nền đục var(--muted). Cột ghim: thêm sticky-left + z=30 (góc trên-trái cao nhất).
  // z: góc ghim trên-trái = 30 > header thường = 20 > ô ghim thân = 10 > ô thường = 0.
  const headStyle = (k: string, width?: number): React.CSSProperties => ({
    ...(width != null ? { width } : {}),
    position: "sticky",
    top: 0,
    background: "var(--muted)",
    ...(isFrozen(k)
      ? { left: leftOf(k), zIndex: 30, boxShadow: k === frozenLast ? FROZEN_SHADOW : undefined }
      : { zIndex: 20 }),
  });

  const totalMinW =
    (canManage ? MANAGE_SEL_PX : 0) +
    cols.reduce((s, c) => s + widthOf(c.key), 0) +
    (canManage ? MANAGE_ACT_PX : 0);
  const totalColsCount = (canManage ? 1 : 0) + cols.length + (canManage ? 1 : 0);

  // ---- Header 1 cột ----
  function renderHead(col: ColDef) {
    const active = sort.key === col.key;
    const filterOn = colActive(col, colFilters[col.key]);
    return (
      <th
        key={col.key}
        style={headStyle(col.key, colWidths[col.key])}
        className={cn(
          "group relative select-none border-b border-slate-200 px-2.5 py-2.5 text-left text-xs font-semibold text-slate-500",
          col.lvl && "border-l border-slate-100",
        )}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 text-left hover:text-slate-800"
            onClick={() => {
              if (draggingRef.current) return;
              toggleSort(col.key);
            }}
          >
            <span className="truncate">{col.label}</span>
            {active ? (
              sort.dir === "asc" ? (
                <ArrowUp className="size-3 shrink-0" />
              ) : (
                <ArrowDown className="size-3 shrink-0" />
              )
            ) : (
              <ChevronsUpDown className="size-3 shrink-0 opacity-25" />
            )}
          </button>
          <button
            type="button"
            title="Lọc cột này"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setOpenFilter((o) => (o && o.key === col.key ? null : { key: col.key, rect }));
            }}
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded transition",
              filterOn
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-200 hover:text-slate-600",
            )}
          >
            <Filter className="size-3" strokeWidth={filterOn ? 2.5 : 2} />
          </button>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
          title="Kéo để giãn cột · nhấp đúp để đặt lại"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            resizeStartRef.current = { x: e.clientX, w: colWidths[col.key], key: col.key };
            draggingRef.current = true;
          }}
          onPointerMove={(e) => {
            const s = resizeStartRef.current;
            if (!s) return;
            setColW(s.key, clampManageW(s.w + (e.clientX - s.x), s.key));
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
            resetColW(col.key);
          }}
        />
      </th>
    );
  }

  // ---- Một ô phân cấp (dedup giá trị cha lặp) ----
  function hierTd(col: ColDef, t: TaskRow, meta?: { repeat: Record<string, boolean> }) {
    const rep = meta?.repeat[col.key] ?? false;
    const blank = rep && GROUPING === "merge";
    const dim = rep && GROUPING === "dim";
    const v = colText(t, col.key);
    return (
      <td
        key={col.key}
        style={bodyFrozenStyle(col.key)}
        className={cn("border-l border-slate-100 align-top", cellPad)}
      >
        {blank ? null : !v ? (
          <span className="text-slate-300">—</span>
        ) : col.leaf ? (
          <span className={dim ? "text-slate-400" : "font-medium text-slate-800"}>{v}</span>
        ) : (
          <span className={dim ? "text-slate-300" : col.lvl === 1 ? "font-medium text-slate-700" : "text-slate-600"}>
            {v}
          </span>
        )}
      </td>
    );
  }

  // Cột Tình trạng: pill mềm + dòng duyệt + nút Tạm dừng/Play + badge Trễ hạn.
  function statusTd(t: TaskRow) {
    const eff = effOf(t);
    const soft = STATUS_SOFT[eff] ?? STATUS_SOFT.CHUA_LAM;
    const late = isCompletedLate(t);
    // Số ngày trễ = ngày hoàn thành thực tế − hạn (chỉ tính khi đã hoàn thành & sau hạn).
    const lateDays = late
      ? Math.round((new Date(t.actualEnd).getTime() - new Date(t.plannedEnd).getTime()) / 86400000)
      : 0;
    const dz = duyetState(t);
    return (
      <td key="tinhTrang" className={cn("align-top", cellPad)}>
        <div className="flex flex-col items-start gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                soft.pill,
              )}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", soft.dot)} />
              {TASK_STATUS_LABEL[eff] ?? eff}
            </span>
            {late ? (
              // Việc đã XONG nhưng muộn → chú thích rose mềm (không báo động đỏ), ghi rõ số ngày trễ.
              <span
                title={`Hoàn thành trễ hạn ${lateDays} ngày (hạn ${t.plannedEnd} · xong ${t.actualEnd})`}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200"
              >
                <Flag className="size-2.5 shrink-0" /> Trễ {lateDays} ngày
              </span>
            ) : null}
            {canManage && eff !== "HOAN_THANH" ? (
              t.status === "TAM_DUNG" ? (
                <button
                  type="button"
                  title="Bỏ tạm dừng"
                  onClick={() => togglePause(t, false)}
                  className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Play className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  title="Tạm dừng"
                  onClick={() => togglePause(t, true)}
                  className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pause className="size-3.5" />
                </button>
              )
            ) : null}
          </div>
          {dz === "DA_DUYET" ? (
            <span
              className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-medium text-emerald-600/75"
              title="Đã duyệt — cho phép nhập thời gian"
            >
              <Check className="size-3" strokeWidth={3} /> Đã duyệt
            </span>
          ) : dz === "CHO_DUYET" ? (
            <span
              className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-semibold text-amber-600"
              title={t.approverName ? `Chờ ${t.approverName} duyệt` : "Chờ quản lý duyệt"}
            >
              <span className="size-1.5 rounded-full bg-amber-500" /> Chờ duyệt
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-medium text-slate-400"
              title="Hoàn thành nhưng chưa được duyệt"
            >
              <span className="size-1.5 rounded-full bg-slate-300" /> Chưa duyệt
            </span>
          )}
        </div>
      </td>
    );
  }

  // Một dòng việc — dùng chung cho cả view Bảng và view Gom theo người.
  function renderRow(
    t: TaskRow,
    opts?: { keyExtra?: string; meta?: { repeat: Record<string, boolean>; newProject: boolean } },
  ) {
    const overdue = isOverdue(t);
    const pendingApproval = isPendingApproval(t);
    const late = isCompletedLate(t);
    const canEditDone = (canManage || t.assigneeIds.includes(currentUserId)) && !pendingApproval;
    const meta = opts?.meta;
    const isSel = selected.has(t.id);
    return (
      <tr
        key={`${opts?.keyExtra ?? ""}${t.id}`}
        // --row-bg: nền đục của hàng (theme var) — ô ghim đọc lại biến này để luôn đồng màu + đúng dark mode.
        // Viền dưới đặt trên td (qua tbody), viền-trên vạch nhóm cũng trên td (separate không vẽ viền <tr>).
        className={cn(
          "bg-[var(--row-bg)]",
          isSel ? "[--row-bg:var(--muted)]" : "[--row-bg:var(--background)] hover:[--row-bg:var(--muted)]",
          meta?.newProject && "[&>td]:border-t-2 [&>td]:border-t-slate-200/70",
        )}
      >
        {canManage ? (
          <td style={bodyFrozenStyle("__sel__")} className={cn("px-2 align-top", dens)}>
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={() => {}}
              onClick={(e) => onCheckClick(e, t.id)}
              className="mt-0.5 size-3.5 accent-slate-700"
              aria-label="Chọn việc (Shift+click để chọn dải)"
              title="Shift+click để chọn nhiều dòng liền nhau"
            />
          </td>
        ) : null}
        {cols.map((c) => {
          if (c.lvl) return hierTd(c, t, meta);
          if (c.key === "sumId")
            return (
              <td key="sumId" className={cn("align-top", cellPad)}>
                <span className="font-mono text-[11px] text-slate-500">{t.sumId ?? "—"}</span>
              </td>
            );
          if (c.key === "boMon")
            return (
              <td key="boMon" className={cn("align-top text-xs text-slate-600", cellPad)}>
                {t.disciplineName ?? "—"}
              </td>
            );
          if (c.key === "thucHien")
            return (
              <td key="thucHien" className={cn("align-top text-xs", cellPad)}>
                {t.assigneeNames.length ? (
                  <span className="text-slate-700">{t.assigneeNames.join(", ")}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <UserX className="size-3" /> Chưa giao
                  </span>
                )}
              </td>
            );
          if (c.key === "uuTien")
            return (
              <td key="uuTien" className={cn("align-top", cellPad)}>
                <Badge variant={priorityVariant(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
              </td>
            );
          if (c.key === "tinhTrang") return statusTd(t);
          if (c.key === "batDau")
            return (
              <td key="batDau" className={cn("align-top text-xs text-slate-500", cellPad)}>
                {t.plannedStart || "—"}
              </td>
            );
          if (c.key === "ketThuc")
            return (
              <td key="ketThuc" className={cn("align-top text-xs", cellPad)}>
                {t.plannedEnd ? (
                  <span className={cn(overdue && "font-medium text-red-600")}>{t.plannedEnd}</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            );
          if (c.key === "thucTe")
            return (
              <td key="thucTe" className={cn("align-top", cellPad)}>
                <Input
                  type="date"
                  className={cn(
                    "h-9 w-full px-2 text-xs [&::-webkit-calendar-picker-indicator]:mr-15",
                    late && "font-medium text-red-600",
                  )}
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
              </td>
            );
          return <td key={c.key} className={cellPad} />;
        })}
        {canManage ? (
          <td className={cn("px-2 align-top", dens)}>
            <div className="flex items-center justify-center gap-0.5">
              <button
                type="button"
                title={
                  pendingApproval
                    ? "Duyệt — cho phép người được giao nhập thời gian"
                    : "Đã duyệt — bấm để thu hồi (khóa nhập lại)"
                }
                onClick={() => toggleStartApproval(t, pendingApproval)}
                className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
              >
                <ShieldCheck className={cn("size-4", !pendingApproval && "text-emerald-600")} />
              </button>
              <button
                type="button"
                title="Sửa"
                onClick={() => setEditing(t)}
                className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                title="Xóa"
                onClick={() => onDelete(t)}
                className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </td>
        ) : null}
      </tr>
    );
  }

  // Dòng tiêu đề nhóm người (chiếm hết chiều ngang, bấm để gập/mở).
  function groupHeaderRow(g: { key: string; name: string; overdue: number; tasks: TaskRow[] }) {
    const Chevron = collapsed.has(g.key) ? ChevronRight : ChevronDown;
    return (
      <tr key={`grp-${g.key}`} className="bg-slate-100">
        {/* Ô span hết hàng; nội dung bọc trong lớp sticky-left để nhãn nhóm ghim trái khi cuộn ngang. */}
        <td colSpan={totalColsCount} className="p-0">
          <div className="sticky left-0 z-[11] inline-flex max-w-[calc(100vw-1rem)] items-center bg-slate-100 px-2.5 py-2">
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              className="flex items-center gap-2 text-sm font-medium text-slate-700"
            >
              <Chevron className="size-4 text-slate-400" />
              {g.name}
              <span className="font-normal text-slate-400">
                ({g.tasks.length} việc{g.overdue ? ` · ${g.overdue} quá hạn` : ""})
              </span>
            </button>
          </div>
        </td>
      </tr>
    );
  }

  // ---- Kanban (kéo-thả đổi trạng thái) — tạm tắt, giữ code ----
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
          className={cn("mt-1 text-[11px]", overdue ? "font-medium text-red-600" : "text-muted-foreground")}
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
            Đang hiển thị tối đa {KANBAN_COL_LIMIT} thẻ/cột — lọc Nhóm/Dự án hoặc dùng ô tìm để xem đầy đủ.
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

  const activeFilterCount = activeCols.length + (quick ? 1 : 0) + (activeWg ? 1 : 0);
  const openCol = openFilter ? cols.find((c) => c.key === openFilter.key) : null;

  return (
    <div className="space-y-4 pb-[5px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quản lý công việc</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} / {tasks.length} công việc
            {activeFilterCount > 0 ? (
              <span className="text-slate-400"> · đang lọc {activeFilterCount} điều kiện</span>
            ) : null}
          </p>
        </div>
        {canAssign ? (
          <Button onClick={() => setBulkOpen(true)}>
            <Plus className="size-4" /> Giao việc
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

      {/* Dải thông báo khi vào từ link Báo cáo */}
      {fromReport ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Đang lọc theo Báo cáo:{" "}
            <b className="text-foreground">
              {[
                f.userId && `Nhân sự: ${users.find((u) => u.id === f.userId)?.fullName ?? "?"}`,
                f.phong && `Phòng: ${PHONG_LABEL[f.phong as keyof typeof PHONG_LABEL] ?? f.phong}`,
                activeWg && `Nhóm: ${workGroups.find((w) => w.id === activeWg)?.name ?? "?"}`,
                (f.dateFrom || f.dateTo) && `Thời gian: ${rangeLabel(f.dateFrom, f.dateTo)}`,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </b>
          </span>
          <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={clearAllFilters}>
            <X className="size-3.5" /> Xóa lọc
          </Button>
        </div>
      ) : null}

      {/* Thanh chip điều kiện đang lọc */}
      {activeCols.length > 0 || quick || activeWg ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
            <Filter className="size-3.5" /> Lọc:
          </span>
          {activeWg ? (
            <Chip
              label="Nhóm"
              value={workGroups.find((w) => w.id === activeWg)?.name ?? "?"}
              onRemove={() => setActiveWg("")}
            />
          ) : null}
          {quick ? (
            <Chip
              label="Nhanh"
              value={
                { QUA_HAN: "Quá hạn", SAP_HAN: "Sắp đến hạn", CHUA_GIAO: "Chưa giao", DANG_LAM: "Đang làm" }[
                  quick
                ]
              }
              onRemove={() => setQuick("")}
            />
          ) : null}
          {activeCols.map((c) => (
            <Chip key={c.key} label={c.label} value={chipText(c, colFilters[c.key])} onRemove={() => clearCol(c.key)} />
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-400 hover:text-red-600"
          >
            <RotateCcw className="size-3" /> Xóa tất cả
          </button>
        </div>
      ) : null}

      {/* Chuyển chế độ xem */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-md border p-0.5">
          {(
            [
              { key: "people", label: "Gom theo người" },
              { key: "table", label: "Bảng" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setViewMode(v.key)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                viewMode === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
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
        <div className="overflow-auto rounded-lg border bg-card shadow-sm max-h-[calc(100svh-40px)]">
          {/* border-separate + border-spacing-0 + <colgroup>: bề rộng cột khớp tuyệt đối với leftOf
              (cộng dồn colWidths) → cột ghim không lệch px → không hở khe khi cuộn ngang. */}
          <table
            className="text-sm"
            style={{ width: totalMinW, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 }}
          >
            <colgroup>
              {canManage ? <col style={{ width: MANAGE_SEL_PX }} /> : null}
              {cols.map((c) => (
                <col key={c.key} style={{ width: widthOf(c.key) }} />
              ))}
              {canManage ? <col style={{ width: MANAGE_ACT_PX }} /> : null}
            </colgroup>
            <thead>
              <tr>
                {canManage ? (
                  <th
                    style={headStyle("__sel__", MANAGE_SEL_PX)}
                    className="border-b border-slate-200 px-2 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="size-3.5 align-middle accent-slate-700"
                      aria-label="Chọn tất cả việc đang hiển thị"
                    />
                  </th>
                ) : null}
                {cols.map(renderHead)}
                {canManage ? (
                  <th
                    style={headStyle("__act__", MANAGE_ACT_PX)}
                    className="border-b border-slate-200 px-2 py-2.5 text-center text-xs font-semibold text-slate-500"
                  >
                    Thao tác
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:border-slate-100">
              {viewMode === "people"
                ? groups.flatMap((g) =>
                    collapsed.has(g.key)
                      ? [groupHeaderRow(g)]
                      : [groupHeaderRow(g), ...g.tasks.map((t) => renderRow(t, { keyExtra: `${g.key}-` }))],
                  )
                : sorted.map((t, i) => renderRow(t, { meta: rowMeta[i] }))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={totalColsCount} className="py-12 text-center text-sm text-slate-400">
                    Không có công việc phù hợp với bộ lọc
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {/* Popover lọc theo cột */}
      {openFilter && openCol ? (
        <Popover
          rect={openFilter.rect}
          onClose={() => setOpenFilter(null)}
          width={openCol.filter === "multi" && (openCol.opts?.length ?? 0) >= 5 ? 256 : 240}
        >
          <PopHeader
            title={openCol.label}
            showClear={colActive(openCol, colFilters[openCol.key])}
            onClear={() => clearCol(openCol.key)}
          />
          {openCol.filter === "text" ? (
            <TextBody col={openCol} value={colFilters[openCol.key] as string} onChange={(v) => setCF(openCol.key, v)} />
          ) : null}
          {openCol.filter === "multi" ? (
            <MultiBody
              col={openCol}
              value={(colFilters[openCol.key] as string[]) ?? []}
              onChange={(v) => setCF(openCol.key, v)}
            />
          ) : null}
          {openCol.filter === "status" ? (
            <StatusBody
              value={(colFilters[openCol.key] as StatusFilterVal) ?? { status: [], duyet: [] }}
              onChange={(v) => setCF(openCol.key, v)}
            />
          ) : null}
          {openCol.filter === "date" ? (
            <DateBody
              col={openCol}
              value={(colFilters[openCol.key] as string) ?? ""}
              onChange={(v) => {
                setCF(openCol.key, v);
                setOpenFilter(null);
              }}
            />
          ) : null}
        </Popover>
      ) : null}

      {/* Thanh thao tác hàng loạt — dính đáy khi đã chọn việc */}
      {canManage && selected.size > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-lg">
          <span className="px-2 text-sm font-medium">Đã chọn {selected.size}</span>
          <Select className="h-8 w-36 text-xs" value="" onChange={(e) => batchStatus(e.target.value)}>
            <option value="">Đổi trạng thái…</option>
            {TASK_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select className="h-8 w-32 text-xs" value="" onChange={(e) => batchPriority(e.target.value)}>
            <option value="">Đổi ưu tiên…</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={() => setDeadline({ ids: [...selected], date: "" })}>
            <Calendar className="size-4" /> Đổi hạn
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReassign({ ids: [...selected], mode: "replace", users: [] })}
          >
            <Users className="size-4" /> Giao lại
          </Button>
          <Select
            className="h-8 w-36 text-xs"
            value=""
            onChange={(e) => batchMeasureNorm(e.target.value)}
            title="Cờ cần đo định mức (*)"
          >
            <option value="">Định mức (*)…</option>
            <option value="on">Bật cần đo ĐM</option>
            <option value="off">Tắt cần đo ĐM</option>
          </Select>
          <Button size="icon" variant="ghost" onClick={clearSel} title="Bỏ chọn" aria-label="Bỏ chọn">
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {/* Modal giao lại người hàng loạt */}
      {reassign ? (
        <Modal open onClose={() => setReassign(null)} title={`Giao lại ${reassign.ids.length} công việc`} className="max-w-md">
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
        <Modal open onClose={() => setDeadline(null)} title={`Đổi hạn ${deadline.ids.length} công việc`} className="max-w-sm">
          <div className="space-y-3">
            <Input type="date" value={deadline.date} onChange={(e) => setDeadline({ ...deadline, date: e.target.value })} />
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

      {/* Form đơn chỉ còn dùng để SỬA 1 việc (tạo việc dùng lưới bên dưới). */}
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
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      {/* "Giao việc" → lưới nhập (1 hoặc nhiều việc) trong modal gần kín màn hình. */}
      {bulkOpen && canAssign ? (
        <Modal open onClose={() => setBulkOpen(false)} title="Giao việc" className="max-w-[96vw]">
          <AssignClient
            embedded
            workGroups={workGroups}
            disciplines={disciplines}
            phases={phases}
            projects={projects}
            users={users}
            catalog={catalog}
            onSaved={() => {
              setBulkOpen(false);
              router.refresh();
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}

// ---- Popover lọc (portal, neo dưới nút funnel, đóng khi click ngoài/cuộn/Esc) ----
function Popover({
  rect,
  onClose,
  children,
  width = 248,
}: {
  rect: DOMRect;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onScroll(e: Event) {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const left = Math.min(rect.left, window.innerWidth - width - 12);
  const top = Math.min(rect.bottom + 6, window.innerHeight - 80);
  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", left: Math.max(8, left), top, width }}
      className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
    >
      {children}
    </div>,
    document.body,
  );
}

function PopHeader({ title, onClear, showClear }: { title: string; onClear: () => void; showClear: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
      <span className="text-xs font-semibold text-slate-700">{title}</span>
      {showClear ? (
        <button type="button" onClick={onClear} className="text-[11px] font-medium text-slate-400 hover:text-red-600">
          Xóa
        </button>
      ) : null}
    </div>
  );
}

function MultiBody({ col, value, onChange }: { col: ColDef; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = React.useState("");
  const sel = value ?? [];
  const opts = (col.opts ?? []).filter((o) => norm(col.labelMap ? (col.labelMap[o] ?? o) : o).includes(norm(q)));
  const toggle = (o: string) => onChange(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);
  return (
    <div>
      {(col.opts?.length ?? 0) >= 5 ? (
        <div className="relative border-b border-slate-100 p-2">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm…"
            className="h-7 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-xs outline-none focus:border-slate-400 focus:bg-white"
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400">
        <span>{sel.length ? `${sel.length} đã chọn` : "Chọn giá trị"}</span>
        {sel.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="hover:text-slate-600">
            Bỏ chọn
          </button>
        ) : null}
      </div>
      <ul className="max-h-60 overflow-auto pb-1">
        {opts.map((o) => {
          const on = sel.includes(o);
          return (
            <li key={o}>
              <button
                type="button"
                onClick={() => toggle(o)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded border",
                    on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300",
                  )}
                >
                  {on ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="truncate">{col.labelMap ? (col.labelMap[o] ?? o) : o}</span>
              </button>
            </li>
          );
        })}
        {opts.length === 0 ? <li className="px-3 py-2 text-xs text-slate-400">Không có kết quả</li> : null}
      </ul>
    </div>
  );
}

function StatusBody({ value, onChange }: { value: StatusFilterVal; onChange: (v: StatusFilterVal) => void }) {
  const v = value ?? { status: [], duyet: [] };
  const tog = (grp: "status" | "duyet", code: string) => {
    const cur = v[grp] ?? [];
    const next = cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code];
    onChange({ ...v, [grp]: next });
  };
  const item = (grp: "status" | "duyet", code: string, label: string, dot: string) => {
    const on = (v[grp] ?? []).includes(code);
    return (
      <button
        key={`${grp}-${code}`}
        type="button"
        onClick={() => tog(grp, code)}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded border",
            on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300",
          )}
        >
          {on ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        <span className={cn("size-2 shrink-0 rounded-full", dot)} />
        <span className="truncate">{label}</span>
      </button>
    );
  };
  return (
    <div className="pb-1">
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Trạng thái</p>
      {item("status", "QUA_HAN", "Quá hạn", "bg-red-500")}
      {item("status", "DANG_LAM", "Đang thực hiện", "bg-blue-500")}
      {item("status", "CHUA_LAM", "Chưa làm", "bg-slate-400")}
      {item("status", "TAM_DUNG", "Tạm dừng", "bg-amber-500")}
      {item("status", "HOAN_THANH", "Hoàn thành", "bg-emerald-500")}
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Duyệt</p>
      {item("duyet", "DA_DUYET", "Đã duyệt", "bg-emerald-500")}
      {item("duyet", "CHO_DUYET", "Chờ duyệt", "bg-amber-500")}
      {item("duyet", "CHUA_DUYET", "Chưa duyệt", "bg-slate-400")}
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Khác</p>
      <button
        type="button"
        onClick={() => onChange({ ...v, tre: !v.tre })}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded border",
            v.tre ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300",
          )}
        >
          {v.tre ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        <span className="size-2 shrink-0 rounded-full bg-rose-500" />
        <span className="truncate">Trễ hạn (hoàn thành muộn)</span>
      </button>
    </div>
  );
}

function TextBody({ col, value, onChange }: { col: ColDef; value: string; onChange: (v: string) => void }) {
  return (
    <div className="p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Lọc theo ${col.label.toLowerCase()}…`}
          className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[13px] outline-none focus:border-slate-400 focus:bg-white"
        />
      </div>
    </div>
  );
}

function DateBody({ col, value, onChange }: { col: ColDef; value: string; onChange: (v: string) => void }) {
  return (
    <ul className="py-1">
      <li>
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-slate-50"
        >
          <span
            className={cn("grid size-3.5 place-items-center rounded-full border", !value ? "border-slate-800" : "border-slate-300")}
          >
            {!value ? <span className="size-1.5 rounded-full bg-slate-800" /> : null}
          </span>
          <span className="text-slate-500">Tất cả</span>
        </button>
      </li>
      {(DATE_PRESETS[col.key] ?? []).map(([val, label]) => {
        const on = value === val;
        return (
          <li key={val}>
            <button
              type="button"
              onClick={() => onChange(val)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            >
              <span
                className={cn("grid size-3.5 place-items-center rounded-full border", on ? "border-slate-800" : "border-slate-300")}
              >
                {on ? <span className="size-1.5 rounded-full bg-slate-800" /> : null}
              </span>
              <span className="truncate">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs shadow-sm">
      <span className="text-slate-400">{label}:</span>
      <span className="font-medium text-slate-700">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="size-3" />
      </button>
    </span>
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
    <Modal open onClose={onClose} title={task ? "Sửa công việc" : "Thêm công việc"} className="max-w-3xl">
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
