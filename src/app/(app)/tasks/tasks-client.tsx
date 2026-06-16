"use client";

import dayjs from "dayjs";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronsUpDown,
  Clock,
  Filter,
  Flag,
  Info,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AssignClient, type ProjectOpt } from "@/app/(app)/assign/assign-client";
import { TaskForm } from "@/components/task-form";
import { TimesheetEntryDialog } from "@/components/timesheet-entry-dialog";
import { bulkSaveTimesheetEntry } from "@/server/actions/timesheet";
import { Modal } from "@/components/ui/modal";
import { PRIORITY_LABEL, PRIORITY_OPTIONS, TASK_STATUS_LABEL } from "@/lib/labels";
import { cn, removeVietnameseTones } from "@/lib/utils";
import { completionDateError, effectiveStatus, isCompletedLate } from "@/lib/task-status";
import {
  bulkSetDeadline,
  bulkSetPriority,
  deleteTask,
  saveMyTasks,
  setTaskCompletion,
  setTaskStartApproval,
} from "@/server/actions/tasks";

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
  groupCode: string | null;
  groupName: string | null;
  loaiHinhCode: string | null;
  disciplineId: string | null;
  disciplineCode: string | null;
  disciplineName: string | null;
  phaseId: string | null;
  phaseCode: string | null;
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

const norm = removeVietnameseTones;

// ---------- helpers ngày / trạng thái ----------
function startOfToday(): Date {
  return new Date(new Date().toDateString());
}
const TODAY_ISO = (() => {
  const d = startOfToday();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const THIS_MONTH = TODAY_ISO.slice(0, 7);
function thisMonth(iso: string): boolean {
  return !!iso && iso.slice(0, 7) === THIS_MONTH;
}
function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function isPendingApproval(t: TaskRow): boolean {
  return !!t.approverId && !t.startApproved;
}
function isOverdue(t: TaskRow): boolean {
  if (!t.plannedEnd || t.status === "HOAN_THANH") return false;
  return new Date(t.plannedEnd) < startOfToday();
}
function daysUntil(end: string): number | null {
  if (!end) return null;
  const d = new Date(end);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - startOfToday().getTime()) / 86400000);
}
function isDueSoon(t: TaskRow): boolean {
  if (t.status === "HOAN_THANH") return false;
  const n = daysUntil(t.plannedEnd);
  return n !== null && n >= 0 && n <= 3;
}
// Trạng thái hiển thị/đếm: status thật + lớp phủ "Quá hạn". Dùng CHUNG với /manage.
function effOf(t: TaskRow): string {
  return effectiveStatus({ status: t.status, plannedEnd: t.plannedEnd });
}
function duAnText(t: TaskRow): string {
  return t.groupCode ?? (t.projectName ?? "");
}

// ---------- pill mềm trạng thái (đồng bộ /manage) ----------
const STATUS_SOFT: Record<string, { dot: string; pill: string }> = {
  CHUA_LAM: { dot: "bg-slate-400", pill: "bg-slate-50 text-slate-600 ring-slate-200" },
  DANG_LAM: { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 ring-blue-200" },
  HOAN_THANH: { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  TAM_DUNG: { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  QUA_HAN: { dot: "bg-red-500", pill: "bg-red-50 text-red-700 ring-red-200" },
};

// ---------- cấu hình cột + lọc ----------
type FilterKind = "text" | "multi" | "status" | "date";
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
  | "thucTe";
type ColDef = {
  key: SortKey;
  label: string;
  w: number;
  ident?: boolean; // ghim trái
  leaf?: boolean; // cột Công việc (đậm)
  mono?: boolean;
  action?: boolean; // cột thao tác (không sort/lọc)
  filter?: FilterKind;
  opts?: string[];
  labelMap?: Record<string, string>;
};

function colText(t: TaskRow, key: SortKey): string {
  switch (key) {
    case "sumId":
      return t.sumId ?? "";
    case "duAn":
      return duAnText(t);
    case "loaiHinh":
      return t.loaiHinhCode ?? (t.projectId ? "" : (t.level2 ?? ""));
    case "hangMuc":
      return t.level3 ?? "";
    case "congViec":
      return t.name;
    case "giaiDoan":
      return t.phaseName ?? t.phaseCode ?? "";
    case "boMon":
      return t.disciplineCode ?? "";
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

type StatusFilterVal = { status: string[]; duyet: string[] };
type ColFilterVal = string | string[] | StatusFilterVal | undefined;

function colActive(col: ColDef, v: ColFilterVal): boolean {
  if (v == null) return false;
  if (col.filter === "status") {
    const sv = v as StatusFilterVal;
    return (sv.status?.length ?? 0) > 0 || (sv.duyet?.length ?? 0) > 0;
  }
  if (col.filter === "multi") return Array.isArray(v) && v.length > 0;
  return !!v;
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
      const duyet = isPendingApproval(t) ? "CHO_DUYET" : "DA_DUYET";
      const okD = !sv.duyet?.length || sv.duyet.includes(duyet);
      return okS && okD;
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
const DUYET_LABEL: Record<string, string> = { DA_DUYET: "Đã duyệt", CHO_DUYET: "Chờ duyệt" };
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
    ];
    return parts.length <= 2 ? parts.join(", ") : `${parts.length} mục`;
  }
  const arr = v as string[];
  if (arr.length === 1) return col.labelMap ? (col.labelMap[arr[0]] ?? arr[0]) : arr[0];
  return `${arr.length} mục`;
}

const PRIO_ORDER: Record<string, number> = { CAO: 0, TRUNG_BINH: 1, THAP: 2 };
const STATUS_ORDER: Record<string, number> = {
  QUA_HAN: 0,
  DANG_LAM: 1,
  CHUA_LAM: 2,
  TAM_DUNG: 3,
  HOAN_THANH: 4,
};

// ---------- popover lọc (portal) ----------
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
function MultiBody({
  col,
  value,
  onChange,
}: {
  col: ColDef;
  value: ColFilterVal;
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = React.useState("");
  const sel = (value as string[] | undefined) ?? [];
  const opts = (col.opts ?? []).filter((o) => norm(col.labelMap ? col.labelMap[o] : o).includes(norm(q)));
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
                <span className="truncate">{col.labelMap ? col.labelMap[o] : o}</span>
              </button>
            </li>
          );
        })}
        {opts.length === 0 ? <li className="px-3 py-2 text-xs text-slate-400">Không có kết quả</li> : null}
      </ul>
    </div>
  );
}
function StatusBody({
  value,
  onChange,
}: {
  value: ColFilterVal;
  onChange: (v: StatusFilterVal) => void;
}) {
  const v = (value as StatusFilterVal | undefined) ?? { status: [], duyet: [] };
  const tog = (grp: "status" | "duyet", code: string) => {
    const cur = v[grp] ?? [];
    const next = cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code];
    onChange({ ...v, [grp]: next });
  };
  const renderItem = (grp: "status" | "duyet", code: string, label: string, dot: string) => {
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
      {renderItem("status", "QUA_HAN", "Quá hạn", "bg-red-500")}
      {renderItem("status", "DANG_LAM", "Đang thực hiện", "bg-blue-500")}
      {renderItem("status", "CHUA_LAM", "Chưa làm", "bg-slate-400")}
      {renderItem("status", "TAM_DUNG", "Tạm dừng", "bg-amber-500")}
      {renderItem("status", "HOAN_THANH", "Hoàn thành", "bg-emerald-500")}
    </div>
  );
}
function TextBody({
  col,
  value,
  onChange,
}: {
  col: ColDef;
  value: ColFilterVal;
  onChange: (v: string) => void;
}) {
  return (
    <div className="p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Lọc theo ${col.label.toLowerCase()}…`}
          className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[13px] outline-none focus:border-slate-400 focus:bg-white"
        />
      </div>
    </div>
  );
}
function DateBody({
  col,
  value,
  onChange,
}: {
  col: ColDef;
  value: ColFilterVal;
  onChange: (v: string) => void;
}) {
  return (
    <ul className="py-1">
      <li>
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-slate-50"
        >
          <span className={cn("grid size-3.5 place-items-center rounded-full border", !value ? "border-slate-800" : "border-slate-300")}>
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
              <span className={cn("grid size-3.5 place-items-center rounded-full border", on ? "border-slate-800" : "border-slate-300")}>
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

function PrioBadge({ p }: { p: string }) {
  const color =
    p === "CAO" ? "text-red-600" : p === "TRUNG_BINH" ? "text-amber-500" : "text-slate-400";
  return (
    <span className={cn("text-[11px] font-medium whitespace-nowrap", color)}>
      {PRIORITY_LABEL[p] ?? p}
    </span>
  );
}

// Cột Trạng thái — pill mềm + tag Trễ + tag Chờ duyệt (làm nổi việc cần hành động).
function StatusCell({
  t,
  canApproveStart,
  onApprove,
}: {
  t: TaskRow;
  canApproveStart: boolean;
  onApprove: () => void;
}) {
  const eff = effOf(t);
  const s = STATUS_SOFT[eff] ?? STATUS_SOFT.CHUA_LAM;
  const late = isCompletedLate(t);
  const lateDays = late
    ? Math.round((new Date(t.actualEnd).getTime() - new Date(t.plannedEnd).getTime()) / 86400000)
    : 0;
  const pending = isPendingApproval(t);
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
            s.pill,
          )}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", s.dot)} />
          {TASK_STATUS_LABEL[eff] ?? eff}
        </span>
        {late ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200"
            title={`Hoàn thành trễ hạn ${lateDays} ngày (hạn ${fmtDate(t.plannedEnd)} · xong ${fmtDate(t.actualEnd)})`}
          >
            <Flag className="size-2.5 shrink-0" /> Trễ {lateDays} ngày
          </span>
        ) : null}
      </div>
      {pending ? (
        <div className="flex items-center gap-1">
          <span
            className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200"
            title={t.approverName ? `Chờ ${t.approverName} duyệt khởi tạo` : "Đang chờ quản lý duyệt khởi tạo"}
          >
            <Lock className="size-2.5" /> Chờ duyệt
          </span>
          {canApproveStart ? (
            <button
              type="button"
              title="Duyệt — cho phép nhập thời gian"
              onClick={onApprove}
              className="grid size-5 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
            >
              <ShieldCheck className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Cột "Thực tế hoàn thành" — ô đánh dấu xong nổi bật (input ngày ẩn + showPicker).
function CompletionCell({
  t,
  canEdit,
  onComplete,
}: {
  t: TaskRow;
  canEdit: boolean;
  onComplete: (value: string) => void;
}) {
  const pending = isPendingApproval(t);
  const late = isCompletedLate(t);
  if (pending) {
    return (
      <div className="flex h-9 items-center gap-1.5 rounded-md border border-dashed border-slate-200 px-2 text-xs text-slate-300">
        <Lock className="size-3.5 shrink-0" /> Chờ duyệt
      </div>
    );
  }
  const openPicker = (e: React.MouseEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    try {
      (e.currentTarget as HTMLInputElement).showPicker();
    } catch {
      /* trình duyệt không hỗ trợ showPicker */
    }
  };
  if (t.actualEnd) {
    return (
      <label
        className={cn(
          "group relative flex h-9 items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
          canEdit ? "cursor-pointer" : "cursor-default",
          late ? "border-red-200 bg-red-50 text-red-600" : "border-emerald-200 bg-emerald-50 text-emerald-700",
        )}
      >
        <Check className="size-3.5 shrink-0" strokeWidth={3} />
        {fmtDate(t.actualEnd)}
        <input
          type="date"
          value={t.actualEnd}
          min={t.plannedStart || undefined}
          disabled={!canEdit}
          onClick={openPicker}
          onChange={(e) => onComplete(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
          title={canEdit ? "Đổi ngày hoàn thành" : "Chỉ người được giao hoặc quản lý"}
        />
        {canEdit ? <Pencil className="ml-auto size-3 opacity-0 transition group-hover:opacity-60" /> : null}
      </label>
    );
  }
  return (
    <label
      className={cn(
        "group relative flex h-9 items-center gap-1.5 rounded-md border border-dashed px-2 text-xs transition",
        canEdit
          ? "cursor-pointer border-slate-300 text-slate-400 hover:border-slate-800 hover:bg-slate-50 hover:text-slate-700"
          : "cursor-default border-slate-200 text-slate-300",
      )}
    >
      <Calendar className="size-3.5 shrink-0 opacity-60" />
      Đánh dấu xong
      <input
        type="date"
        min={t.plannedStart || undefined}
        disabled={!canEdit}
        onClick={openPicker}
        onChange={(e) => onComplete(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
        title={canEdit ? "Chọn ngày hoàn thành" : "Chỉ người được giao hoặc quản lý"}
      />
    </label>
  );
}

function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
      {children}
    </span>
  );
}

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
  workGroups: (Opt & { abbr?: string | null; lastSeq?: number })[];
  disciplines: Opt[];
  phases: Opt[];
  projects: ProjectOpt[];
  users: UserOpt[];
  approvers: UserOpt[];
  catalog: Catalog;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [activeWg, setActiveWg] = React.useState("");
  const [quick, setQuick] = React.useState<"" | "QUA_HAN" | "SAP_HAN" | "DANG_LAM">("");
  const [colFilters, setColFilters] = React.useState<Record<string, ColFilterVal>>({});
  const [openFilter, setOpenFilter] = React.useState<{ key: SortKey; rect: DOMRect } | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "ketThuc", dir: "asc" });
  const [editing, setEditing] = React.useState<TaskRow | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [logging, setLogging] = React.useState<TaskRow | null>(null);
  const [bulkLogging, setBulkLogging] = React.useState(false);
  // Chọn nhiều + thao tác hàng loạt.
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulkDeadline, setBulkDeadline] = React.useState<{ ids: string[]; date: string } | null>(null);

  const setCF = (k: SortKey, v: ColFilterVal) => setColFilters((s) => ({ ...s, [k]: v }));
  const clearCol = (k: SortKey) =>
    setColFilters((s) => {
      const n = { ...s };
      delete n[k];
      return n;
    });
  function clearAll() {
    setColFilters({});
    setSearch("");
    setQuick("");
    setActiveWg("");
  }

  // Giá trị phân biệt cho cột lọc "multi".
  const distinct = React.useMemo(() => {
    const uniq = (vals: string[]) => [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    return {
      duAn: uniq(tasks.map((t) => duAnText(t))),
      loaiHinh: uniq(tasks.map((t) => t.loaiHinhCode ?? (t.projectId ? "" : (t.level2 ?? "")))),
      hangMuc: uniq(tasks.map((t) => t.level3 ?? "")),
      congViec: uniq(tasks.map((t) => t.name)),
      giaiDoan: uniq(tasks.map((t) => t.phaseName ?? t.phaseCode ?? "")),
      boMon: uniq(tasks.map((t) => t.disciplineCode ?? "")),
      thucHien: uniq(tasks.flatMap((t) => t.assigneeNames)),
    };
  }, [tasks]);

  // Cột — gộp phân cấp còn 2 cột định danh (Dự án + Công việc); không cột Mã mặc định.
  const cols = React.useMemo<ColDef[]>(
    () => [
      { key: "duAn", label: "Dự án", w: 168, ident: true, filter: "multi", opts: distinct.duAn },
      { key: "loaiHinh", label: "Loại hình", w: 150, filter: "multi", opts: distinct.loaiHinh },
      { key: "hangMuc", label: "Hạng mục", w: 160, filter: "multi", opts: distinct.hangMuc },
      { key: "congViec", label: "Công việc", w: 252, ident: true, leaf: true, filter: "multi", opts: distinct.congViec },
      { key: "giaiDoan", label: "Giai đoạn", w: 130, filter: "multi", opts: distinct.giaiDoan },
      { key: "boMon", label: "Bộ môn", w: 120, filter: "multi", opts: distinct.boMon },
      { key: "thucHien", label: "Người thực hiện", w: 172, filter: "multi", opts: distinct.thucHien },
      { key: "uuTien", label: "Ưu tiên", w: 108, filter: "multi", opts: [...PRIORITY_OPTIONS], labelMap: PRIORITY_LABEL },
      { key: "tinhTrang", label: "Trạng thái", w: 168, filter: "status" },
      { key: "batDau", label: "Bắt đầu", w: 112, filter: "date" },
      { key: "ketThuc", label: "Kết thúc", w: 112, filter: "date" },
      { key: "thucTe", label: "Thực tế hoàn thành", w: 188, filter: "date" },
    ],
    [distinct],
  );

  // Cột phụ (không thuộc dữ liệu sort/lọc): Ghi giờ + Thao tác.
  const GHI_GIO_W = 84;

  const activeCols = cols.filter((c) => colActive(c, colFilters[c.key]));
  const activeFilterCount = activeCols.length + (activeWg ? 1 : 0);

  const haystacks = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) {
      m.set(
        t.id,
        norm([t.name, t.sumId, duAnText(t), t.loaiHinhCode, t.level3, t.phaseName, t.phaseCode, t.disciplineCode, t.disciplineName, t.assigneeNames.join(" ")].filter(Boolean).join(" ")),
      );
    }
    return m;
  }, [tasks]);

  // Nền KPI: search + lọc cột + tab (KHÔNG gồm quick) → số KPI ổn định khi bấm.
  const baseRows = React.useMemo(() => {
    const q = norm(deferredSearch.trim());
    return tasks.filter((t) => {
      if (activeWg && t.workGroupId !== activeWg) return false;
      if (q && !(haystacks.get(t.id) ?? "").includes(q)) return false;
      for (const c of cols) if (!rowMatchesCol(t, c, colFilters[c.key])) return false;
      return true;
    });
  }, [tasks, activeWg, deferredSearch, haystacks, cols, colFilters]);

  const kpi = React.useMemo(() => {
    let overdue = 0;
    let soon = 0;
    let doing = 0;
    for (const t of baseRows) {
      if (isOverdue(t)) overdue++;
      else if (isDueSoon(t)) soon++;
      if (effOf(t) === "DANG_LAM") doing++;
    }
    return { overdue, soon, doing };
  }, [baseRows]);

  // Đếm tab nhóm — trên nền tìm + lọc cột + quick (KHÔNG gồm tab).
  const quickFiltered = React.useMemo(() => {
    const q = norm(deferredSearch.trim());
    return tasks.filter((t) => {
      if (q && !(haystacks.get(t.id) ?? "").includes(q)) return false;
      for (const c of cols) if (!rowMatchesCol(t, c, colFilters[c.key])) return false;
      if (quick === "QUA_HAN" && !isOverdue(t)) return false;
      if (quick === "SAP_HAN" && !isDueSoon(t)) return false;
      if (quick === "DANG_LAM" && effOf(t) !== "DANG_LAM") return false;
      return true;
    });
  }, [tasks, deferredSearch, haystacks, cols, colFilters, quick]);

  const wgCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of quickFiltered) m.set(t.workGroupId, (m.get(t.workGroupId) ?? 0) + 1);
    return m;
  }, [quickFiltered]);

  const filtered = React.useMemo(
    () => (activeWg ? quickFiltered.filter((t) => t.workGroupId === activeWg) : quickFiltered),
    [quickFiltered, activeWg],
  );

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
      if (c === 0) c = (a.plannedEnd + a.name).localeCompare(b.plannedEnd + b.name, "vi");
      return sort.dir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  // Việc tôi được phép sửa Thực tế HT: quản lý hoặc người được giao, & không chờ duyệt.
  const canEditDoneOf = (t: TaskRow) =>
    (canManage || t.assigneeIds.includes(currentUserId)) && !isPendingApproval(t);

  // ---- actions ----
  async function onCompletion(t: TaskRow, value: string) {
    if (value) {
      const err = completionDateError(value, t.plannedStart || null);
      if (err) {
        toast.error(err);
        return;
      }
    }
    // Nếu dòng vừa sửa đang nằm trong nhóm đang chọn (≥2 dòng) → áp cùng ngày cho TẤT CẢ dòng đang chọn
    // (chỉ những việc bạn được phép sửa). Khỏi cần thao tác ở thanh dưới.
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
  async function approveStart(t: TaskRow) {
    const res = await setTaskStartApproval({ id: t.id, approved: true });
    if (res.ok) {
      toast.success("Đã duyệt — cho phép nhập thời gian");
      router.refresh();
    } else toast.error(res.error);
  }

  // ---- chọn nhiều ----
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
  const clearSel = () => setSelected(new Set());
  const allVisibleSelected = sorted.length > 0 && sorted.every((t) => selected.has(t.id));

  // Shift+click = chọn dải (anchor → dòng hiện tại); click/Ctrl = bật-tắt 1 dòng.
  const anchorRef = React.useRef<string | null>(null);
  function onCheckClick(e: React.MouseEvent, id: string) {
    if (e.shiftKey && anchorRef.current) {
      const ids = sorted.map((t) => t.id);
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

  // ---- thao tác hàng loạt (quản lý) ----
  async function batchPriority(priority: string) {
    if (!priority) return;
    if (!confirm(`Đổi ưu tiên ${selected.size} công việc?`)) return;
    const res = await bulkSetPriority({ ids: [...selected], priority });
    if (res.ok) {
      toast.success(`Đã đổi ưu tiên ${res.data ?? ""} việc`.replace("  ", " "));
      clearSel();
      router.refresh();
    } else toast.error(res.error);
  }
  async function runBulkDeadline() {
    if (!bulkDeadline?.date) return;
    const res = await bulkSetDeadline({ ids: bulkDeadline.ids, plannedEnd: bulkDeadline.date });
    if (res.ok) {
      toast.success(`Đã đổi hạn ${res.data ?? ""} việc`.replace("  ", " "));
      setBulkDeadline(null);
      clearSel();
      router.refresh();
    } else toast.error(res.error);
  }
  async function batchDelete() {
    if (!confirm(`Xóa ${selected.size} công việc đã chọn?`)) return;
    let ok = 0;
    for (const id of selected) {
      const r = await deleteTask(id);
      if (r.ok) ok++;
    }
    toast.success(`Đã xóa ${ok} việc`);
    clearSel();
    router.refresh();
  }

  // ---- ghim cột (checkbox + Dự án + Công việc) ----
  const SEL_W = 36; // mảnh, khớp /manage (MANAGE_SEL_PX)
  const frozen: { key: string; w: number }[] = [
    { key: "__sel__", w: SEL_W },
    ...cols.filter((c) => c.ident).map((c) => ({ key: c.key as string, w: c.w })),
  ];
  const isFrozen = (k: string) => frozen.some((f) => f.key === k);
  const frozenLast = frozen[frozen.length - 1].key;
  const leftOf = (k: string): number | undefined => {
    let x = 0;
    for (const f of frozen) {
      if (f.key === k) return x;
      x += f.w;
    }
    return undefined;
  };
  const FROZEN_SHADOW = "2px 0 0 rgba(15,23,42,0.06)";
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
  const headStyle = (k: string, width: number): React.CSSProperties => ({
    width,
    position: "sticky",
    top: 0,
    background: "#f8fafc", // slate-50
    ...(isFrozen(k)
      ? { left: leftOf(k), zIndex: 30, boxShadow: k === frozenLast ? FROZEN_SHADOW : undefined }
      : { zIndex: 20 }),
  });

  const totalW = SEL_W + cols.reduce((s, c) => s + c.w, 0) + GHI_GIO_W;
  const colSpan = 1 + cols.length + 1;

  const openCol = openFilter ? cols.find((c) => c.key === openFilter.key) ?? null : null;

  function renderHead(col: ColDef) {
    const active = sort.key === col.key;
    const filterOn = colActive(col, colFilters[col.key]);
    return (
      <th
        key={col.key}
        style={headStyle(col.key, col.w)}
        className={cn(
          "border-b border-slate-200 px-2.5 py-2.5 text-left text-xs font-semibold text-slate-500",
          col.ident && col.key !== "duAn" && "border-l border-slate-100",
        )}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => toggleSort(col.key)}
            className="flex min-w-0 flex-1 items-center gap-1 text-left hover:text-slate-800"
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
              filterOn ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-200 hover:text-slate-600",
            )}
          >
            <Filter className="size-3" strokeWidth={filterOn ? 2.5 : 2} />
          </button>
        </div>
      </th>
    );
  }

  function renderRow(t: TaskRow) {
    const overdue = isOverdue(t);
    const pending = isPendingApproval(t);
    const canEditDone = (canManage || t.assigneeIds.includes(currentUserId)) && !pending;
    const canApproveStart = isAdmin || canManage || t.approverId === currentUserId;
    const isSel = selected.has(t.id);
    return (
      <tr
        key={t.id}
        onDoubleClick={canManage ? () => setEditing(t) : undefined}
        className={cn(
          "border-b border-slate-100 bg-[var(--row-bg)]",
          canManage && "cursor-default",
          isSel ? "[--row-bg:#eff6ff]" : "[--row-bg:#ffffff] hover:[--row-bg:#f8fafc]",
        )}
      >
        <td style={bodyFrozenStyle("__sel__")} className="px-2 py-2.5 align-top">
          <input
            type="checkbox"
            checked={isSel}
            onChange={() => {}}
            onClick={(e) => onCheckClick(e, t.id)}
            className="mt-0.5 size-3.5 accent-slate-700"
            aria-label="Chọn việc (Shift+click để chọn dải)"
            title="Shift+click để chọn nhiều dòng liền nhau"
          />
        </td>
        {cols.map((c) => {
          if (c.key === "duAn") {
            const v = duAnText(t);
            return (
              <td key="duAn" style={bodyFrozenStyle("duAn")} className="px-2.5 py-2.5 align-top">
                {v ? <span className="text-slate-600" title={t.groupName ?? undefined}>{v}</span> : <span className="text-slate-300">—</span>}
              </td>
            );
          }
          if (c.key === "congViec")
            return (
              <td
                key="congViec"
                style={bodyFrozenStyle("congViec")}
                className="border-l border-slate-100 px-2.5 py-2.5 align-top"
              >
                <span className="font-medium text-slate-800">{t.name}</span>
              </td>
            );
          if (c.key === "loaiHinh")
            return (
              <td key="loaiHinh" className="px-2.5 py-2.5 align-top text-xs text-slate-600">
                {t.loaiHinhCode || <span className="text-slate-300">—</span>}
              </td>
            );
          if (c.key === "hangMuc")
            return (
              <td key="hangMuc" className="px-2.5 py-2.5 align-top text-xs text-slate-600">
                {t.level3 || <span className="text-slate-300">—</span>}
              </td>
            );
          if (c.key === "giaiDoan")
            return (
              <td key="giaiDoan" className="px-2.5 py-2.5 align-top text-xs text-slate-600">
                {t.phaseName || t.phaseCode || <span className="text-slate-300">—</span>}
              </td>
            );
          if (c.key === "boMon")
            return (
              <td key="boMon" className="px-2.5 py-2.5 align-top text-xs text-slate-600">
                {t.disciplineCode || <span className="text-slate-300">—</span>}
              </td>
            );
          if (c.key === "thucHien")
            return (
              <td key="thucHien" className="px-2.5 py-2.5 align-top text-xs">
                <div className="flex flex-col gap-0.5">
                  {t.assigneeNames.length === 0 ? <span className="text-slate-300">—</span> : null}
                  {t.assigneeNames.map((name, i) => {
                    const me = t.assigneeIds[i] === currentUserId;
                    return (
                      <span key={`${t.id}-${i}`} className={me ? "font-medium text-slate-800" : "text-slate-500"}>
                        {name}
                        {me ? <span className="ml-1 text-[10px] text-slate-400">(tôi)</span> : null}
                      </span>
                    );
                  })}
                </div>
              </td>
            );
          if (c.key === "uuTien")
            return (
              <td key="uuTien" className="px-2.5 py-2.5 align-top">
                <PrioBadge p={t.priority} />
              </td>
            );
          if (c.key === "tinhTrang")
            return (
              <td key="tinhTrang" className="px-2.5 py-2.5 align-top">
                <StatusCell t={t} canApproveStart={canApproveStart} onApprove={() => approveStart(t)} />
              </td>
            );
          if (c.key === "batDau")
            return (
              <td key="batDau" className="px-2.5 py-2.5 align-top text-xs text-slate-500">
                {fmtDate(t.plannedStart)}
              </td>
            );
          if (c.key === "ketThuc")
            return (
              <td key="ketThuc" className="px-2.5 py-2.5 align-top text-xs">
                <span className={overdue ? "font-medium text-red-600" : "text-slate-600"}>{fmtDate(t.plannedEnd)}</span>
              </td>
            );
          if (c.key === "thucTe")
            return (
              <td key="thucTe" className="px-2.5 py-2.5 align-top">
                <CompletionCell t={t} canEdit={canEditDone} onComplete={(v) => onCompletion(t, v)} />
              </td>
            );
          return <td key={c.key} className="px-2.5 py-2.5" />;
        })}
        {/* Ghi giờ */}
        <td className="px-2 py-2.5 text-center align-top">
          <button
            type="button"
            disabled={pending}
            onClick={() => setLogging(t)}
            title={pending ? "Việc đang chờ duyệt — chưa thể ghi giờ" : "Ghi giờ cho công việc này"}
            className={cn(
              "grid size-8 place-items-center rounded-md",
              pending ? "cursor-not-allowed text-slate-300" : "text-slate-400 hover:bg-blue-50 hover:text-blue-600",
            )}
          >
            <Clock className="size-4" />
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Công việc của tôi</h1>
          <p className="text-sm text-slate-500">
            {sorted.length} / {tasks.length} việc được giao
            {activeFilterCount > 0 ? (
              <span className="text-slate-400"> · đang lọc {activeFilterCount} điều kiện</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
        >
          <Plus className="size-4" /> Thêm công việc
        </button>
      </div>

      {/* KPI — 3 thẻ bấm lọc nhanh */}
      <div className="grid grid-cols-3 gap-2.5">
        {(
          [
            { key: "QUA_HAN", n: kpi.overdue, label: "Quá hạn", Icon: AlertTriangle, tone: "border-red-200 bg-red-50 text-red-700" },
            { key: "SAP_HAN", n: kpi.soon, label: "Sắp đến hạn (≤3 ngày)", Icon: Clock, tone: "border-amber-200 bg-amber-50 text-amber-700" },
            { key: "DANG_LAM", n: kpi.doing, label: "Đang làm", Icon: Activity, tone: "border-blue-200 bg-blue-50 text-blue-700" },
          ] as const
        ).map(({ key, n, label, Icon, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => setQuick((q) => (q === key ? "" : key))}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition",
              tone,
              quick === key ? "ring-2 ring-slate-400 ring-offset-1" : "hover:brightness-[0.97]",
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

      {/* tìm kiếm */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên, mã, bộ môn, người thực hiện..."
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-[15px] outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Xóa tìm kiếm"
            className="absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* tab nhóm — ẩn nhóm 0 việc của user */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveWg("")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeWg === "" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100",
          )}
        >
          Tất cả <span className="opacity-70">({quickFiltered.length})</span>
        </button>
        {workGroups.map((w) => {
          const n = wgCounts.get(w.id) ?? 0;
          if (n === 0 && activeWg !== w.id) return null;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => setActiveWg(w.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeWg === w.id ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100",
              )}
            >
              {w.name} <span className="opacity-70">({n})</span>
            </button>
          );
        })}
      </div>

      {/* chip điều kiện */}
      {activeCols.length > 0 || activeWg ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
            <Filter className="size-3.5" /> Lọc:
          </span>
          {activeWg ? (
            <Chip
              label="Nhóm"
              value={workGroups.find((w) => w.id === activeWg)?.name ?? ""}
              onRemove={() => setActiveWg("")}
            />
          ) : null}
          {false ? (
            <Chip
              label="Nhanh"
              value={{ "": "", QUA_HAN: "Quá hạn", SAP_HAN: "Sắp đến hạn", DANG_LAM: "Đang làm" }[quick]}
              onRemove={() => setQuick("")}
            />
          ) : null}
          {activeCols.map((c) => (
            <Chip key={c.key} label={c.label} value={chipText(c, colFilters[c.key])} onRemove={() => clearCol(c.key)} />
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-400 hover:text-red-600"
          >
            <RotateCcw className="size-3" /> Xóa tất cả
          </button>
        </div>
      ) : null}

      {/* BẢNG */}
      <div className="max-h-[calc(100svh-130px)] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="border-collapse text-sm" style={{ width: totalW, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: SEL_W }} />
            {cols.map((c) => (
              <col key={c.key} style={{ width: c.w }} />
            ))}
            <col style={{ width: GHI_GIO_W }} />
          </colgroup>
          <thead>
            <tr>
              <th style={headStyle("__sel__", SEL_W)} className="border-b border-slate-200 px-2 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="size-3.5 accent-slate-700"
                  aria-label="Chọn tất cả"
                  title="Chọn tất cả (theo bộ lọc hiện tại)"
                />
              </th>
              {cols.map((c) => renderHead(c))}
              <th
                style={{ ...headStyle("thucTe", GHI_GIO_W), left: undefined, position: "sticky", top: 0, zIndex: 20 }}
                className="border-b border-slate-200 px-2 py-2.5 text-center text-xs font-semibold text-slate-500"
              >
                Ghi giờ
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => renderRow(t))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-12 text-center text-sm text-slate-400">
                  Không có công việc phù hợp với bộ lọc
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* popover lọc */}
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
            <TextBody col={openCol} value={colFilters[openCol.key]} onChange={(v) => setCF(openCol.key, v)} />
          ) : null}
          {openCol.filter === "multi" ? (
            <MultiBody col={openCol} value={colFilters[openCol.key]} onChange={(v) => setCF(openCol.key, v)} />
          ) : null}
          {openCol.filter === "status" ? (
            <StatusBody value={colFilters[openCol.key]} onChange={(v) => setCF(openCol.key, v)} />
          ) : null}
          {openCol.filter === "date" ? (
            <DateBody
              col={openCol}
              value={colFilters[openCol.key]}
              onChange={(v) => {
                setCF(openCol.key, v);
                setOpenFilter(null);
              }}
            />
          ) : null}
        </Popover>
      ) : null}

      {/* sửa việc (chỉ quản lý) */}
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

      {/* Thêm công việc (tự note → chờ duyệt) */}
      {addOpen ? (
        <Modal open onClose={() => setAddOpen(false)} title="Thêm công việc (chờ duyệt)" className="max-w-[96vw]">
          <p className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <Info className="size-3.5 text-slate-400" />
            Người thực hiện tự gán là chính bạn · nhập ngày bắt đầu/kết thúc nếu đã biết.
          </p>
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
            onSaved={() => {
              setAddOpen(false);
              router.refresh();
            }}
          />
        </Modal>
      ) : null}

      {/* Ghi nhận giờ hàng loạt */}
      {bulkLogging ? (
        <BulkTimesheetDialog
          count={selected.size}
          onClose={() => setBulkLogging(false)}
          onSubmit={async (date, hours, note) => {
            const res = await bulkSaveTimesheetEntry({ taskIds: [...selected], date, hours, note });
            if (res.ok) {
              toast.success(`Đã ghi giờ cho ${res.data} công việc`);
              setBulkLogging(false);
              router.refresh();
            } else toast.error(res.error);
          }}
        />
      ) : null}

      {/* Ghi giờ */}
      {logging ? (
        <TimesheetEntryDialog
          lockedTask={{
            id: logging.id,
            name: logging.name,
            groupCode: logging.groupCode,
            loaiHinhCode: logging.loaiHinhCode,
            level3: logging.level3,
          }}
          defaultDate={dayjs().format("YYYY-MM-DD")}
          onClose={() => {
            setLogging(null);
            router.refresh();
          }}
        />
      ) : null}

      {/* Thanh thao tác hàng loạt */}
      {selected.size > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <span className="px-2 text-sm font-medium text-slate-700">Đã chọn {selected.size}</span>
          <span className="hidden text-xs text-slate-400 sm:inline">
            · Đặt ngày “Thực tế hoàn thành” ở một dòng đang chọn để áp cho tất cả
          </span>
          {canManage ? (
            <>
              <select
                value=""
                onChange={(e) => batchPriority(e.target.value)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">Đổi ưu tiên…</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setBulkDeadline({ ids: [...selected], date: "" })}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Calendar className="size-3.5" /> Đổi hạn
              </button>
              <button
                type="button"
                onClick={batchDelete}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-3.5" /> Xóa
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setBulkLogging(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Ghi nhận giờ
          </button>
          <button
            type="button"
            onClick={clearSel}
            title="Bỏ chọn"
            aria-label="Bỏ chọn"
            className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Modal: đổi hạn hàng loạt (quản lý) */}
      {bulkDeadline ? (
        <Modal
          open
          onClose={() => setBulkDeadline(null)}
          title={`Đổi hạn ${bulkDeadline.ids.length} công việc`}
          className="max-w-sm"
        >
          <div className="space-y-3">
            <input
              type="date"
              value={bulkDeadline.date}
              onChange={(e) => setBulkDeadline({ ...bulkDeadline, date: e.target.value })}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDeadline(null)}
                className="rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!bulkDeadline.date}
                onClick={runBulkDeadline}
                className="rounded-md bg-slate-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </Modal>
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
  projects: ProjectOpt[];
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

function BulkTimesheetDialog({
  count,
  onClose,
  onSubmit,
}: {
  count: number;
  onClose: () => void;
  onSubmit: (date: string, hours: number, note: string | null) => Promise<void>;
}) {
  const [pending, setPending] = React.useState(false);
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const date = String(fd.get("date") || "");
    const hours = Number(fd.get("hours") || 0);
    const note = (fd.get("note") as string) || null;
    setPending(true);
    await onSubmit(date, hours, note);
    setPending(false);
  }
  return (
    <Modal open onClose={onClose} title={`Ghi nhận giờ — ${count} công việc`} className="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Ngày</label>
            <input name="date" type="date" defaultValue={dayjs().format("YYYY-MM-DD")} required
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-400" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Số giờ</label>
            <input name="hours" type="number" step="0.25" min="0.25" max="24" required
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-400" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nội dung công việc</label>
          <textarea name="note" rows={3}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
        </div>
        <p className="text-xs text-slate-500">Số giờ và nội dung sẽ được ghi cho tất cả {count} công việc đã chọn.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Hủy</button>
          <button type="submit" disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
            {pending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
