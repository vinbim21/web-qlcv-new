"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Filter,
  Flag,
  History,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  UserX,
  Users,
  X,
} from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { AssignClient, type ProjectOpt } from "@/app/(app)/assign/assign-client";
import { TaskRowEditor } from "@/components/task-row-editor";
import { EntryResultCell, ResultCell } from "@/components/result-cell";
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
  type PeriodBounds,
  type PeriodType,
  getBounds,
  getISOWeekYear,
  isoWeeksInYear,
} from "@/app/(app)/reports/period-utils";
import {
  approveDeleteTask,
  approveEndDateChange,
  bulkDelete,
  bulkReassign,
  bulkSetApproval,
  bulkSetDeadline,
  bulkSetMeasureNorm,
  bulkSetStatus,
  rejectDeleteTask,
  rejectEndDateChange,
  requestTaskUpdate,
  saveTask,
  setTaskApproval,
  setTaskCompletion,
  setTaskPaused,
  setTaskStartApproval,
  updateTaskStatus,
} from "@/server/actions/tasks";
import { saveCatalogProject, batchUpdateCatalogProjects } from "@/server/actions/projects";
import { getTaskAllEntries } from "@/server/actions/timesheet";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { DateInput } from "@/components/ui/date-input";


// Tinh chỉnh hiển thị bảng (mặc định chốt theo bản thiết kế — chưa làm panel Tweaks).
const DENSITY: "compact" | "regular" | "comfy" = "regular";
const GROUPING: "dim" | "merge" | "flat" = "dim"; // gộp cấp trực quan: làm mờ giá trị cha lặp
const FREEZE = true; // ghim checkbox + 4 cột phân cấp khi cuộn ngang
const SHOW_MA = false; // ẩn cột Mã mặc định

// Nhóm dùng cấu trúc Dự án → Hạng mục (catalog tab 2).
const PROJECT_BASED_ABBRS = new Set(["QL", "TT"]);
// Nhóm dùng cấu trúc CatalogItem PT (catalog tab 3).
const BT_ABBR = "BT";

// Chip "Lọc:" nhanh theo từng nhóm công việc — lọc thô theo từ khóa có trong
// Loại hình/Hạng mục/Công việc/mã, KHÔNG cần khai báo catalog Level 1.
const QUICK_FILTERS: Record<string, string[]> = {
  XD: ["TC"],
  DT: ["CDE", "Revit", "Tools"],
  QL: ["Tạo lập", "KSCL"],
  TT: ["BB"],
  PT: ["App", "Cad", "Revit", "Civil3D", "DigitalTwin"],
  CK: ["Họp"],
};

type Opt = { id: string; name: string };
type DisciplineOpt = Opt & { code?: string | null };
// Nhóm công việc kèm mã + tiền tố Id (abbr) + bộ đếm (lastSeq) cho editor.
type WgOpt = Opt & { code?: string; abbr?: string | null; lastSeq?: number };
type UserOpt = { id: string; fullName: string };
type CatalogProjectGroup = { id: string; code: string; name: string };
type Catalog = Record<string, {
  l1: string[];
  l2: string[];
  l3: string[];
  l5: string[];
  l2ByL1: Record<string, string[]>;
  l3ByL2: Record<string, string[]>;
  projectGroups?: CatalogProjectGroup[];
  l3ByProjectGroup?: Record<string, string[]>;
  projectGroupByL3?: Record<string, CatalogProjectGroup>;
}>;

export type TaskRow = {
  id: string;
  sumId: string | null;
  seq: number | null;
  workGroupId: string;
  workGroupName: string;
  projectId: string | null;
  projectName: string | null;
  blockSystem: string | null;
  projectStartDate: string | null;
  projectPackagingDate: string | null;
  groupCode: string | null; // mã Dự án (ProjectGroup.code)
  groupName: string | null;
  loaiHinhCode: string | null; // mã Loại hình công trình (constructionType)
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
  result: string | null;
  approved: boolean;
  approvedByName: string | null;
  // Duyệt khởi tạo (luồng "Thêm công việc"): approverId != null & !startApproved => đang chờ duyệt.
  approverId: string | null;
  approverName: string | null;
  startApproved: boolean;
  pendingPlannedEnd: string | null;
  endChangeRequesterId: string | null;
  endChangeRequesterName: string | null;
  endChangeNote: string | null;
  deleteRequestedAt: string | null;
  deleteRequesterId: string | null;
  deleteRequesterName: string | null;
  deleteRequestNote: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
  totalHours: number;
  // Tách giờ theo từng lần hoàn thành (chỉ có khi việc đã từng "Cập nhật công việc") — hover cột
  // Thời gian để xem giờ của lần hoàn thành trước tách bạch với giờ đang làm hiện tại.
  hoursBreakdown: { seq: number; completedOn: string | null; hours: number }[];
  completionHistory: CompletionHistoryEntry[];
};

export type CompletionHistoryEntry = {
  plannedStart: string;
  plannedEnd: string;
  actualEnd: string;
  approvedAt: string | null;
  approvedByName: string | null;
  note: string | null;
};

// Việc đang "chờ duyệt khởi tạo" → khóa nhập thời gian.
function isPendingApproval(t: TaskRow): boolean {
  return !!t.approverId && !t.startApproved;
}

// Có yêu cầu dời hạn đang chờ quản lý duyệt.
function hasPendingDeadline(t: TaskRow): boolean {
  return !!t.pendingPlannedEnd || !!t.endChangeRequesterId;
}

// Chuỗi hiện khi hover cột "Thời gian" — tách giờ của từng lần hoàn thành + lần đang làm hiện tại.
function formatHoursBreakdown(breakdown: { seq: number; completedOn: string | null; hours: number }[]): string {
  return breakdown
    .map((b) => {
      const label = b.completedOn ? `Hoàn thành lần ${b.seq} (${fmtDate(b.completedOn)})` : "Hiện tại";
      return `${label}: ${Number.isInteger(b.hours) ? b.hours : b.hours.toFixed(1)} (h)`;
    })
    .join("\n");
}

// Chuỗi hiện khi hover badge "N lần hoàn thành trước" — mỗi mốc 1 dòng, mới nhất trước.
function formatCompletionHistory(history: CompletionHistoryEntry[]): string {
  return history
    .map((h) => {
      const parts = [`Hoàn thành ${fmtDate(h.actualEnd)}`];
      if (h.approvedByName) parts.push(`duyệt bởi ${h.approvedByName}`);
      if (h.note) parts.push(h.note);
      return parts.join(" — ");
    })
    .join("\n");
}

// Nhãn ngữ cảnh cho modal chi tiết: Mã dự án - Mã loại hình - Tên hạng mục - Khối/Hệ thống (nếu có) - Giai đoạn - Bộ môn.
function taskContextLabel(t: TaskRow): string {
  const hangMuc = t.projectName ?? t.level3 ?? "";
  return [t.groupCode, t.loaiHinhCode, hangMuc, t.blockSystem, t.phaseName, t.disciplineCode]
    .filter((v): v is string => !!v)
    .join(" - ");
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
    totalHours: t.totalHours,
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
  if (n === null) return fmtDate(t.plannedEnd);
  if (n < 0) return `Quá hạn ${-n} ngày`;
  if (n === 0) return "Hạn hôm nay";
  return `Còn ${n} ngày · ${fmtDate(t.plannedEnd)}`;
}

// YYYY-MM-DD theo giờ địa phương (tránh lệch timezone của toISOString).
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

// Tháng hiện tại (YYYY-MM) — mốc cho preset "Trong tháng này".
const THIS_MONTH = localIso(new Date()).slice(0, 7);
function thisMonth(iso: string): boolean {
  return !!iso && iso.slice(0, 7) === THIS_MONTH;
}

// Việc đã hoàn thành (có actualEnd): chỉ tính theo ngày hoàn thành thực tế, bỏ qua Kết thúc kế hoạch —
// VD hoàn thành ở tuần 25 nhưng Kết thúc kế hoạch rơi vào tuần 26 → lọc tuần 26 sẽ KHÔNG thấy việc này,
// lọc tuần 25 mới thấy (khớp logic lát cắt ở tab Báo cáo).
function inPeriod(plannedStart: string, plannedEnd: string, actualEnd: string, bounds: PeriodBounds | null): boolean {
  if (!bounds) return true;
  if (actualEnd) return actualEnd >= bounds.start && actualEnd <= bounds.end;
  if (!plannedStart && !plannedEnd) return true;
  const startOk = !plannedStart || plannedStart <= bounds.end;
  const endOk = !plannedEnd || plannedEnd >= bounds.start;
  return startOk && endOk;
}

const norm = removeVietnameseTones;

// Tìm kiếm nhiều điều kiện: dấu phẩy "," = AND trong 1 nhóm (VD "HN, KSCL" → phải có cả 2),
// dấu gạch đứng "|" = OR giữa các nhóm (VD "A, B | C, D" → khớp nhóm (A và B) HOẶC nhóm (C và D)).
// Không phân biệt hoa/thường & dấu.
function matchesSearch(haystack: string, rawQuery: string): boolean {
  const groups = rawQuery.split("|").map((g) => g.trim()).filter(Boolean);
  if (!groups.length) return true;
  return groups.some((g) => {
    const terms = g.split(",").map((s) => norm(s.trim())).filter(Boolean);
    return terms.every((t) => haystack.includes(t));
  });
}

// ---- Cấu hình cột bảng (4 cấp phân cấp: Dự án → Loại hình → Hạng mục → Công việc) ----
type FilterKind = "text" | "multi" | "status" | "date" | "none";
type SortKey =
  | "sumId"
  | "duAn"
  | "loaiHinh"
  | "hangMuc"
  | "congViec"
  | "giaiDoan"
  | "boMon"
  | "thucHien"
  | "uuTien"
  | "tinhTrang"
  | "batDau"
  | "ketThuc"
  | "thucTe"
  | "soGio"
  | "ketQua";
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
      return t.groupCode ?? (t.projectName ?? "");
    case "loaiHinh":
      return t.loaiHinhCode ?? (t.projectId ? "" : (t.level2 ?? ""));
    case "hangMuc":
      return t.projectName ?? t.level3 ?? "";
    case "congViec":
      return t.name;
    case "giaiDoan":
      return t.phaseName ?? "";
    case "boMon":
      return t.disciplineCode ?? "";
    case "batDau":
      return t.plannedStart;
    case "ketThuc":
      return t.plannedEnd;
    case "thucTe":
      return t.actualEnd;
    case "soGio":
      return t.totalHours > 0 ? String(t.totalHours) : "";
    case "ketQua":
      return t.result ?? "";
    default:
      return "";
  }
}

function blockSystemText(t: TaskRow): string {
  return t.blockSystem?.trim() ?? "";
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
  CHUA_LAM: { dot: "bg-slate-400 dark:bg-slate-500", pill: "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700" },
  DANG_LAM: { dot: "bg-blue-500", pill: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 ring-blue-200 dark:ring-blue-800" },
  HOAN_THANH: { dot: "bg-emerald-500", pill: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800" },
  TAM_DUNG: { dot: "bg-amber-500", pill: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800" },
  QUA_HAN: { dot: "bg-red-500", pill: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-800" },
};

// Bề rộng cột bảng /manage — cố định, khớp /tasks (không cho kéo giãn để tránh lệch cột).
const MANAGE_SEL_PX = 36; // cột checkbox (ghim trái)
const MANAGE_COL_W: Record<string, number> = {
  sumId: 150,
  duAn: 95,
  loaiHinh: 120,
  hangMuc: 125,
  congViec: 212,
  giaiDoan: 130,
  boMon: 120,
  thucHien: 170,
  uuTien: 106,
  tinhTrang: 160,
  batDau: 116,
  ketThuc: 116,
  thucTe: 150,
  soGio: 110,
  ketQua: 120,
};

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
  constructionTypes,
  workGroups,
  disciplines,
  phases,
  projects,
  users,
  approvers,
  catalog,
  initial,
}: {
  currentUserId: string;
  canManage: boolean;
  // canAssign (ADMIN/Cấp 1/Cấp 2): được tạo việc bằng lưới "Thêm công việc".
  canAssign: boolean;
  isAdmin: boolean;
  tasks: TaskRow[];
  constructionTypes: { id: string; code: string; name: string }[];
  workGroups: WgOpt[];
  disciplines: DisciplineOpt[];
  phases: Opt[];
  projects: ProjectOpt[];
  users: UserOpt[];
  approvers: UserOpt[];
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
  const [activeWg, setActiveWg] = useLocalStorage("manage:activeWg", initial?.group ?? ""); // "" = Tất cả (tab Bảng)
  const [activeL1, setActiveL1] = React.useState("");
  React.useEffect(() => { setActiveL1(""); }, [activeWg]);
  // Esc (bất kỳ đâu trên trang) → bỏ chip "Lọc:" đang chọn, về "Tất cả".
  React.useEffect(() => {
    if (!activeL1) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveL1("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeL1]);
  // Chip "Lọc:" do người dùng tự thêm — nhớ theo trình duyệt, dùng chung /manage + /tasks.
  const [extraQuickFilters, setExtraQuickFilters] = useLocalStorage<Record<string, string[]>>(
    "quickFilters:extra",
    {},
  );
  // Chip mặc định (QUICK_FILTERS) bị người dùng ẩn đi — nhớ theo trình duyệt, dùng chung /manage + /tasks.
  const [hiddenQuickFilters, setHiddenQuickFilters] = useLocalStorage<Record<string, string[]>>(
    "quickFilters:hidden",
    {},
  );
  const [addingChip, setAddingChip] = React.useState(false);
  const [newChipText, setNewChipText] = React.useState("");
  const [removingChip, setRemovingChip] = React.useState(false);
  const fromReport = Boolean(
    initial && (initial.user || initial.group || initial.phong || initial.from || initial.to),
  );
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [editing, setEditing] = React.useState<TaskRow | null>(null);
  // Modal chi tiết công việc (click 1 lần vào tên việc): nội dung + toàn bộ giờ đã ghi (mọi người, mọi thời điểm).
  type WeekEntry = { id: string; date: string; hours: number; note: string | null; result: string | null; userName: string };
  const [detailTask, setDetailTask] = React.useState<TaskRow | null>(null);
  const [detailEntries, setDetailEntries] = React.useState<WeekEntry[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  async function openDetail(t: TaskRow) {
    setDetailTask(t);
    setDetailEntries([]);
    setDetailLoading(true);
    const res = await getTaskAllEntries(t.id);
    setDetailEntries(res.ok ? (res.data ?? []) : []);
    setDetailLoading(false);
  }
  function closeDetail() {
    setDetailTask(null);
  }
  const [renameHangMuc, setRenameHangMuc] = React.useState<{ ids: string[]; name: string } | null>(null);
  // Modal "Giao việc": false = đóng, true = mở trống, TaskRow = mở điền sẵn theo việc đó ("Thêm tương tự").
  const [assignModal, setAssignModal] = React.useState<false | true | TaskRow>(false);
  // "Cập nhật công việc": làm tiếp việc đã Hoàn thành (đầu việc đổi) — chờ quản lý duyệt lại.
  const [updateTaskDialog, setUpdateTaskDialog] = React.useState<{
    id: string;
    name: string;
    plannedStart: string;
    plannedEnd: string;
    approverId: string;
    note: string;
  } | null>(null);
  const [updateTaskPending, setUpdateTaskPending] = React.useState(false);
  async function runUpdateTaskRequest() {
    if (!updateTaskDialog) return;
    if (!updateTaskDialog.plannedStart || !updateTaskDialog.plannedEnd || !updateTaskDialog.approverId) return;
    setUpdateTaskPending(true);
    const res = await requestTaskUpdate({
      id: updateTaskDialog.id,
      plannedStart: updateTaskDialog.plannedStart,
      plannedEnd: updateTaskDialog.plannedEnd,
      approverId: updateTaskDialog.approverId,
      note: updateTaskDialog.note,
    });
    setUpdateTaskPending(false);
    if (res.ok) {
      toast.success("Đã gửi yêu cầu cập nhật, đang chờ duyệt");
      setUpdateTaskDialog(null);
      clearSel();
      router.refresh();
    } else toast.error(res.error);
  }
  // Lọc nhanh từ dải KPI.
  const [quick, setQuick] = useLocalStorage<"" | "QUA_HAN" | "SAP_HAN" | "CHUA_GIAO" | "DANG_LAM" | "HOAN_THANH">("manage:quick", "");
  // Esc (bất kỳ đâu trên trang) → bỏ KPI đang chọn.
  React.useEffect(() => {
    if (!quick) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setQuick("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quick, setQuick]);
  const _now = React.useRef(new Date());
  const _curWeek = React.useRef(getISOWeekYear(_now.current));
  const [timePeriod, setTimePeriod] = useLocalStorage<PeriodType>("manage:timePeriod", "week");
  const [pYear, setPYear] = useLocalStorage("manage:pYear", _curWeek.current.year);
  const [pWeek, setPWeek] = useLocalStorage("manage:pWeek", _curWeek.current.week);
  const [pMonth, setPMonth] = useLocalStorage("manage:pMonth", _now.current.getMonth() + 1);
  const [pQuarter, setPQuarter] = useLocalStorage("manage:pQuarter", Math.ceil((_now.current.getMonth() + 1) / 3));
  const periodBounds = React.useMemo(
    () => getBounds(timePeriod, pYear, pWeek, pMonth, pQuarter),
    [timePeriod, pYear, pWeek, pMonth, pQuarter],
  );
  function handlePeriodType(t: PeriodType) {
    const iw = getISOWeekYear(new Date());
    setTimePeriod(t);
    setPYear(t === "week" ? iw.year : new Date().getFullYear());
    setPWeek(iw.week);
    setPMonth(new Date().getMonth() + 1);
    setPQuarter(Math.ceil((new Date().getMonth() + 1) / 3));
  }
  function handlePeriodPrev() {
    if (timePeriod === "week") { if (pWeek > 1) setPWeek(w => w - 1); else { setPYear(y => y - 1); setPWeek(isoWeeksInYear(pYear - 1)); } }
    else if (timePeriod === "month") { if (pMonth > 1) setPMonth(m => m - 1); else { setPYear(y => y - 1); setPMonth(12); } }
    else if (timePeriod === "quarter") { if (pQuarter > 1) setPQuarter(q => q - 1); else { setPYear(y => y - 1); setPQuarter(4); } }
    else if (timePeriod === "year") setPYear(y => y - 1);
  }
  function handlePeriodNext() {
    if (timePeriod === "week") { if (pWeek < isoWeeksInYear(pYear)) setPWeek(w => w + 1); else { setPYear(y => y + 1); setPWeek(1); } }
    else if (timePeriod === "month") { if (pMonth < 12) setPMonth(m => m + 1); else { setPYear(y => y + 1); setPMonth(1); } }
    else if (timePeriod === "quarter") { if (pQuarter < 4) setPQuarter(q => q + 1); else { setPYear(y => y + 1); setPQuarter(1); } }
    else if (timePeriod === "year") setPYear(y => y + 1);
  }
  // Chế độ xem: bảng (mặc định) / gom theo người / Kanban.
  const [viewMode, setViewMode] = useLocalStorage<"people" | "table" | "kanban">("manage:viewMode", "table");
  const [collapsed, setCollapsed] = React.useState<Set<string> | null>(() => null);
  // Tree collapsed dùng cho view Bảng (group theo Dự án → Loại hình → Hạng mục)
  const [treeCollapsed, setTreeCollapsed] = React.useState<Set<string> | null>(() => null);
  // Đổi tab workgroup → reset về null để mỗi tab luôn bắt đầu collapse toàn bộ.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { setTreeCollapsed(null); }, [activeWg]);
  // Context cho inline insert row trong tree (groupKey = tree node key để định vị)
  const [insertCtx, setInsertCtx] = React.useState<{
    groupKey: string;
    workGroupId: string;
    projectGroupCode: string;
    constructionTypeCode: string;
    hangMuc: string;
  } | null>(null);
  // Dialog thêm Hạng mục từ cấp Dự án (g1) hoặc Loại hình (g2)
  const [addHangMucCtx, setAddHangMucCtx] = React.useState<{
    groupId: string;
    groupCode: string;
    constructionTypeId: string | null;
    constructionTypeCode: string | null;
    lockCt: boolean; // true = CT cố định (g2), false = CT chọn từ dropdown (g1)
  } | null>(null);
  const [addHmName, setAddHmName] = React.useState("");
  const [addHmCtId, setAddHmCtId] = React.useState("");
  const [addHmSaving, setAddHmSaving] = React.useState(false);

  async function submitAddHangMuc() {
    if (!addHangMucCtx || !addHmName.trim()) return;
    if (!addHangMucCtx.groupId) { toast.error("Không tìm thấy ID dự án"); return; }
    setAddHmSaving(true);
    const res = await saveCatalogProject({
      groupId: addHangMucCtx.groupId,
      name: addHmName.trim(),
      constructionTypeId: addHangMucCtx.lockCt ? addHangMucCtx.constructionTypeId : (addHmCtId || null),
    });
    setAddHmSaving(false);
    if (res.ok) {
      toast.success("Đã thêm hạng mục — đồng bộ Khai báo thông tin");
      setAddHangMucCtx(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }
  const [dragCol, setDragCol] = React.useState<string | null>(null);
  const [expandedCols, setExpandedCols] = React.useState<Set<string>>(() => new Set());

  // Lọc theo từng cột (funnel + popover). key = col.key.
  const [colFilters, setColFilters] = useLocalStorage<Record<string, ColFilterVal>>("manage:colFilters", {});
  // Popover lọc đang mở: { key, rect }.
  const [openFilter, setOpenFilter] = React.useState<{ key: SortKey; rect: DOMRect } | null>(null);
  const setCF = (k: SortKey, v: ColFilterVal) => setColFilters((s) => ({ ...s, [k]: v }));
  const clearCol = (k: SortKey) =>
    setColFilters((s) => {
      const n = { ...s };
      delete n[k];
      return n;
    });

  // Bề rộng cột cố định (giống /tasks) — không cho kéo giãn để tránh lệch cột.

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
          [t.name, t.sumId, colText(t, "duAn"), t.level2, t.level3, blockSystemText(t), t.level5, t.assigneeNames.join(" ")]
            .filter(Boolean)
            .join(" "),
        ),
      );
    }
    return m;
  }, [tasks]);

  // Mặc định: g1 (dự án) + g2 (loại hình) mở, chỉ thu g3 (hạng mục)
  const activeWgAbbr = React.useMemo(
    () => workGroups.find((w) => w.id === activeWg)?.abbr ?? null,
    [workGroups, activeWg],
  );
  // Tab "Tất cả" hoặc QL/TT → pre-seed từ Projects (catalog tab 2)
  const useProjectSeed = !activeWg || PROJECT_BASED_ABBRS.has(activeWgAbbr ?? "");
  // Tab "Tất cả" hoặc BT → pre-seed từ CatalogItem L2/L3 (catalog tab 3)
  const useBTSeed = !activeWg || activeWgAbbr === BT_ABBR;
  const btWgId = React.useMemo(
    () => workGroups.find((w) => w.abbr === BT_ABBR)?.id ?? null,
    [workGroups],
  );

  // Catalog seed: group → loaiHinh → [hạng mục]
  // QL/TT: pre-seed từ projects (catalog tab 2); BT: pre-seed từ CatalogItem L2/L3 (tab 3)
  const catalogSeed = React.useMemo(() => {
    const seed = new Map<string, Map<string, Set<string>>>();
    if (useProjectSeed) {
      for (const p of projects) {
        const dk = p.groupCode || "—";
        const lk = p.constructionTypeCode || "—";
        const hk = p.name || "—";
        if (!seed.has(dk)) seed.set(dk, new Map());
        const byLoai = seed.get(dk)!;
        if (!byLoai.has(lk)) byLoai.set(lk, new Set());
        byLoai.get(lk)!.add(hk);
      }
    }
    if (useBTSeed && btWgId && catalog[btWgId]?.l3ByL2) {
      if (!seed.has("—")) seed.set("—", new Map());
      const byLoai = seed.get("—")!;
      for (const [l2, l3s] of Object.entries(catalog[btWgId].l3ByL2)) {
        if (!byLoai.has(l2)) byLoai.set(l2, new Set());
        for (const l3 of l3s) byLoai.get(l2)!.add(l3);
      }
    }
    return seed;
  }, [projects, catalog, btWgId, useProjectSeed, useBTSeed]);

  // Giá trị phân biệt cho các cột lọc "multi".
  // Gộp cả giá trị từ catalog seed (Dự án/Loại hình/Hạng mục chưa có việc nào) để có thể
  // tìm & lọc ra các nhánh rỗng trong cây (VD: BDX01 (0 việc)).
  const distinct = React.useMemo(() => {
    const uniq = (vals: string[]) =>
      [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    const seedDuAn: string[] = [];
    const seedLoaiHinh: string[] = [];
    const seedHangMuc: string[] = [];
    for (const [dk, byLoai] of catalogSeed) {
      seedDuAn.push(dk);
      for (const [lk, hangSet] of byLoai) {
        seedLoaiHinh.push(lk);
        for (const hk of hangSet) seedHangMuc.push(hk);
      }
    }
    return {
      duAn: uniq([...tasks.map((t) => colText(t, "duAn")), ...seedDuAn]),
      loaiHinh: uniq([...tasks.map((t) => colText(t, "loaiHinh")), ...seedLoaiHinh]),
      hangMuc: uniq([...tasks.map((t) => colText(t, "hangMuc")), ...seedHangMuc]),
      congViec: uniq(tasks.map((t) => colText(t, "congViec"))),
      giaiDoan: uniq(tasks.map((t) => colText(t, "giaiDoan"))),
      boMon: uniq(tasks.map((t) => colText(t, "boMon"))),
      thucHien: uniq(tasks.flatMap((t) => t.assigneeNames)),
    };
  }, [tasks, catalogSeed]);

  // Danh sách cột (ẩn cột Mã mặc định).
  const cols = React.useMemo<ColDef[]>(() => {
    const all: ColDef[] = [
      { key: "sumId", label: "Mã", mono: true, filter: "text" },
      { key: "duAn", label: "Dự án", lvl: 1, filter: "multi", opts: distinct.duAn },
      { key: "loaiHinh", label: "Loại hình", lvl: 2, filter: "multi", opts: distinct.loaiHinh },
      { key: "hangMuc", label: "Hạng mục", lvl: 3, filter: "multi", opts: distinct.hangMuc },
      { key: "congViec", label: "Công việc", lvl: 4, leaf: true, filter: "multi", opts: distinct.congViec },
      { key: "giaiDoan", label: "Giai đoạn", filter: "multi", opts: distinct.giaiDoan },
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
      { key: "thucTe", label: "Thực tế hoàn thành", filter: "date" },
      { key: "soGio", label: "Thời gian", filter: "none" },
      { key: "ketQua", label: "Kết quả", filter: "text" },
    ];
    return SHOW_MA ? all : all.filter((c) => c.key !== "sumId");
  }, [distinct]);

  const activeCols = cols.filter((c) => colActive(c, colFilters[c.key]));

  // Helper: chip "Lọc:" nhanh — khớp thô theo từ khóa có trong Loại hình/Hạng mục/Công việc/mã.
  function passL1(t: TaskRow): boolean {
    if (!activeL1 || !activeWg || t.workGroupId !== activeWg) return true;
    return (haystacks.get(t.id) ?? "").includes(norm(activeL1));
  }

  // Nền KPI: deep-link + tìm + filter cột (KHÔNG gồm quick & tab) → số KPI ổn định khi bấm.
  const kpiBase = React.useMemo(() => {
    return tasks.filter((t) => {
      // deep-link Báo cáo
      if (f.userId && !t.assigneeIds.includes(f.userId)) return false;
      if (f.phong && phongOf(t.disciplineCode) !== f.phong) return false;
      if (f.dateFrom || f.dateTo) {
        if (!t.plannedEnd) return false;
        if (f.dateFrom && t.plannedEnd < f.dateFrom) return false;
        if (f.dateTo && t.plannedEnd > f.dateTo) return false;
      }
      if (!passL1(t)) return false;
      if (!matchesSearch(haystacks.get(t.id) ?? "", deferredSearch)) return false;
      for (const c of cols) if (!rowMatchesCol(t, c, colFilters[c.key])) return false;
      if (!inPeriod(t.plannedStart, t.plannedEnd, t.actualEnd, periodBounds) && !isOverdue(t) && !t.deleteRequestedAt) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, activeL1, activeWg, catalog, f.userId, f.phong, f.dateFrom, f.dateTo, deferredSearch, haystacks, cols, colFilters, periodBounds]);

  const kpi = React.useMemo(() => {
    // KPI bám theo tab nhóm (+ tìm kiếm + lọc cột) nhưng KHÔNG bám quick:
    // bấm vào 1 thẻ không làm các thẻ khác về 0.
    const scope = activeWg ? kpiBase.filter((t) => t.workGroupId === activeWg) : kpiBase;
    let overdue = 0;
    let soon = 0;
    let unassigned = 0;
    let unassignedOrPending = 0;
    let doing = 0;
    let done = 0;
    let progSum = 0;
    for (const t of scope) {
      if (isOverdue(t)) overdue++;
      else if (isDueSoon(t)) soon++;
      if (t.assigneeIds.length === 0) unassigned++;
      if (t.assigneeIds.length === 0 || isPendingApproval(t) || hasPendingDeadline(t) || !!t.deleteRequestedAt) unassignedOrPending++;
      if (effOf(t) === "DANG_LAM") doing++;
      if (effOf(t) === "HOAN_THANH") done++;
      progSum += t.progressPercent;
    }
    return {
      overdue,
      soon,
      unassigned,
      unassignedOrPending,
      doing,
      done,
      avg: scope.length ? Math.round(progSum / scope.length) : 0,
    };
  }, [kpiBase, activeWg]);

  // Áp lọc nhanh KPI (vẫn TRỪ tab nhóm để đếm theo tab).
  const base = React.useMemo(() => {
    return kpiBase.filter((t) => {
      if (quick === "QUA_HAN" && !isOverdue(t)) return false;
      if (quick === "SAP_HAN" && !isDueSoon(t)) return false;
      if (quick === "CHUA_GIAO" && t.assigneeIds.length !== 0 && !isPendingApproval(t) && !hasPendingDeadline(t) && !t.deleteRequestedAt) return false;
      if (quick === "DANG_LAM" && !["DANG_LAM", "CHUA_LAM", "QUA_HAN"].includes(effOf(t))) return false;
      if (quick === "HOAN_THANH" && effOf(t) !== "HOAN_THANH") return false;
      return true;
    });
  }, [kpiBase, quick]);

  const wgCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of base) m.set(t.workGroupId, (m.get(t.workGroupId) ?? 0) + 1);
    return m;
  }, [base]);

  const filtered = React.useMemo(() => {
    // activeL1 đã lọc ở kpiBase (upstream) — ở đây chỉ còn cần lọc theo tab nhóm.
    return activeWg ? base.filter((t) => t.workGroupId === activeWg) : base;
  }, [base, activeWg]);

  // Cột cấu trúc: khi filter những cột này vẫn giữ pre-seed catalog (chỉ lọc trong seed).
  // Các filter khác (người, phòng, ngày, tìm, quick, tình trạng...) mới ẩn group 0-task.
  const STRUCTURAL_FILTER_KEYS = new Set<string>(["duAn", "loaiHinh", "hangMuc"]);
  const hasActiveFilter = Boolean(
    f.userId || f.phong || f.dateFrom || f.dateTo ||
    deferredSearch.trim() ||
    quick ||
    activeCols.some(c => !STRUCTURAL_FILTER_KEYS.has(c.key))
  );

  // ---- Sắp xếp ---- (mặc định theo phân cấp Dự án → … để đọc như cây)
  const [sort, setSort] = useLocalStorage<{ key: SortKey; dir: "asc" | "desc" }>("manage:sort", {
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
  // Order maps theo thứ tự khai báo — sort catalog-defined order thay vì alphabetical.
  const l5OrderMap = React.useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const [wgId, cat] of Object.entries(catalog)) {
      m.set(wgId, new Map(cat.l5.map((v, i) => [v, i])));
    }
    return m;
  }, [catalog]);
  const l2OrderMap = React.useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const [wgId, cat] of Object.entries(catalog)) {
      m.set(wgId, new Map(cat.l2.map((v, i) => [v, i])));
    }
    return m;
  }, [catalog]);
  const phaseOrderMap = React.useMemo(
    () => new Map(phases.map((p, i) => [p.id, i])),
    [phases],
  );
  const disciplineOrderMap = React.useMemo(
    () => new Map(disciplines.map((d, i) => [d.id, i])),
    [disciplines],
  );
  const hierKey = (t: TaskRow) => {
    const l2Idx = t.projectId ? null : (l2OrderMap.get(t.workGroupId)?.get(t.level2 ?? "") ?? null);
    const l2Part = l2Idx !== null ? String(l2Idx).padStart(5, "0") : norm(colText(t, "loaiHinh"));
    const l5Idx = l5OrderMap.get(t.workGroupId)?.get(t.name) ?? 9999;
    return norm(colText(t, "duAn")) + l2Part + norm(colText(t, "hangMuc")) + norm(blockSystemText(t)) + String(l5Idx).padStart(5, "0");
  };
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
      case "soGio":
        return t.totalHours;
      case "loaiHinh":
        if (!t.projectId) return l2OrderMap.get(t.workGroupId)?.get(t.level2 ?? "") ?? 9999;
        return norm(colText(t, "loaiHinh"));
      case "giaiDoan":
        return phaseOrderMap.get(t.phaseId ?? "") ?? 9999;
      case "boMon":
        return disciplineOrderMap.get(t.disciplineId ?? "") ?? 9999;
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

  // ---- Tree grouping cho view Bảng ----
  type TreeNode =
    | { type: "g1" | "g2" | "g3" | "g4"; key: string; label: string; count: number; overdue: number; tasks: TaskRow[] }
    | { type: "task"; task: TaskRow }
    | { type: "insert"; ctx: NonNullable<typeof insertCtx> };

  // Collapse g3 groups from catalog — QL/TT dùng projects, BT dùng catalog L2/L3
  const effectiveTreeCollapsed = React.useMemo(() => {
    if (treeCollapsed) return treeCollapsed;
    const keys = new Set<string>();
    for (const t of sorted) {
      const dk = colText(t, "duAn") || "—";
      const lk = colText(t, "loaiHinh") || "—";
      const hk = colText(t, "hangMuc") || "—";
      const bk = blockSystemText(t);
      keys.add(`h:${dk}|${lk}|${hk}`);
      if (bk) keys.add(`b:${dk}|${lk}|${hk}|${bk}`);
    }
    if (useProjectSeed) {
      for (const p of projects) {
        keys.add(`h:${p.groupCode || "—"}|${p.constructionTypeCode || "—"}|${p.name || "—"}`);
      }
    }
    if (useBTSeed && btWgId && catalog[btWgId]?.l3ByL2) {
      for (const [l2, l3s] of Object.entries(catalog[btWgId].l3ByL2)) {
        for (const l3 of l3s) keys.add(`h:—|${l2}|${l3}`);
      }
    }
    return keys;
  }, [treeCollapsed, sorted, projects, catalog, btWgId, useProjectSeed, useBTSeed]);

  const treeNodes = React.useMemo((): TreeNode[] => {
    const nodes: TreeNode[] = [];
    const ins = insertCtx; // capture để dùng trong closure

    // Trích structural filter values để lọc catalog seed (chỉ lọc theo cột cấu trúc, không ẩn hoàn toàn)
    const cfDuAn = (colFilters["duAn"] as string[] | undefined);
    const cfLoai = (colFilters["loaiHinh"] as string[] | undefined);
    const cfHang = (colFilters["hangMuc"] as string[] | undefined);
    const filterDuAn = cfDuAn?.length ? cfDuAn : null;
    const filterLoai = cfLoai?.length ? cfLoai : null;
    const filterHang = cfHang?.length ? cfHang : null;

    // Pre-seed byDuAn từ catalog (giữ thứ tự catalog, task sẽ điền vào sau)
    // Bỏ qua khi có filter NON-structural đang bật — chỉ show group có task khớp filter
    const byDuAn = new Map<string, TaskRow[]>();
    if (!hasActiveFilter) {
      for (const dk of catalogSeed.keys()) {
        if (filterDuAn && !filterDuAn.includes(dk)) continue; // lọc theo filter Dự án
        byDuAn.set(dk, []);
      }
    }
    for (const t of sorted) {
      const k = colText(t, "duAn") || "—";
      (byDuAn.get(k) ?? (byDuAn.set(k, []), byDuAn.get(k)!)).push(t);
    }

    for (const [dk, dTasks] of byDuAn) {
      const d1 = `d:${dk}`;

      // Build byLoai trước để biết số lượng loại hình (dùng làm count cho g1)
      const catalogLoai = !hasActiveFilter ? catalogSeed.get(dk) : undefined;
      const byLoai = new Map<string, TaskRow[]>();
      if (catalogLoai) {
        for (const lk of catalogLoai.keys()) {
          if (filterLoai && !filterLoai.includes(lk)) continue; // lọc theo filter Loại hình
          byLoai.set(lk, []);
        }
      }
      for (const t of dTasks) {
        const k = colText(t, "loaiHinh") || "—";
        (byLoai.get(k) ?? (byLoai.set(k, []), byLoai.get(k)!)).push(t);
      }

      nodes.push({ type: "g1", key: d1, label: dk, count: byLoai.size, overdue: dTasks.filter(isOverdue).length, tasks: dTasks });
      if (ins?.groupKey === d1) nodes.push({ type: "insert", ctx: ins });
      if (effectiveTreeCollapsed.has(d1)) continue;

      for (const [lk, lTasks] of byLoai) {
        const d2 = `l:${dk}|${lk}`;

        // Build byHang trước để biết số lượng hạng mục (dùng làm count cho g2)
        const catalogHang = catalogLoai?.get(lk);
        const byHang = new Map<string, TaskRow[]>();
        if (catalogHang) {
          for (const hk of catalogHang) {
            if (filterHang && !filterHang.includes(hk)) continue; // lọc theo filter Hạng mục
            byHang.set(hk, []);
          }
        }
        for (const t of lTasks) {
          const k = colText(t, "hangMuc") || "—";
          (byHang.get(k) ?? (byHang.set(k, []), byHang.get(k)!)).push(t);
        }

        nodes.push({ type: "g2", key: d2, label: lk, count: byHang.size, overdue: lTasks.filter(isOverdue).length, tasks: lTasks });
        if (ins?.groupKey === d2) nodes.push({ type: "insert", ctx: ins });
        if (effectiveTreeCollapsed.has(d2)) continue;

        for (const [hk, hTasks] of byHang) {
          const d3 = `h:${dk}|${lk}|${hk}`;
          nodes.push({ type: "g3", key: d3, label: hk, count: hTasks.length, overdue: hTasks.filter(isOverdue).length, tasks: hTasks });
          if (ins?.groupKey === d3) nodes.push({ type: "insert", ctx: ins });
          if (effectiveTreeCollapsed.has(d3)) continue;
          const withBlock = hTasks.filter((t) => blockSystemText(t));
          const withoutBlock = hTasks.filter((t) => !blockSystemText(t));
          const byBlock = new Map<string, TaskRow[]>();
          for (const t of withBlock) {
            const k = blockSystemText(t);
            (byBlock.get(k) ?? (byBlock.set(k, []), byBlock.get(k)!)).push(t);
          }
          for (const [bk, bTasks] of byBlock) {
            const d4 = `b:${dk}|${lk}|${hk}|${bk}`;
            nodes.push({ type: "g4", key: d4, label: bk, count: bTasks.length, overdue: bTasks.filter(isOverdue).length, tasks: bTasks });
            if (ins?.groupKey === d4) nodes.push({ type: "insert", ctx: ins });
            if (effectiveTreeCollapsed.has(d4)) continue;
            for (const t of bTasks) nodes.push({ type: "task", task: t });
          }
          for (const t of withoutBlock) nodes.push({ type: "task", task: t });
        }
      }
    }
    return nodes;
  }, [sorted, effectiveTreeCollapsed, insertCtx, catalogSeed, hasActiveFilter, colFilters]);

  // Tất cả keys theo từng cấp (dùng cho expand/collapse từng cấp).
  const allTreeKeys = React.useMemo(() => {
    const d = new Set<string>(), l = new Set<string>(), h = new Set<string>(), b = new Set<string>();
    for (const [dk, byLoai] of catalogSeed) {
      d.add(`d:${dk}`);
      for (const [lk, hangSet] of byLoai) {
        l.add(`l:${dk}|${lk}`);
        for (const hk of hangSet) {
          h.add(`h:${dk}|${lk}|${hk}`);
        }
      }
    }
    for (const t of sorted) {
      const dk = colText(t, "duAn") || "—";
      const lk = colText(t, "loaiHinh") || "—";
      const hk = colText(t, "hangMuc") || "—";
      const bk = blockSystemText(t);
      d.add(`d:${dk}`);
      l.add(`l:${dk}|${lk}`);
      h.add(`h:${dk}|${lk}|${hk}`);
      if (bk) b.add(`b:${dk}|${lk}|${hk}|${bk}`);
    }
    return { d: [...d], l: [...l], h: [...h], b: [...b] };
  }, [catalogSeed, sorted]);

  const selectedTreeKeys = React.useMemo(() => {
    const d = new Set<string>(), l = new Set<string>(), h = new Set<string>(), b = new Set<string>();
    for (const t of sorted) {
      if (!selected.has(t.id)) continue;
      const dk = colText(t, "duAn") || "—";
      const lk = colText(t, "loaiHinh") || "—";
      const hk = colText(t, "hangMuc") || "—";
      const bk = blockSystemText(t);
      d.add(`d:${dk}`);
      l.add(`l:${dk}|${lk}`);
      h.add(`h:${dk}|${lk}|${hk}`);
      if (bk) b.add(`b:${dk}|${lk}|${hk}|${bk}`);
    }
    return { d: [...d], l: [...l], h: [...h], b: [...b], all: [...d, ...l, ...h, ...b] };
  }, [sorted, selected]);

  function toggleTreeNode(key: string) {
    setTreeCollapsed((s) => {
      const n = new Set(s ?? effectiveTreeCollapsed);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  // Expand từng cấp: d → l → h (lần lượt xổ ra từng lớp)
  function expandOneLevel() {
    setTreeCollapsed((prev) => {
      const n = new Set(prev ?? effectiveTreeCollapsed);
      if (selected.size > 0) {
        selectedTreeKeys.all.forEach((k) => n.delete(k));
        return n;
      }
      if (allTreeKeys.d.some((k) => n.has(k))) {
        allTreeKeys.d.forEach((k) => n.delete(k));
      } else if (allTreeKeys.l.some((k) => n.has(k))) {
        allTreeKeys.l.forEach((k) => n.delete(k));
      } else if (allTreeKeys.h.some((k) => n.has(k))) {
        allTreeKeys.h.forEach((k) => n.delete(k));
      } else {
        allTreeKeys.b.forEach((k) => n.delete(k));
      }
      return n;
    });
  }

  // Collapse từng cấp: h → l → d (thu lần lượt từ trong ra)
  function collapseOneLevel() {
    setTreeCollapsed((prev) => {
      const n = new Set(prev ?? effectiveTreeCollapsed);
      if (selected.size > 0) {
        selectedTreeKeys.all.forEach((k) => n.add(k));
        return n;
      }
      if (allTreeKeys.b.some((k) => !n.has(k))) {
        allTreeKeys.b.forEach((k) => n.add(k));
      } else if (allTreeKeys.h.some((k) => !n.has(k))) {
        allTreeKeys.h.forEach((k) => n.add(k));
      } else if (allTreeKeys.l.some((k) => !n.has(k))) {
        allTreeKeys.l.forEach((k) => n.add(k));
      } else {
        allTreeKeys.d.forEach((k) => n.add(k));
      }
      return n;
    });
  }

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
      const n = new Set(s ?? groups.map((g) => g.key));
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }
  function collapseAllGroups() {
    if (selected.size > 0) {
      const targetKeys = groups
        .filter((g) => g.tasks.some((t) => selected.has(t.id)))
        .map((g) => g.key);
      setCollapsed((prev) => {
        const n = new Set(prev ?? effectiveCollapsed);
        targetKeys.forEach((k) => n.add(k));
        return n;
      });
      return;
    }
    setCollapsed(new Set(groups.map((g) => g.key)));
  }
  function expandAllGroups() {
    if (selected.size > 0) {
      const targetKeys = new Set(
        groups.filter((g) => g.tasks.some((t) => selected.has(t.id))).map((g) => g.key),
      );
      setCollapsed((prev) => {
        const n = new Set(prev ?? effectiveCollapsed);
        targetKeys.forEach((k) => n.delete(k));
        return n;
      });
      return;
    }
    setCollapsed(new Set());
  }
  const effectiveCollapsed = collapsed ?? new Set(groups.map((g) => g.key));

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

  async function approveCompletion(t: TaskRow) {
    const res = await setTaskApproval({ id: t.id, approved: true });
    if (res.ok) { toast.success("Đã duyệt hoàn thành"); router.refresh(); }
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
  // Thứ tự dòng đang hiển thị (để Shift+click chọn dải) — theo view hiện tại.
  function visibleOrderIds(): string[] {
    if (viewMode === "people") {
      return groups.flatMap((g) => (effectiveCollapsed.has(g.key) ? [] : g.tasks.map((t) => t.id)));
    }
    if (viewMode === "table") {
      return treeNodes.filter((n) => n.type === "task").map((n) => (n as { type: "task"; task: TaskRow }).task.id);
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
    setActiveL1("");
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
  async function batchApprove(approved: boolean) {
    const label = approved ? "duyệt" : "thu hồi duyệt";
    if (!confirm(`${approved ? "Duyệt" : "Thu hồi duyệt"} ${selected.size} công việc?`)) return;
    await applyBatch(bulkSetApproval({ ids: [...selected], approved }), `Đã ${label}`);
  }
  async function batchApproveDeadline(approve: boolean) {
    const ids = tasks.filter((t) => selected.has(t.id) && (t.pendingPlannedEnd || t.endChangeRequesterId)).map((t) => t.id);
    if (ids.length === 0) return;
    if (!confirm(`${approve ? "Duyệt" : "Từ chối"} dời hạn cho ${ids.length} công việc?`)) return;
    for (const id of ids) {
      const res = approve ? await approveEndDateChange(id) : await rejectEndDateChange(id);
      if (!res.ok) { toast.error(res.error); return; }
    }
    toast.success(approve ? `Đã duyệt dời hạn ${ids.length} việc` : `Đã từ chối dời hạn ${ids.length} việc`);
    router.refresh();
  }
  async function batchApproveDelete() {
    const ids = tasks.filter((t) => selected.has(t.id) && t.deleteRequestedAt).map((t) => t.id);
    if (ids.length === 0) return;
    if (!confirm(`Duyệt xóa ${ids.length} công việc? Hành động này không thể hoàn tác.`)) return;
    for (const id of ids) {
      const res = await approveDeleteTask(id);
      if (!res.ok) { toast.error(res.error); return; }
    }
    toast.success(`Đã xóa ${ids.length} công việc`);
    setSelected(new Set());
    router.refresh();
  }
  async function batchDeleteSelected() {
    if (!confirm(`Xóa ${selected.size} công việc? Hành động này không thể hoàn tác.`)) return;
    const res = await bulkDelete({ ids: [...selected] });
    if (res.ok) { toast.success(`Đã xóa ${res.data} công việc`); clearSel(); router.refresh(); }
    else toast.error(res.error);
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
  const dens = DENSITY === "compact" ? "py-1" : DENSITY === "comfy" ? "py-3" : "py-1.5";
  const cellPad = `px-2.5 ${dens}`;
  const widthOf = (k: string) => (k === "__sel__" ? MANAGE_SEL_PX : (MANAGE_COL_W[k] ?? 120));
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
    cols.reduce((s, c) => s + widthOf(c.key), 0);
  const totalColsCount = (canManage ? 1 : 0) + cols.length;

  // ---- Header 1 cột ----
  function renderHead(col: ColDef) {
    const active = sort.key === col.key;
    const filterOn = colActive(col, colFilters[col.key]);
    return (
      <th
        key={col.key}
        style={headStyle(col.key, MANAGE_COL_W[col.key])}
        className={cn(
          "group relative select-none border-b border-slate-200 dark:border-slate-700 px-2.5 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400",
          col.lvl && "border-l border-slate-100 dark:border-slate-800",
        )}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 text-left hover:text-slate-800 dark:hover:text-slate-100"
            onClick={() => toggleSort(col.key)}
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
                : "text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300",
            )}
          >
            <Filter className="size-3" strokeWidth={filterOn ? 2.5 : 2} />
          </button>
        </div>
      </th>
    );
  }

  // ---- Một ô phân cấp (dedup giá trị cha lặp) ----
  function hierTd(col: ColDef, t: TaskRow, meta?: { repeat: Record<string, boolean> }) {
    const rep = meta?.repeat[col.key] ?? false;
    const blank = rep && GROUPING === "merge";
    const dim = rep && GROUPING === "dim";
    const v = colText(t, col.key);
    const isCongViec = col.key === "congViec";
    return (
      <td
        key={col.key}
        style={bodyFrozenStyle(col.key)}
        className={cn("border-l border-slate-100 dark:border-slate-800 align-top", cellPad, isCongViec && "cursor-pointer")}
        onClick={isCongViec ? () => void openDetail(t) : undefined}
        title={isCongViec ? "Xem chi tiết công việc" : undefined}
      >
        {blank ? null : !v ? (
          <span className="text-slate-300 dark:text-slate-600">—</span>
        ) : col.leaf ? (
          <span className={dim ? "text-slate-400 dark:text-slate-500" : "font-medium text-slate-800 dark:text-slate-100"}>{v}</span>
        ) : (
          <span
            className={dim ? "text-slate-300 dark:text-slate-600" : col.lvl === 1 ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-600 dark:text-slate-300"}
            title={col.key === "duAn" ? (t.groupName ?? undefined) : undefined}
          >
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
    const pendingApproval = isPendingApproval(t);
    const canApproveStart = canManage || t.approverId === currentUserId;
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
                title={`Hoàn thành trễ hạn ${lateDays} ngày (hạn ${fmtDate(t.plannedEnd)} · xong ${fmtDate(t.actualEnd)})`}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-rose-50 dark:bg-rose-950 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-200 dark:ring-rose-800"
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
                  className="grid size-6 place-items-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <Play className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  title="Tạm dừng"
                  onClick={() => togglePause(t, true)}
                  className="grid size-6 place-items-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <Pause className="size-3.5" />
                </button>
              )
            ) : null}
          </div>
          {hasPendingDeadline(t) ? (
            <span
              className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-semibold text-orange-600"
              title={[t.endChangeRequesterName ? `${t.endChangeRequesterName} xin dời hạn` : "Xin dời hạn", t.endChangeNote].filter(Boolean).join(" — ")}
            >
              <span className="size-1.5 rounded-full bg-orange-500" />
              {t.pendingPlannedEnd ? `Xin dời → ${fmtDate(t.pendingPlannedEnd)}` : "Xin dời hạn (chưa có ngày)"}
            </span>
          ) : null}
          {t.deleteRequestedAt ? (
            <div className="mt-0.5 flex items-center gap-1">
              <span
                className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400"
                title={[t.deleteRequesterName ? `${t.deleteRequesterName} xin xóa` : "Xin xóa", t.deleteRequestNote].filter(Boolean).join(" — ")}
              >
                <span className="size-1.5 rounded-full bg-red-500" /> Chờ duyệt xóa
              </span>
              <button type="button" title="Duyệt xóa"
                onClick={async () => {
                  const r = await approveDeleteTask(t.id);
                  if (r.ok) { toast.success("Đã xóa công việc"); router.refresh(); }
                  else toast.error(r.error);
                }}
                className="grid size-4 place-items-center rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:bg-emerald-950">
                <Check className="size-3" />
              </button>
              <button type="button" title="Từ chối xóa"
                onClick={async () => {
                  const r = await rejectDeleteTask(t.id);
                  if (r.ok) { toast.success("Đã từ chối yêu cầu xóa"); router.refresh(); }
                  else toast.error(r.error);
                }}
                className="grid size-4 place-items-center rounded text-red-500 hover:bg-red-50 dark:bg-red-950">
                <X className="size-3" />
              </button>
            </div>
          ) : null}
          {dz === "CHO_DUYET" ? (
            canApproveStart ? (
              <button
                type="button"
                onClick={() => void toggleStartApproval(t, true)}
                className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:text-emerald-600 dark:text-emerald-400"
                title="Bấm để duyệt khởi tạo — cho phép nhập thời gian"
              >
                <Lock className="size-2.5" /> Chờ duyệt
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                title={t.approverName ? `Chờ ${t.approverName} duyệt khởi tạo` : "Đang chờ quản lý duyệt khởi tạo"}
              >
                <Lock className="size-2.5" /> Chờ duyệt
              </span>
            )
          ) : dz === "CHUA_DUYET" ? (
            canManage ? (
              <button
                type="button"
                onClick={() => void approveCompletion(t)}
                className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:text-emerald-600 dark:text-emerald-400"
                title="Bấm để duyệt hoàn thành"
              >
                <span className="size-1.5 rounded-full bg-amber-500" /> Chưa duyệt
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 pl-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                title={t.approverName ? `Chờ ${t.approverName} duyệt` : "Chưa duyệt"}
              >
                <span className="size-1.5 rounded-full bg-amber-500" /> Chưa duyệt
              </span>
            )
          ) : null}
          {t.completionHistory.length > 0 ? (
            <span
              className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-800"
              title={formatCompletionHistory(t.completionHistory)}
            >
              <History className="size-2.5 shrink-0" /> {t.completionHistory.length} lần hoàn thành trước
            </span>
          ) : null}
        </div>
      </td>
    );
  }

  // Một dòng việc — dùng chung cho cả view Bảng và view Gom theo người.
  function renderRow(
    t: TaskRow,
    opts?: { keyExtra?: string; meta?: { repeat: Record<string, boolean>; newProject: boolean } },
  ) {
    const canApproveStart = canManage || t.approverId === currentUserId;
    if (editing?.id === t.id && canApproveStart) {
      return (
        <InlineTaskEditRow
          key={`${opts?.keyExtra ?? ""}${t.id}-edit`}
          task={t}
          canManage={canManage}
          cols={cols}
          projects={projects}
          disciplines={disciplines}
          phases={phases}
          users={users}
          catalog={catalog}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      );
    }
    const overdue = isOverdue(t);
    const pendingApproval = isPendingApproval(t);
    const late = isCompletedLate(t);
    const canEditDone = (canManage || t.assigneeIds.includes(currentUserId)) && !pendingApproval;
    const meta = opts?.meta;
    const isSel = selected.has(t.id);
    return (
      <tr
        key={`${opts?.keyExtra ?? ""}${t.id}`}
        onDoubleClick={canApproveStart ? () => setEditing(t) : undefined}
        title={canApproveStart ? "Bấm đúp để sửa" : undefined}
        // --row-bg: nền đục của hàng (theme var) — ô ghim đọc lại biến này để luôn đồng màu + đúng dark mode.
        // Viền dưới đặt trên td (qua tbody), viền-trên vạch nhóm cũng trên td (separate không vẽ viền <tr>).
        className={cn(
          "bg-[var(--row-bg)]",
          canApproveStart && "cursor-default",
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
          // Trong tree view (Bảng): duAn/loaiHinh/hangMuc để trống (đã hiện ở dòng nhóm phía trên),
          // Công việc hiện tên việc — mỗi cột 1 ô riêng (không colSpan) để khớp đúng colgroup/sticky,
          // tránh lệch cột (trước đây gộp bằng colSpan + sticky gây lệch — giống cách tab Công việc của tôi làm).
          if (c.lvl) {
            if (viewMode === "table") {
              if (!c.leaf) return <td key={c.key} style={bodyFrozenStyle(c.key)} className="align-top" />;
              return (
                <td
                  key={c.key}
                  style={bodyFrozenStyle(c.key)}
                  className={cn("cursor-pointer border-l border-slate-100 dark:border-slate-800 align-top", cellPad)}
                  onClick={() => void openDetail(t)}
                  title="Xem chi tiết công việc"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-100">{t.name || <span className="text-slate-300 dark:text-slate-600">—</span>}</span>
                </td>
              );
            }
            return hierTd(c, t, meta);
          }
          if (c.key === "sumId")
            return (
              <td key="sumId" className={cn("align-top", cellPad)}>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{t.sumId ?? "—"}</span>
              </td>
            );
          if (c.key === "giaiDoan")
            return (
              <td key="giaiDoan" className="px-2.5 py-2.5 align-top text-xs text-slate-600 dark:text-slate-300">
                {t.phaseName || <span className="text-slate-300 dark:text-slate-600">—</span>}
              </td>
            );
          if (c.key === "boMon")
            return (
              <td key="boMon" className={cn("align-top text-xs text-slate-600 dark:text-slate-300", cellPad)}>
                {t.disciplineCode || <span className="text-slate-300 dark:text-slate-600">—</span>}
              </td>
            );
          if (c.key === "thucHien")
            return (
              <td key="thucHien" className={cn("align-top text-xs", cellPad)}>
                {t.assigneeNames.length ? (
                  <span className="text-slate-700 dark:text-slate-200">{t.assigneeNames.join(", ")}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <UserX className="size-3" /> Chưa giao
                  </span>
                )}
              </td>
            );
          if (c.key === "uuTien")
            return (
              <td key="uuTien" className={cn("align-top", cellPad)}>
                <span className={cn("text-[11px] font-medium whitespace-nowrap", t.priority === "CAO" ? "text-red-600 dark:text-red-400" : t.priority === "TRUNG_BINH" ? "text-amber-500" : "text-slate-400 dark:text-slate-500")}>{PRIORITY_LABEL[t.priority]}</span>
              </td>
            );
          if (c.key === "tinhTrang") return statusTd(t);
          if (c.key === "batDau")
            return (
              <td key="batDau" className={cn("align-top text-xs text-slate-500 dark:text-slate-400", cellPad)}>
                {t.plannedStart ? fmtDate(t.plannedStart) : "—"}
              </td>
            );
          if (c.key === "ketThuc")
            return (
              <td key="ketThuc" className={cn("align-top text-xs", cellPad)}>
                {t.plannedEnd ? (
                  <span className={cn(overdue && "font-medium text-red-600 dark:text-red-400")}>{fmtDate(t.plannedEnd)}</span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </td>
            );
          if (c.key === "thucTe")
            return (
              <td key="thucTe" className="px-2.5 py-1 align-top">
                <label
                  className={cn(
                    "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                    canEditDone ? "cursor-pointer" : "cursor-default",
                    t.actualEnd
                      ? late
                        ? "bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-800"
                        : "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800"
                      : "bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700",
                  )}
                  title={
                    pendingApproval
                      ? "Việc đang chờ duyệt — chưa thể nhập"
                      : canEditDone
                        ? "Đặt/đổi ngày hoàn thành thực tế (không trước ngày bắt đầu)"
                        : "Chỉ người được giao hoặc quản lý"
                  }
                >
                  {t.actualEnd ? (
                    <Check className="size-3 shrink-0" strokeWidth={3} />
                  ) : (
                    <Calendar className="size-3 shrink-0 opacity-70" />
                  )}
                  {t.actualEnd ? fmtDate(t.actualEnd) : "Chọn ngày"}
                  <input
                    type="date"
                    value={t.actualEnd}
                    min={t.plannedStart || undefined}
                    disabled={!canEditDone}
                    onChange={(e) => onCompletion(t, e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
                  />
                </label>
              </td>
            );
          if (c.key === "soGio")
            return (
              <td
                key="soGio"
                className={cn(cellPad, "tabular-nums text-center text-slate-600 dark:text-slate-300")}
                title={t.hoursBreakdown.length > 0 ? formatHoursBreakdown(t.hoursBreakdown) : undefined}
              >
                {t.totalHours > 0 ? `${Number.isInteger(t.totalHours) ? t.totalHours : t.totalHours.toFixed(1)} (h)` : null}
              </td>
            );
          if (c.key === "ketQua")
            return (
              <td key="ketQua" className="px-2.5 py-1.5 align-top">
                <ResultCell taskId={t.id} value={t.result} canEdit={t.assigneeIds.includes(currentUserId) || canManage} />
              </td>
            );
          return <td key={c.key} className={cellPad} />;
        })}
      </tr>
    );
  }

  // Dòng tiêu đề nhóm người (chiếm hết chiều ngang, bấm để gập/mở).
  function groupHeaderRow(g: { key: string; name: string; overdue: number; tasks: TaskRow[] }) {
    const Chevron = effectiveCollapsed.has(g.key) ? ChevronRight : ChevronDown;
    return (
      <tr key={`grp-${g.key}`} className="bg-slate-100 dark:bg-slate-800">
        {/* Ô span hết hàng; nội dung bọc trong lớp sticky-left để nhãn nhóm ghim trái khi cuộn ngang. */}
        <td colSpan={totalColsCount} className="p-0">
          <div className="sticky left-0 z-[11] inline-flex max-w-[calc(100vw-1rem)] items-center bg-slate-100 dark:bg-slate-800 px-2.5 py-2">
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <Chevron className="size-4 text-slate-400 dark:text-slate-500" />
              {g.name}
              <span className="font-normal text-slate-400 dark:text-slate-500">
                ({g.tasks.length} việc{g.overdue ? ` · ${g.overdue} quá hạn` : ""})
              </span>
            </button>
          </div>
        </td>
      </tr>
    );
  }

  // Ngày Bắt đầu / Đóng gói từ project đầu tiên trong nhóm — luôn hiện ở g3 (Hạng mục).
  function projectDatesForGroup(groupTasks: TaskRow[], type: "g1" | "g2" | "g3" | "g4"): { startDate: string | null; packagingDate: string | null } | null {
    if (type !== "g3") return null;
    const t = groupTasks[0];
    if (!t?.projectId) return null;
    if (!t.projectStartDate && !t.projectPackagingDate) return null;
    return { startDate: t.projectStartDate, packagingDate: t.projectPackagingDate };
  }

  // Dòng tiêu đề nhóm trong tree view Bảng (3 cấp với indent khác nhau).
  function treeGroupRow(node: { type: "g1" | "g2" | "g3" | "g4"; key: string; label: string; count: number; overdue: number; tasks: TaskRow[] }) {
    const { type, key, label, count, overdue, tasks: groupTasks } = node;
    const isCollapsed = effectiveTreeCollapsed.has(key);
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;
    const bg = type === "g1" ? "bg-slate-100 dark:bg-slate-800" : "bg-slate-50 dark:bg-slate-900";
    const indent = type === "g1" ? 0 : type === "g2" ? widthOf("duAn") : type === "g3" ? widthOf("duAn") + widthOf("loaiHinh") : widthOf("duAn") + widthOf("loaiHinh") + widthOf("hangMuc");
    const projDates = projectDatesForGroup(groupTasks, type);
    const textCls =
      type === "g1"
        ? "text-[13px] font-semibold text-slate-700 dark:text-slate-200"
        : type === "g2"
          ? "text-[13px] font-medium text-slate-600 dark:text-slate-300"
          : "text-xs font-medium text-slate-500 dark:text-slate-400";
    const borderCls = type === "g2" ? "border-t border-slate-200 dark:border-slate-700" : type === "g3" ? "border-t border-slate-100 dark:border-slate-800" : "";

    const allSel = groupTasks.length > 0 && groupTasks.every((t) => selected.has(t.id));

    function parseInsertCtx() {
      const workGroupId = groupTasks[0]?.workGroupId ?? activeWg;
      if (type === "g1") {
        const d = key.slice(2);
        return { groupKey: key, workGroupId, projectGroupCode: d === "—" ? "" : d, constructionTypeCode: "", hangMuc: "" };
      }
      if (type === "g2") {
        const content = key.slice(2);
        const idx = content.indexOf("|");
        const d = content.slice(0, idx); const l = content.slice(idx + 1);
        return { groupKey: key, workGroupId, projectGroupCode: d === "—" ? "" : d, constructionTypeCode: l === "—" ? "" : l, hangMuc: "" };
      }
      if (type === "g4") {
        const content = key.slice(2);
        const i1 = content.indexOf("|"); const i2 = content.indexOf("|", i1 + 1); const i3 = content.indexOf("|", i2 + 1);
        const d = content.slice(0, i1); const l = content.slice(i1 + 1, i2); const h = content.slice(i2 + 1, i3);
        return { groupKey: key, workGroupId, projectGroupCode: d === "—" ? "" : d, constructionTypeCode: l === "—" ? "" : l, hangMuc: h === "—" ? "" : h };
      }
      const content = key.slice(2);
      const i1 = content.indexOf("|"); const i2 = content.indexOf("|", i1 + 1);
      const d = content.slice(0, i1); const l = content.slice(i1 + 1, i2); const h = content.slice(i2 + 1);
      return { groupKey: key, workGroupId, projectGroupCode: d === "—" ? "" : d, constructionTypeCode: l === "—" ? "" : l, hangMuc: h === "—" ? "" : h };
    }

    // Tách cols thành: trước batDau | batDau | ketThuc | sau ketThuc
    const batDauIdx = cols.findIndex((c) => c.key === "batDau");
    const ketThucIdx = cols.findIndex((c) => c.key === "ketThuc");
    // +1 cho cột __sel__ (checkbox) vốn là <td> riêng trong data rows
    const labelColSpan = (canManage ? 1 : 0) + (batDauIdx >= 0 ? batDauIdx : cols.length);
    const colsAfterKetThuc = ketThucIdx >= 0 ? cols.slice(ketThucIdx + 1) : [];

    const labelCell = (
      <td
        key="__label__"
        colSpan={labelColSpan}
        className="p-0 overflow-hidden"
      >
        <div className={cn("sticky left-0 z-[11] inline-flex max-w-[calc(100vw-1rem)] items-center gap-2 px-2 py-1.5", bg)}>
          {canManage ? (
            <input
              type="checkbox"
              className="size-3.5 shrink-0 accent-slate-700"
              checked={allSel}
              onChange={() => {
                setSelected((s) => {
                  const n = new Set(s);
                  if (allSel) groupTasks.forEach((t) => n.delete(t.id));
                  else groupTasks.forEach((t) => n.add(t.id));
                  return n;
                });
              }}
            />
          ) : null}
          {indent ? <div style={{ width: indent }} className="shrink-0" /> : null}
          <button
            type="button"
            onClick={() => toggleTreeNode(key)}
            className={cn("flex items-center gap-1.5", textCls)}
          >
            <Chevron className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            <span className="whitespace-nowrap">{label}</span>
            <span className="whitespace-nowrap font-normal text-slate-400 dark:text-slate-500 text-xs">
              {type === "g1"
                ? `(${count} loại hình)`
                : type === "g2"
                  ? `(${count} hạng mục)`
                  : `(${count} việc)`}
            </span>
          </button>
          {canManage && type === "g3" ? (
            <>
              <button type="button" title="Thêm công việc vào hạng mục này" onClick={() => setInsertCtx(parseInsertCtx())}
                className="ml-1 grid size-5 shrink-0 place-items-center rounded text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200">
                <Plus className="size-3.5" />
              </button>
              {(() => {
                const ctx = parseInsertCtx();
                const ids = projects
                  .filter((p) => p.groupCode === ctx.projectGroupCode && p.constructionTypeCode === ctx.constructionTypeCode && p.name === label)
                  .map((p) => p.id);
                if (!ids.length) return null;
                return (
                  <button type="button" title="Sửa tên hạng mục" onClick={() => setRenameHangMuc({ ids, name: label })}
                    className="grid size-5 shrink-0 place-items-center rounded text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200">
                    <Pencil className="size-3.5" />
                  </button>
                );
              })()}
            </>
          ) : canManage && type === "g2" ? (
            <button type="button" title="Thêm hạng mục vào loại hình này"
              onClick={() => {
                const content = key.slice(2); const i1 = content.indexOf("|");
                const dk = content.slice(0, i1); const lk = content.slice(i1 + 1);
                const proj = projects.find((p) => p.groupCode === (dk === "—" ? "" : dk));
                const ctProj = projects.find((p) => p.groupCode === (dk === "—" ? "" : dk) && p.constructionTypeCode === (lk === "—" ? "" : lk));
                setAddHangMucCtx({ groupId: proj?.groupId ?? "", groupCode: dk === "—" ? "" : dk, constructionTypeId: ctProj?.constructionTypeId || null, constructionTypeCode: lk === "—" ? null : lk, lockCt: true });
                setAddHmName(""); setAddHmCtId(ctProj?.constructionTypeId ?? "");
              }}
              className="ml-1 grid size-5 shrink-0 place-items-center rounded text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200">
              <Plus className="size-3.5" />
            </button>
          ) : canManage && type === "g1" ? (
            <button type="button" title="Thêm hạng mục vào dự án này"
              onClick={() => {
                const dk = key.slice(2);
                const proj = projects.find((p) => p.groupCode === (dk === "—" ? "" : dk));
                setAddHangMucCtx({ groupId: proj?.groupId ?? "", groupCode: dk === "—" ? "" : dk, constructionTypeId: null, constructionTypeCode: null, lockCt: false });
                setAddHmName(""); setAddHmCtId("");
              }}
              className="ml-1 grid size-5 shrink-0 place-items-center rounded text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200">
              <Plus className="size-3.5" />
            </button>
          ) : null}
        </div>
      </td>
    );

    return (
      <tr key={`tree-${key}`} className={cn(bg, borderCls)}>
        {labelCell}
        {/* Ngày dự án đặt trong <td> thực của cột Bắt đầu / Kết thúc → luôn thẳng cột */}
        {batDauIdx >= 0 && (
          <td className="px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {projDates?.startDate ? fmtDate(projDates.startDate) : null}
          </td>
        )}
        {ketThucIdx >= 0 && (
          <td className="px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap" title={projDates?.packagingDate ? "Đóng gói" : undefined}>
            {projDates?.packagingDate ? fmtDate(projDates.packagingDate) : null}
          </td>
        )}
        {colsAfterKetThuc.map((c) => <td key={c.key} />)}
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
          overdue ? "border-red-400 dark:border-red-600 ring-1 ring-red-200 dark:ring-red-800" : "",
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">{t.sumId ?? "—"}</span>
          <span className={cn("text-[11px] font-medium whitespace-nowrap", t.priority === "CAO" ? "text-red-600 dark:text-red-400" : t.priority === "TRUNG_BINH" ? "text-amber-500" : "text-slate-400 dark:text-slate-500")}>{PRIORITY_LABEL[t.priority]}</span>
        </div>
        <div className="mt-1 font-medium leading-snug">{t.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1">{t.workGroupName}</span>
          {t.assigneeNames.length ? (
            <span>· {t.assigneeNames.join(", ")}</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">· chưa giao</span>
          )}
        </div>
        <div
          className={cn("mt-1 text-[11px]", overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}
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
          <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800">
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

  const activeFilterCount = activeCols.length;
  const openCol = openFilter ? cols.find((c) => c.key === openFilter.key) : null;

  return (
    <div className="space-y-4 pb-[5px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length} / {tasks.length} công việc
          {activeFilterCount > 0 ? (
            <span className="text-slate-400 dark:text-slate-500"> · đang lọc {activeFilterCount} điều kiện</span>
          ) : null}
        </p>
        {canAssign ? (
          <Button
            onClick={() => {
              // Chọn đúng 1 việc → điền sẵn dòng đầu như "Thêm tương tự"; không chọn gì → mở trống.
              const t = selected.size === 1 ? tasks.find((x) => selected.has(x.id)) : undefined;
              setAssignModal(t ?? true);
            }}
          >
            <Plus className="size-4" /> Giao việc
          </Button>
        ) : null}
      </div>

      {/* Lát cắt thời gian */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border">
          {(["week", "month", "quarter", "year", "all"] as const).map((p, i) => {
            const LABEL: Record<string, string> = { week: "Tuần", month: "Tháng", quarter: "Quý", year: "Năm", all: "Tất cả" };
            return (
              <button key={p} type="button" onClick={() => handlePeriodType(p)}
                className={cn("px-3 py-1.5 text-xs font-medium transition-colors", i > 0 && "border-l",
                  timePeriod === p ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted")}
              >{LABEL[p]}</button>
            );
          })}
        </div>
        {periodBounds && (
          <>
            <div className="flex items-center gap-1">
              <button type="button" onClick={handlePeriodPrev} className="grid h-7 w-7 place-items-center rounded-md border bg-background hover:bg-muted"><ChevronLeft className="size-3.5" /></button>
              <span className="min-w-[180px] text-center text-xs font-semibold">{periodBounds.label}</span>
              <button type="button" onClick={handlePeriodNext} className="grid h-7 w-7 place-items-center rounded-md border bg-background hover:bg-muted"><ChevronRight className="size-3.5" /></button>
            </div>
            {timePeriod === "week" && <span className="text-xs text-muted-foreground">T2–T7 · <span className="font-medium">{base.length}</span>/{tasks.length} việc</span>}
          </>
        )}
      </div>

      {/* Dải KPI cảnh báo — bấm để lọc nhanh */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(
          [
            { key: "DANG_LAM",   label: "Đang làm",              n: kpi.doing,               Icon: Activity,     tone: "border-blue-200 dark:border-blue-800   bg-blue-50 dark:bg-blue-950   text-blue-700 dark:text-blue-300",   activeTone: "border-blue-400 dark:border-blue-600   bg-blue-200 dark:bg-blue-800   text-black dark:text-white",   ring: "ring-blue-400 dark:ring-blue-600" },
            { key: "HOAN_THANH", label: "Hoàn thành",            n: kpi.done,                Icon: CheckCircle2, tone: "border-green-200 dark:border-green-800  bg-green-50 dark:bg-green-950  text-green-700 dark:text-green-300",  activeTone: "border-green-400 dark:border-green-600  bg-green-200 dark:bg-green-800  text-black dark:text-white",  ring: "ring-green-400 dark:ring-green-600" },
            { key: "SAP_HAN",    label: "Sắp đến hạn (≤3 ngày)", n: kpi.soon,               Icon: Clock,        tone: "border-amber-200 dark:border-amber-800  bg-amber-50 dark:bg-amber-950  text-amber-700 dark:text-amber-300",  activeTone: "border-amber-400 dark:border-amber-600  bg-amber-200 dark:bg-amber-800  text-black dark:text-white",  ring: "ring-amber-400 dark:ring-amber-600" },
            { key: "QUA_HAN",    label: "Quá hạn",               n: kpi.overdue,             Icon: AlertTriangle, tone: "border-red-200 dark:border-red-800   bg-red-50 dark:bg-red-950    text-red-700 dark:text-red-300",    activeTone: "border-red-400 dark:border-red-600    bg-red-200 dark:bg-red-800    text-black dark:text-white",    ring: "ring-red-400 dark:ring-red-600" },
            { key: "CHUA_GIAO",  label: "Chưa giao/Chưa duyệt", n: kpi.unassignedOrPending, Icon: UserX,        tone: "border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300", activeTone: "border-violet-400 dark:border-violet-600 bg-violet-200 dark:bg-violet-800 text-black dark:text-white", ring: "ring-violet-400 dark:ring-violet-600" },
          ] as const
        ).map(({ key, label, n, Icon, tone, activeTone, ring }) => (
          <button
            key={key}
            type="button"
            onClick={() => setQuick((q) => (q === key ? "" : key))}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left outline-none transition",
              quick === key ? [activeTone, "ring-2 ring-offset-1", ring] : [tone, "hover:brightness-95"],
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
          placeholder="Tìm theo tên, mã, dự án, loại hình, hạng mục, khối/hệ thống, người thực hiện..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && search) setSearch("");
          }}
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

      {/* Chip "Lọc:" nhanh — mặc định theo QUICK_FILTERS + chip người dùng tự thêm (nhớ theo trình duyệt) */}
      {activeWg ? (
        <div className="flex flex-wrap items-center gap-1.5 py-1.5">
          <span className="text-xs text-muted-foreground">Lọc:</span>
          <button
            type="button"
            onClick={() => setActiveL1("")}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium outline-none transition-colors",
              !activeL1
                ? "bg-primary text-primary-foreground ring-2 ring-slate-800 ring-offset-1"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Tất cả
          </button>
          {(QUICK_FILTERS[activeWgAbbr ?? ""] ?? [])
            .filter((l1) => !(hiddenQuickFilters[activeWgAbbr ?? ""] ?? []).includes(l1))
            .map((l1) => (
              <span
                key={l1}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  activeL1 === l1
                    ? "bg-primary text-primary-foreground ring-2 ring-slate-800 ring-offset-1"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                <button type="button" className="outline-none" onClick={() => setActiveL1(activeL1 === l1 ? "" : l1)}>
                  {l1}
                </button>
                {removingChip ? (
                  <button
                    type="button"
                    title="Xóa chip lọc này"
                    onClick={() => {
                      const key = activeWgAbbr ?? "";
                      setHiddenQuickFilters((prev) => {
                        const cur = prev[key] ?? [];
                        return cur.includes(l1) ? prev : { ...prev, [key]: [...cur, l1] };
                      });
                      if (activeL1 === l1) setActiveL1("");
                    }}
                    className="opacity-60 hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            ))}
          {(extraQuickFilters[activeWgAbbr ?? ""] ?? []).map((l1) => (
            <span
              key={l1}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                activeL1 === l1
                  ? "bg-primary text-primary-foreground ring-2 ring-slate-800 ring-offset-1"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              <button type="button" className="outline-none" onClick={() => setActiveL1(activeL1 === l1 ? "" : l1)}>
                {l1}
              </button>
              {removingChip ? (
                <button
                  type="button"
                  title="Xóa chip lọc này"
                  onClick={() => {
                    const key = activeWgAbbr ?? "";
                    setExtraQuickFilters((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((x) => x !== l1) }));
                    if (activeL1 === l1) setActiveL1("");
                  }}
                  className="opacity-60 hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
          {addingChip ? (
            <input
              autoFocus
              value={newChipText}
              onChange={(e) => setNewChipText(e.target.value)}
              onBlur={() => { setAddingChip(false); setNewChipText(""); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.stopPropagation(); setAddingChip(false); setNewChipText(""); }
                if (e.key === "Enter") {
                  const v = newChipText.trim();
                  const key = activeWgAbbr ?? "";
                  if (v && key) {
                    setExtraQuickFilters((prev) => {
                      const cur = prev[key] ?? [];
                      return cur.includes(v) ? prev : { ...prev, [key]: [...cur, v] };
                    });
                  }
                  setAddingChip(false);
                  setNewChipText("");
                }
              }}
              placeholder="Từ khóa mới…"
              className="h-5 w-28 rounded-full border border-input bg-background px-2.5 text-xs outline-none focus:border-slate-400 dark:focus:border-slate-500"
            />
          ) : (
            <button
              type="button"
              title="Thêm chip lọc cho nhóm này"
              onClick={() => setAddingChip(true)}
              className="grid size-5 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
            >
              <Plus className="size-3" />
            </button>
          )}
          <button
            type="button"
            title={removingChip ? "Xong, ẩn nút xóa" : "Bật chế độ xóa chip lọc"}
            onClick={() => setRemovingChip((v) => !v)}
            className={cn(
              "grid size-5 place-items-center rounded-full",
              removingChip ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            <X className="size-3" />
          </button>
        </div>
      ) : null}

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

      {/* Thanh chip điều kiện đang lọc (tab nhóm không hiện chip — tab đã tự highlight) */}
      {activeCols.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 dark:text-slate-500">
            <Filter className="size-3.5" /> Lọc:
          </span>
          {activeCols.map((c) => (
            <Chip key={c.key} label={c.label} value={chipText(c, colFilters[c.key])} onRemove={() => clearCol(c.key)} />
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-600 dark:text-red-400"
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
              { key: "people", label: "Người" },
              { key: "table", label: "Dự án" },
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
        {(viewMode === "people" || viewMode === "table") ? (
          <div className="inline-flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={viewMode === "people" ? collapseAllGroups : collapseOneLevel}
              title={viewMode === "table" ? "Thu từng cấp: Hạng mục → Loại hình → Dự án" : "Thu gọn tất cả nhóm"}
            >
              <ChevronsDownUp className="size-4" /> Collapse
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={viewMode === "people" ? expandAllGroups : expandOneLevel}
              disabled={viewMode === "people" ? effectiveCollapsed.size === 0 : effectiveTreeCollapsed.size === 0}
              title={viewMode === "table" ? "Xổ từng cấp: Dự án → Loại hình → Hạng mục" : "Mở rộng tất cả nhóm"}
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
            style={{ width: "100%", minWidth: totalMinW, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 }}
          >
            <colgroup>
              {canManage ? <col style={{ width: MANAGE_SEL_PX }} /> : null}
              {cols.map((c) => (
                <col key={c.key} style={c.key === "ketQua" ? undefined : { width: widthOf(c.key) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {canManage ? (
                  <th
                    style={headStyle("__sel__", MANAGE_SEL_PX)}
                    className="border-b border-slate-200 dark:border-slate-700 px-2 py-2.5"
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
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:border-slate-100 dark:border-slate-800">
              {viewMode === "people"
                ? groups.flatMap((g) =>
                    effectiveCollapsed.has(g.key)
                      ? [groupHeaderRow(g)]
                      : [groupHeaderRow(g), ...g.tasks.map((t) => renderRow(t, { keyExtra: `${g.key}-` }))],
                  )
                : viewMode === "table"
                  ? treeNodes.map((n) =>
                      n.type === "task"
                        ? renderRow(n.task)
                        : n.type === "insert"
                          ? (
                            <TreeInsertRow
                              key={`insert-${n.ctx.groupKey}`}
                              ctx={n.ctx}
                              canManage={canManage}
                              cols={cols}
                              projects={projects}
                              disciplines={disciplines}
                              phases={phases}
                              users={users}
                              catalog={catalog}
                              onCancel={() => setInsertCtx(null)}
                              onSaved={() => { setInsertCtx(null); router.refresh(); }}
                            />
                          )
                          : treeGroupRow(n),
                    )
                  : sorted.map((t, i) => renderRow(t, { meta: rowMeta[i] }))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={totalColsCount} className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
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
          <Button size="sm" variant="outline" onClick={() => void batchApprove(true)}>
            Duyệt
          </Button>
          <Button size="sm" variant="outline" onClick={() => void batchApprove(false)}>
            Thu hồi duyệt
          </Button>
          {tasks.some((t) => selected.has(t.id) && t.deleteRequestedAt) ? (
            <Button size="sm" variant="outline" className="border-red-300 text-red-700 dark:text-red-300 hover:bg-red-50 dark:bg-red-950" onClick={() => void batchApproveDelete()}>
              Duyệt xóa
            </Button>
          ) : null}
          {tasks.some((t) => selected.has(t.id) && (t.pendingPlannedEnd || t.endChangeRequesterId)) ? (
            <>
              <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => void batchApproveDeadline(true)}>
                Duyệt dời hạn
              </Button>
              <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => void batchApproveDeadline(false)}>
                Từ chối dời hạn
              </Button>
            </>
          ) : null}
          {selected.size === 1 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const t = tasks.find((x) => selected.has(x.id));
                if (t) setAssignModal(t);
              }}
            >
              <Plus className="size-4" /> Thêm tương tự
            </Button>
          ) : null}
          {selected.size === 1 && (() => {
            const t = tasks.find((x) => selected.has(x.id));
            if (!t || t.status !== "HOAN_THANH") return null;
            return (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setUpdateTaskDialog({
                    id: t.id,
                    name: t.name,
                    plannedStart: t.plannedStart,
                    plannedEnd: t.plannedEnd,
                    approverId: t.approverId ?? "",
                    note: "",
                  })
                }
              >
                <History className="size-4" /> Cập nhật công việc
              </Button>
            );
          })()}
          <Button size="sm" variant="destructive" onClick={() => void batchDeleteSelected()}>
            Xóa
          </Button>
          <Button size="icon" variant="ghost" onClick={clearSel} title="Bỏ chọn" aria-label="Bỏ chọn">
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {/* Dialog thêm Hạng mục (từ nút + ở cấp Dự án hoặc Loại hình trong tree view) */}
      {addHangMucCtx ? (
        <Modal
          open
          onClose={() => setAddHangMucCtx(null)}
          title={`Thêm hạng mục — ${addHangMucCtx.groupCode || "Dự án"}`}
          className="max-w-sm"
        >
          <div className="space-y-4">
            {addHangMucCtx.lockCt ? (
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Loại hình</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">{addHangMucCtx.constructionTypeCode || "— Không phân loại —"}</p>
              </div>
            ) : (
              <div>
                <label htmlFor="add-hm-ct" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Loại hình
                </label>
                <Select
                  id="add-hm-ct"
                  value={addHmCtId}
                  onChange={(e) => setAddHmCtId(e.target.value)}
                  className="w-full"
                >
                  <option value="">— Không phân loại —</option>
                  {constructionTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.code} — {ct.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <label htmlFor="add-hm-name" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Tên hạng mục *
              </label>
              <Input
                id="add-hm-name"
                autoFocus
                value={addHmName}
                onChange={(e) => setAddHmName(e.target.value)}
                placeholder="Nhập tên hạng mục..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitAddHangMuc();
                  if (e.key === "Escape") setAddHangMucCtx(null);
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setAddHangMucCtx(null)}>
                Hủy
              </Button>
              <Button onClick={() => void submitAddHangMuc()} disabled={!addHmName.trim() || addHmSaving}>
                {addHmSaving ? "Đang lưu..." : "Thêm hạng mục"}
              </Button>
            </div>
          </div>
        </Modal>
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
            <DateInput value={deadline.date} onChange={(e) => setDeadline({ ...deadline, date: e.target.value })} />
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
      {false && editing && canManage ? (
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
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      {/* Modal chi tiết công việc (click 1 lần vào tên việc) — nội dung + toàn bộ giờ đã ghi. */}
      {detailTask ? (() => {
        const contextLabel = taskContextLabel(detailTask);
        // Gộp mốc "Cập nhật công việc" (làm tiếp việc đã hoàn thành — không có số giờ) với các dòng
        // ghi giờ thật, xếp theo ngày để thấy đúng trình tự: hoàn thành lần trước → cập nhật lại → ghi giờ tiếp.
        const timeline = [
          ...detailTask.completionHistory.map((h, i) => ({
            key: `hist-${i}`,
            date: h.actualEnd || h.plannedEnd || "",
            content: h.note,
            hours: null as number | null,
            person: detailTask.assigneeNames.join(", ") || null,
            isUpdate: true,
            entryId: null as string | null,
            result: null as string | null,
          })),
          ...detailEntries.map((e) => ({
            key: e.id,
            date: e.date,
            content: e.note,
            hours: e.hours as number | null,
            person: e.userName as string | null,
            isUpdate: false,
            entryId: e.id as string | null,
            result: e.result,
          })),
        ].sort((a, b) => a.date.localeCompare(b.date));
        const canEditResult = canManage || detailTask.assigneeIds.includes(currentUserId);
        return (
          <Modal
            open
            onClose={closeDetail}
            title={
              <div className="space-y-0.5">
                {contextLabel ? <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{contextLabel}</div> : null}
                <div className="text-base font-semibold text-slate-800 dark:text-slate-100">{detailTask.name}</div>
              </div>
            }
            className="max-w-2xl"
          >
            <div className="space-y-4">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nội dung công việc</div>
                {detailTask.note ? (
                  <p className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{detailTask.note}</p>
                ) : (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500">Chưa có nội dung mô tả.</p>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Giờ đã ghi (toàn bộ thời gian)</div>
                {detailLoading ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Đang tải…</p>
                ) : timeline.length === 0 ? (
                  <p className="text-sm italic text-slate-400 dark:text-slate-500">Chưa có giờ nào được ghi.</p>
                ) : (
                  <div className="max-h-80 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Ngày</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Nội dung công việc</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Số giờ</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Người thực hiện</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Kết quả</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {timeline.map((row) => (
                          <tr key={row.key} className={row.isUpdate ? "bg-amber-50 dark:bg-amber-950/60" : undefined}>
                            <td className={cn("px-3 py-2 text-slate-600 dark:text-slate-300", row.isUpdate && "font-bold text-slate-800 dark:text-slate-100")}>{fmtDate(row.date)}</td>
                            <td className={cn("px-3 py-2 text-slate-500 dark:text-slate-400", row.isUpdate && "font-bold text-slate-800 dark:text-slate-100")}>
                              {row.content || <span className="italic text-slate-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className={cn("px-3 py-2 font-medium text-slate-700 dark:text-slate-200", row.isUpdate && "font-bold text-slate-800 dark:text-slate-100")}>
                              {row.hours != null ? `${row.hours}h` : ""}
                            </td>
                            <td className={cn("px-3 py-2 text-slate-600 dark:text-slate-300", row.isUpdate && "font-bold text-slate-800 dark:text-slate-100")}>
                              {row.person || <span className="italic text-slate-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              {row.entryId ? (
                                <EntryResultCell
                                  entryId={row.entryId}
                                  value={row.result}
                                  canEdit={canEditResult}
                                  onSaved={(v) => setDetailEntries((arr) => arr.map((x) => (x.id === row.entryId ? { ...x, result: v } : x)))}
                                />
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                          <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Tổng</td>
                          <td className="px-3 py-2 text-sm font-bold text-blue-600 dark:text-blue-400">
                            {detailEntries.reduce((s, e) => s + e.hours, 0)}h
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        );
      })() : null}

      {/* Sửa tên Hạng mục (g3) — đổi Project.name cho mọi Khối/Hệ thống cùng hạng mục. */}
      {renameHangMuc ? (
        <RenameHangMucModal
          ids={renameHangMuc.ids}
          currentName={renameHangMuc.name}
          onClose={() => setRenameHangMuc(null)}
          onSaved={() => {
            setRenameHangMuc(null);
            router.refresh();
          }}
        />
      ) : null}

      {/* "Giao việc" → lưới nhập (1 hoặc nhiều việc) trong modal gần kín màn hình.
          assignModal === true: mở trống. assignModal là TaskRow: "Thêm tương tự" — điền sẵn dòng đầu. */}
      {assignModal && canAssign ? (
        <Modal open onClose={() => setAssignModal(false)} title="Giao việc" className="max-w-[96vw]">
          <AssignClient
            embedded
            workGroups={workGroups}
            disciplines={disciplines}
            phases={phases}
            projects={projects}
            users={users}
            catalog={catalog}
            defaultWorkGroupId={assignModal !== true ? assignModal.workGroupId : undefined}
            prefillRow={
              assignModal !== true
                ? {
                    projectId: assignModal.projectId ?? "",
                    level2: assignModal.level2 ?? "",
                    level3: assignModal.level3 ?? "",
                    level5: assignModal.level5 ?? assignModal.name,
                    disciplineId: assignModal.disciplineId ?? "",
                    phaseId: assignModal.phaseId ?? "",
                    priority: assignModal.priority || "TRUNG_BINH",
                    plannedStart: assignModal.plannedStart ?? "",
                    plannedEnd: assignModal.plannedEnd ?? "",
                  }
                : undefined
            }
            onSaved={() => {
              setAssignModal(false);
              router.refresh();
            }}
          />
        </Modal>
      ) : null}

      {/* Modal: "Cập nhật công việc" — làm tiếp việc đã hoàn thành, gửi quản lý duyệt lại */}
      {updateTaskDialog ? (
        <Modal
          open
          onClose={() => setUpdateTaskDialog(null)}
          title={`Cập nhật công việc — ${updateTaskDialog.name}`}
          className="max-w-sm"
        >
          <div className="space-y-3">
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 rounded px-3 py-2">
              Việc sẽ quay về "Chưa thực hiện" và chờ người duyệt xác nhận lại. Người được giao vẫn ghi giờ được ngay.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Ngày bắt đầu mới</label>
              <DateInput
                value={updateTaskDialog.plannedStart}
                onChange={(e) => setUpdateTaskDialog({ ...updateTaskDialog, plannedStart: e.target.value })}
                className="h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-sm shadow-none outline-none focus-visible:ring-0 focus:border-slate-400 dark:focus:border-slate-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Ngày kết thúc mới</label>
              <DateInput
                value={updateTaskDialog.plannedEnd}
                onChange={(e) => setUpdateTaskDialog({ ...updateTaskDialog, plannedEnd: e.target.value })}
                className="h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-sm shadow-none outline-none focus-visible:ring-0 focus:border-slate-400 dark:focus:border-slate-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Người duyệt</label>
              <select
                value={updateTaskDialog.approverId}
                onChange={(e) => setUpdateTaskDialog({ ...updateTaskDialog, approverId: e.target.value })}
                className="h-9 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-sm outline-none focus:border-slate-400 dark:focus:border-slate-500"
              >
                <option value="">— Chọn người duyệt —</option>
                {approvers.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              placeholder="Lý do cập nhật (tùy chọn)…"
              value={updateTaskDialog.note}
              onChange={(e) => setUpdateTaskDialog({ ...updateTaskDialog, note: e.target.value })}
              className="w-full resize-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm outline-none focus:border-slate-400 dark:focus:border-slate-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUpdateTaskDialog(null)}
                className="rounded-md border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={updateTaskPending || !updateTaskDialog.plannedStart || !updateTaskDialog.plannedEnd || !updateTaskDialog.approverId}
                onClick={runUpdateTaskRequest}
                className="rounded-md bg-slate-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-600"
              >
                {updateTaskPending ? "Đang gửi…" : "Gửi yêu cầu"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function InlineTaskEditRow({
  task,
  canManage,
  cols,
  projects,
  disciplines,
  phases,
  users,
  catalog,
  onCancel,
  onSaved,
}: {
  task: TaskRow;
  canManage: boolean;
  cols: ColDef[];
  projects: ProjectOpt[];
  disciplines: DisciplineOpt[];
  phases: Opt[];
  users: { id: string; fullName: string }[];
  catalog: Catalog;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [pgCode, setPgCode] = React.useState(task.groupCode ?? "");
  const [ctCode, setCtCode] = React.useState(task.loaiHinhCode ?? task.level2 ?? "");
  const [hangMuc, setHangMuc] = React.useState(task.level3 ?? "");
  const [level5, setLevel5] = React.useState(task.level5 ?? task.name ?? "");
  const [disciplineId, setDisciplineId] = React.useState(task.disciplineId ?? "");
  const [phaseId, setPhaseId] = React.useState(task.phaseId ?? "");
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>(task.assigneeIds);
  const [priority, setPriority] = React.useState(task.priority);
  const [status, setStatus] = React.useState(task.status);
  const [plannedStart, setPlannedStart] = React.useState(task.plannedStart);
  const [plannedEnd, setPlannedEnd] = React.useState(task.plannedEnd);
  const [blockSystem, setBlockSystem] = React.useState(task.blockSystem ?? "");
  const taskCatalog = catalog[task.workGroupId] ?? { l1: [], l2: [], l3: [], l5: [], l2ByL1: {}, l3ByL2: {} };
  const isProjectBasedTask = !!task.projectId || (taskCatalog.projectGroups?.length ?? 0) > 0;
  const initialL1 = React.useMemo(() => {
    if (isProjectBasedTask || !task.level2) return "";
    for (const [l1, l2s] of Object.entries(taskCatalog.l2ByL1 ?? {})) {
      if (l2s.includes(task.level2)) return l1;
    }
    return "";
  }, [isProjectBasedTask, task.level2, taskCatalog]);
  const [level1, setLevel1] = React.useState(initialL1);

  const pgCodes = React.useMemo(
    () => [...new Set(projects.map((p) => p.groupCode).filter(Boolean))].sort(),
    [projects],
  );
  const ctCodes = React.useMemo(() => {
    if (!isProjectBasedTask) {
      return level1 && taskCatalog.l2ByL1[level1]?.length ? taskCatalog.l2ByL1[level1] : taskCatalog.l2;
    }
    const pool = pgCode ? projects.filter((p) => p.groupCode === pgCode) : projects;
    return [...new Set(pool.map((p) => p.constructionTypeCode).filter(Boolean))];
  }, [isProjectBasedTask, level1, taskCatalog, projects, pgCode]);
  const hangMucOpts = React.useMemo(() => {
    if (!isProjectBasedTask) {
      return ctCode && taskCatalog.l3ByL2[ctCode]?.length ? taskCatalog.l3ByL2[ctCode] : taskCatalog.l3;
    }
    const pool = pgCode ? projects.filter((p) => p.groupCode === pgCode) : projects;
    return [...new Set(pool.filter((p) => !ctCode || p.constructionTypeCode === ctCode).map((p) => p.name))];
  }, [isProjectBasedTask, taskCatalog, projects, pgCode, ctCode]);
  const level5Opts = React.useMemo(() => taskCatalog.l5 ?? [], [taskCatalog]);
  const blockSystemOpts = React.useMemo(() => {
    if (!isProjectBasedTask) return [];
    const pool = projects.filter((p) =>
      (!pgCode || p.groupCode === pgCode) &&
      (!ctCode || p.constructionTypeCode === ctCode) &&
      (!hangMuc || p.name === hangMuc)
    );
    return [...new Set(pool.map((p) => p.blockSystem).filter(Boolean))] as string[];
  }, [isProjectBasedTask, projects, pgCode, ctCode, hangMuc]);
  const projectId = React.useMemo(() => {
    if (!isProjectBasedTask) return "";
    if (!pgCode || !ctCode || !hangMuc) return "";
    return (
      projects.find((p) =>
        p.groupCode === pgCode &&
        p.constructionTypeCode === ctCode &&
        p.name === hangMuc &&
        (!blockSystem || p.blockSystem === blockSystem)
      )?.id ?? ""
    );
  }, [isProjectBasedTask, projects, pgCode, ctCode, hangMuc, blockSystem]);

  async function save() {
    setPending(true);
    const res = await saveTask({
      id: task.id,
      workGroupId: task.workGroupId,
      projectId: projectId || null,
      projectGroupCode: isProjectBasedTask ? pgCode || null : null,
      blockSystem: isProjectBasedTask ? blockSystem.trim() || null : null,
      disciplineId: disciplineId || null,
      phaseId: phaseId || null,
      sumId: task.sumId ?? null,
      level1: isProjectBasedTask ? null : level1 || null,
      level2: ctCode || null,
      level3: hangMuc || null,
      level5: level5.trim() || null,
      name: level5.trim() || null,
      priority,
      status,
      plannedStart: plannedStart || null,
      plannedEnd: plannedEnd || null,
      note: task.note || null,
      measureNorm: false,
      assigneeIds,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Da cap nhat");
      onSaved();
    } else {
      toast.error(res.error);
    }
  }

  const cellCls = "bg-amber-50 dark:bg-amber-950/50 px-2 py-2 align-top";
  const inputCls = "h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400 dark:border-blue-600";
  const dateCls = "h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs outline-none focus:border-blue-400 dark:border-blue-600";
  const none = "--";

  return (
    <tr className="bg-amber-50 dark:bg-amber-950/50">
      {canManage ? <td className="bg-amber-50 dark:bg-amber-950/50 px-2 py-2 align-top" /> : null}
      {cols.map((col) => {
        if (col.key === "duAn") {
          return (
            <td key={col.key} className={cellCls}>
              {isProjectBasedTask ? (
                <SearchableCombobox creatable={false} placeholder={none} value={pgCode} options={[none, ...pgCodes]} className="h-8 text-xs" onChange={(v) => { setPgCode(v === none ? "" : v); }} />
              ) : (
                <SearchableCombobox creatable={false} placeholder={none} value={level1} options={[none, ...taskCatalog.l1]} className="h-8 text-xs" onChange={(v) => { const nv = v === none ? "" : v; setLevel1(nv); const linked = nv ? (taskCatalog.l2ByL1[nv] ?? []) : []; if (linked.length > 0 && !linked.includes(ctCode)) { setCtCode(""); setHangMuc(""); } }} />
              )}
            </td>
          );
        }
        if (col.key === "loaiHinh") {
          return (
            <td key={col.key} className={cellCls}>
              <SearchableCombobox creatable placeholder={none} value={ctCode} options={[none, ...ctCodes]} className="h-8 text-xs" onChange={(v) => { setCtCode(v === none ? "" : v); }} />
            </td>
          );
        }
        if (col.key === "hangMuc") {
          return (
            <td key={col.key} className={cellCls}>
              <SearchableCombobox creatable placeholder="Chon / nhap moi..." value={hangMuc} options={hangMucOpts} className="h-8 text-xs" onChange={setHangMuc} />
            </td>
          );
        }
        if (col.key === "congViec") {
          return (
            <td key={col.key} className={cellCls}>
              {isProjectBasedTask ? (
                <SearchableCombobox
                  creatable
                  placeholder="Khối/Hệ thống..."
                  value={blockSystem}
                  options={blockSystemOpts}
                  className="h-8 text-xs"
                  onChange={setBlockSystem}
                />
              ) : null}
              <SearchableCombobox
                creatable
                placeholder="Nhập hoặc chọn đầu việc..."
                value={level5}
                options={level5Opts}
                className={`h-8 text-xs${isProjectBasedTask ? " mt-1" : ""}`}
                onChange={setLevel5}
              />
            </td>
          );
        }
        if (col.key === "giaiDoan") {
          return (
            <td key={col.key} className={cellCls}>
              <Select className="h-8 w-full text-xs" value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                <option value="">{none}</option>
                {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <div className="mt-1 flex items-center gap-1">
                <Button size="sm" onClick={() => void save()} disabled={pending}>{pending ? "..." : "Lưu"}</Button>
                <Button size="sm" variant="outline" onClick={onCancel}>Hủy</Button>
              </div>
            </td>
          );
        }
        if (col.key === "boMon") {
          return (
            <td key={col.key} className={cellCls}>
              <SearchableCombobox
                creatable={false}
                placeholder={none}
                value={disciplines.find((d) => d.id === disciplineId)?.code ?? disciplines.find((d) => d.id === disciplineId)?.name ?? ""}
                options={[none, ...disciplines.map((d) => d.code ?? d.name)]}
                className="h-8 text-xs"
                onChange={(label) => setDisciplineId(label === none ? "" : (disciplines.find((d) => (d.code ?? d.name) === label)?.id ?? ""))}
              />
            </td>
          );
        }
        if (col.key === "thucHien") {
          return <td key={col.key} className={cellCls}><UserMultiSelect users={users} value={assigneeIds} onChange={setAssigneeIds} /></td>;
        }
        if (col.key === "uuTien") {
          return (
            <td key={col.key} className={cellCls}>
              <Select className="h-8 w-full text-xs" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            </td>
          );
        }
        if (col.key === "tinhTrang") {
          return (
            <td key={col.key} className={cellCls}>
              <Select className="h-8 w-full text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
                {TASK_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
              </Select>
            </td>
          );
        }
        if (col.key === "batDau") {
          return <td key={col.key} className={cellCls}><DateInput className={dateCls} value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} /></td>;
        }
        if (col.key === "ketThuc") {
          return <td key={col.key} className={cellCls}><DateInput className={dateCls} value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} /></td>;
        }
        return <td key={col.key} className={cellCls} />;
      })}
    </tr>
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
      className="z-50 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5"
    >
      {children}
    </div>,
    document.body,
  );
}

function PopHeader({ title, onClear, showClear }: { title: string; onClear: () => void; showClear: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2">
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</span>
      {showClear ? (
        <button type="button" onClick={onClear} className="text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-red-600 dark:text-red-400">
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
        <div className="relative border-b border-slate-100 dark:border-slate-800 p-2">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm…"
            className="h-7 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-7 pr-2 text-xs outline-none focus:border-slate-400 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-900"
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        <span>{sel.length ? `${sel.length} đã chọn` : "Chọn giá trị"}</span>
        {sel.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="hover:text-slate-600 dark:hover:text-slate-300">
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
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded border",
                    on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 dark:border-slate-600",
                  )}
                >
                  {on ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="truncate">{col.labelMap ? (col.labelMap[o] ?? o) : o}</span>
              </button>
            </li>
          );
        })}
        {opts.length === 0 ? <li className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Không có kết quả</li> : null}
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
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded border",
            on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 dark:border-slate-600",
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
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Trạng thái</p>
      {item("status", "QUA_HAN", "Quá hạn", "bg-red-500")}
      {item("status", "DANG_LAM", "Đang thực hiện", "bg-blue-500")}
      {item("status", "CHUA_LAM", "Chưa thực hiện", "bg-slate-400 dark:bg-slate-500")}
      {item("status", "TAM_DUNG", "Tạm dừng", "bg-amber-500")}
      {item("status", "HOAN_THANH", "Hoàn thành", "bg-emerald-500")}
      <button
        type="button"
        onClick={() => onChange({ ...v, tre: !v.tre })}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded border",
            v.tre ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 dark:border-slate-600",
          )}
        >
          {v.tre ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        <span className="size-2 shrink-0 rounded-full bg-rose-500" />
        <span className="truncate">Hoàn thành (trễ hạn)</span>
      </button>
    </div>
  );
}

function TextBody({ col, value, onChange }: { col: ColDef; value: string; onChange: (v: string) => void }) {
  return (
    <div className="p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          autoFocus
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Lọc theo ${col.label.toLowerCase()}…`}
          className="h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-7 pr-2 text-[13px] outline-none focus:border-slate-400 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-900"
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
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          <span
            className={cn("grid size-3.5 place-items-center rounded-full border", !value ? "border-slate-800" : "border-slate-300 dark:border-slate-600")}
          >
            {!value ? <span className="size-1.5 rounded-full bg-slate-800" /> : null}
          </span>
          <span className="text-slate-500 dark:text-slate-400">Tất cả</span>
        </button>
      </li>
      {(DATE_PRESETS[col.key] ?? []).map(([val, label]) => {
        const on = value === val;
        return (
          <li key={val}>
            <button
              type="button"
              onClick={() => onChange(val)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <span
                className={cn("grid size-3.5 place-items-center rounded-full border", on ? "border-slate-800" : "border-slate-300 dark:border-slate-600")}
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 pl-2.5 pr-1 text-xs shadow-sm">
      <span className="text-slate-400 dark:text-slate-500">{label}:</span>
      <span className="font-medium text-slate-700 dark:text-slate-200">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-4 place-items-center rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
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
  disciplines: DisciplineOpt[];
  phases: Opt[];
  projects: ProjectOpt[];
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

function RenameHangMucModal({
  ids,
  currentName,
  onClose,
  onSaved,
}: {
  ids: string[];
  currentName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(currentName);
  const [pending, setPending] = React.useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Nhập tên hạng mục"); return; }
    setPending(true);
    const res = await batchUpdateCatalogProjects(ids, { name: trimmed });
    setPending(false);
    if (res.ok) {
      toast.success("Đã đổi tên hạng mục");
      onSaved();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Modal open onClose={onClose} title="Sửa tên hạng mục" className="max-w-md">
      <div className="space-y-3">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-amber-500">
          Sẽ đổi tên hạng mục cho tất cả {ids.length} dòng Khối/Hệ thống thuộc hạng mục này.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={pending} onClick={() => void save()}>{pending ? "Đang lưu..." : "Lưu"}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Modal insert dòng mới từ tree group (Bảng view) ----
// Dòng insert inline trong tree table — render như <tr> sticky (không phải modal)
function TreeInsertRow({
  ctx,
  totalCols = 0,
  canManage,
  cols,
  projects,
  disciplines,
  phases,
  users,
  catalog,
  onCancel,
  onSaved,
}: {
  ctx: { groupKey: string; workGroupId: string; projectGroupCode: string; constructionTypeCode: string; hangMuc: string };
  totalCols?: number;
  canManage: boolean;
  cols: ColDef[];
  projects: ProjectOpt[];
  disciplines: DisciplineOpt[];
  phases: Opt[];
  users: { id: string; fullName: string }[];
  catalog: Catalog;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const NONE = "— Không —";
  const [pending, setPending] = React.useState(false);
  const [pgCode, setPgCode] = React.useState(ctx.projectGroupCode);
  const [ctCode, setCtCode] = React.useState(ctx.constructionTypeCode);
  const [hangMuc, setHangMuc] = React.useState(ctx.hangMuc);
  const [level5, setLevel5] = React.useState("");
  const [disciplineId, setDisciplineId] = React.useState("");
  const [phaseId, setPhaseId] = React.useState("");
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([]);
  const [priority, setPriority] = React.useState("TRUNG_BINH");
  const [plannedStart, setPlannedStart] = React.useState("");
  const [plannedEnd, setPlannedEnd] = React.useState("");

  const pgCodes = React.useMemo(
    () => [...new Set(projects.map((p) => p.groupCode).filter(Boolean))].sort(),
    [projects],
  );
  const ctCodes = React.useMemo(() => {
    const pool = pgCode ? projects.filter((p) => p.groupCode === pgCode) : projects;
    return [...new Set(pool.map((p) => p.constructionTypeCode).filter(Boolean))];
  }, [projects, pgCode]);
  const hangMucOpts = React.useMemo(() => {
    const pool = pgCode ? projects.filter((p) => p.groupCode === pgCode) : projects;
    return [...new Set(pool.filter((p) => !ctCode || p.constructionTypeCode === ctCode).map((p) => p.name))];
  }, [projects, pgCode, ctCode]);
  const level5Opts = React.useMemo(() => catalog[ctx.workGroupId]?.l5 ?? [], [catalog, ctx.workGroupId]);

  const resolvedProjectId = React.useMemo(() => {
    if (!pgCode || !ctCode || !hangMuc) return "";
    return projects.find((p) => p.groupCode === pgCode && p.constructionTypeCode === ctCode && p.name === hangMuc)?.id ?? "";
  }, [projects, pgCode, ctCode, hangMuc]);

  async function save() {
    if (!ctx.workGroupId) { toast.error("Thiếu nhóm công việc"); return; }
    setPending(true);
    const res = await saveTask({
      workGroupId: ctx.workGroupId,
      projectId: resolvedProjectId || null,
      projectGroupCode: pgCode || null,
      disciplineId: disciplineId || null, phaseId: phaseId || null, sumId: null,
      level2: ctCode || null,
      level3: hangMuc || null,
      level5: level5.trim() || null,
      name: level5.trim() || null,
      priority, status: "CHUA_LAM",
      plannedStart: plannedStart || null,
      plannedEnd: plannedEnd || null,
      note: null, measureNorm: false, assigneeIds,
    });
    setPending(false);
    if (res.ok) { toast.success("Đã thêm công việc"); onSaved(); }
    else toast.error(res.error);
  }

  const cellCls = "bg-blue-50 dark:bg-blue-950/40 px-2 py-2 align-top";
  const lockedCls =
    "flex h-8 w-full items-center truncate rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 text-xs font-medium text-slate-500 dark:text-slate-400";
  const lockedField = (value: string, placeholder = "") => (
    <div className={lockedCls} title={value || undefined}>
      {value || placeholder}
    </div>
  );
  const dateCls = "h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs outline-none focus:border-blue-400 dark:border-blue-600";

  return (
    <tr className="bg-blue-50 dark:bg-blue-950/40">
      {canManage ? <td className="bg-blue-50 dark:bg-blue-950/40 px-2 py-2 align-top" /> : null}
      {cols.map((col) => {
        if (col.key === "duAn") {
          return (
            <td key={col.key} className={cellCls}>
              {ctx.projectGroupCode ? (
                lockedField(pgCode)
              ) : (
                <SearchableCombobox
                  creatable={false}
                  placeholder={NONE}
                  value={pgCode}
                  options={[NONE, ...pgCodes]}
                  className="h-8 text-xs"
                  onChange={(v) => { setPgCode(v === NONE ? "" : v); if (!ctx.constructionTypeCode) setCtCode(""); if (!ctx.hangMuc) setHangMuc(""); }}
                />
              )}
            </td>
          );
        }
        if (col.key === "loaiHinh") {
          return (
            <td key={col.key} className={cellCls}>
              {ctx.constructionTypeCode ? (
                lockedField(ctCode)
              ) : (
                <SearchableCombobox
                  creatable={false}
                  placeholder={NONE}
                  value={ctCode}
                  options={[NONE, ...ctCodes]}
                  className="h-8 text-xs"
                  onChange={(v) => { setCtCode(v === NONE ? "" : v); setHangMuc(""); }}
                />
              )}
            </td>
          );
        }
        if (col.key === "hangMuc") {
          return (
            <td key={col.key} className={cellCls}>
              {ctx.hangMuc ? (
                lockedField(hangMuc)
              ) : (
                <SearchableCombobox
                  creatable
                  placeholder="Chon / nhap moi..."
                  value={hangMuc}
                  options={hangMucOpts}
                  className="h-8 text-xs"
                  onChange={setHangMuc}
                />
              )}
            </td>
          );
        }
        if (col.key === "congViec") {
          return (
            <td key={col.key} className={cellCls}>
              <input
                autoFocus
                className="h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400 dark:border-blue-600"
                placeholder="Ten dau viec..."
                value={level5}
                list={`level5-${ctx.groupKey}`}
                onChange={(e) => setLevel5(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void save(); }
                  if (e.key === "Escape") onCancel();
                }}
              />
              <datalist id={`level5-${ctx.groupKey}`}>
                {level5Opts.map((name) => <option key={name} value={name} />)}
              </datalist>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Button size="sm" onClick={() => void save()} disabled={pending}>
                  {pending ? "Dang luu..." : "Luu"}
                </Button>
                <Button size="sm" variant="outline" onClick={onCancel}>Huy</Button>
              </div>
            </td>
          );
        }
        if (col.key === "giaiDoan") {
          return (
            <td key={col.key} className={cellCls}>
              <SearchableCombobox
                creatable={false}
                placeholder={NONE}
                value={phases.find((p) => p.id === phaseId)?.name ?? ""}
                options={[NONE, ...phases.map((p) => p.name)]}
                className="h-8 text-xs"
                onChange={(label) => setPhaseId(label === NONE ? "" : (phases.find((p) => p.name === label)?.id ?? ""))}
              />
            </td>
          );
        }
        if (col.key === "boMon") {
          return (
            <td key={col.key} className={cellCls}>
              <SearchableCombobox
                creatable={false}
                placeholder={NONE}
                value={disciplines.find((d) => d.id === disciplineId)?.code ?? disciplines.find((d) => d.id === disciplineId)?.name ?? ""}
                options={[NONE, ...disciplines.map((d) => d.code ?? d.name)]}
                className="h-8 text-xs"
                onChange={(label) => setDisciplineId(label === NONE ? "" : (disciplines.find((d) => (d.code ?? d.name) === label)?.id ?? ""))}
              />
            </td>
          );
        }
        if (col.key === "thucHien") {
          return (
            <td key={col.key} className={cellCls}>
              <UserMultiSelect users={users} value={assigneeIds} onChange={setAssigneeIds} />
            </td>
          );
        }
        if (col.key === "uuTien") {
          return (
            <td key={col.key} className={cellCls}>
              <Select className="h-8 w-full text-xs" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="CAO">Cao</option>
                <option value="TRUNG_BINH">Trung binh</option>
                <option value="THAP">Thap</option>
              </Select>
            </td>
          );
        }
        if (col.key === "batDau") {
          return (
            <td key={col.key} className={cellCls}>
              <DateInput className={dateCls} value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </td>
          );
        }
        if (col.key === "ketThuc") {
          return (
            <td key={col.key} className={cellCls}>
              <DateInput className={dateCls} value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </td>
          );
        }
        return <td key={col.key} className={cellCls} />;
      })}
    </tr>
  );

  return (
    <tr className="bg-blue-50 dark:bg-blue-950/40">
      <td colSpan={totalCols} className="p-0">
        {/* sticky left: form ghim vào cạnh trái khi cuộn ngang, không vỡ layout cột */}
        <div className="sticky left-0 z-[12] inline-flex max-w-[calc(100vw-1rem)] flex-wrap items-end gap-2 border-b border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 px-3 py-2">
          {/* Loại hình */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Loại hình</span>
            <div className="w-28">
              <SearchableCombobox creatable={false} placeholder={NONE} value={ctCode}
                options={[NONE, ...ctCodes]}
                onChange={(v) => { setCtCode(v === NONE ? "" : v); setHangMuc(""); }} />
            </div>
          </div>
          {/* Hạng mục */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Hạng mục</span>
            <div className="w-36">
              <SearchableCombobox creatable placeholder="Chọn / nhập mới..." value={hangMuc}
                options={hangMucOpts} onChange={setHangMuc} />
            </div>
          </div>
          {/* Đầu việc */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Đầu việc</span>
            <div className="w-48">
              <SearchableCombobox
                creatable
                autoFocus
                placeholder="Tên đầu việc..."
                value={level5}
                options={level5Opts}
                onChange={setLevel5}
                onKeyDown={(e) => { if (e.key === "Enter" && level5.trim()) { e.preventDefault(); void save(); } if (e.key === "Escape") onCancel(); }}
              />
            </div>
          </div>
          {/* Bộ môn */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Bộ môn</span>
            <div className="w-36">
              <SearchableCombobox
                creatable={false}
                placeholder={NONE}
                value={disciplines.find((d) => d.id === disciplineId)?.name ?? ""}
                options={[NONE, ...disciplines.map((d) => d.name)]}
                onChange={(label) => setDisciplineId(label === NONE ? "" : (disciplines.find((d) => d.name === label)?.id ?? ""))}
              />
            </div>
          </div>
          {/* Người thực hiện */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Người thực hiện</span>
            <div className="w-52">
              <UserMultiSelect users={users} value={assigneeIds} onChange={setAssigneeIds} />
            </div>
          </div>
          {/* Ưu tiên */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Ưu tiên</span>
            <Select className="h-8 w-28 text-xs" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="CAO">Cao</option>
              <option value="TRUNG_BINH">Trung bình</option>
              <option value="THAP">Thấp</option>
            </Select>
          </div>
          {/* Ngày */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Ngày BĐ</span>
            <DateInput className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs outline-none focus:border-blue-400 dark:border-blue-600"
              value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Ngày KT</span>
            <DateInput className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-xs outline-none focus:border-blue-400 dark:border-blue-600"
              value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
          </div>
          {/* Actions */}
          <div className="flex items-end gap-1.5 pb-0.5">
            <Button size="sm" onClick={() => void save()} disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>Hủy</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
