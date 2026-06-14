"use client";

// Báo cáo — UI dùng chung + logic lọc cột. Port từ design_files/baocao-ui.jsx.
import { Check, Search } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn, removeVietnameseTones } from "@/lib/utils";
import {
  type EffStatus,
  type StatusCounts,
  type TaskRow,
  effStatus,
  isOverdue,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
} from "./report-data";

export const norm = removeVietnameseTones;

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
}

// ---------- Panel ----------
export function Panel({
  title,
  sub,
  right,
  children,
  className = "",
  bodyClass = "",
}: {
  title?: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-card shadow-sm", className)}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
            {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      <div className={cn("px-5 py-4", bodyClass)}>{children}</div>
    </section>
  );
}

// ---------- KPI tile ----------
const KPI_TONE: Record<string, string> = {
  slate: "text-slate-700",
  emerald: "text-emerald-600",
  red: "text-red-600",
  blue: "text-blue-600",
  amber: "text-amber-600",
  violet: "text-violet-600",
};
export function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "slate",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: keyof typeof KPI_TONE;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-card px-4 py-3.5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={cn("mt-2 text-[26px] font-semibold leading-none tabular-nums", KPI_TONE[tone])}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

// ---------- Status pill + mini-bar ----------
const SOFT: Record<EffStatus, string> = {
  CHUA_LAM: "bg-slate-50 text-slate-600 ring-slate-200",
  DANG_LAM: "bg-blue-50 text-blue-700 ring-blue-200",
  HOAN_THANH: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  TAM_DUNG: "bg-amber-50 text-amber-700 ring-amber-200",
  QUA_HAN: "bg-red-50 text-red-700 ring-red-200",
};
const DOT: Record<EffStatus, string> = {
  CHUA_LAM: "bg-slate-400",
  DANG_LAM: "bg-blue-500",
  HOAN_THANH: "bg-emerald-500",
  TAM_DUNG: "bg-amber-500",
  QUA_HAN: "bg-red-500",
};
export function StatusPill({ s }: { s: EffStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        SOFT[s],
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[s])} />
      {STATUS_LABEL[s]}
    </span>
  );
}

export function StatusMiniBar({ row, w = 132 }: { row: StatusCounts; w?: number }) {
  const tot = STATUS_ORDER.reduce((s, k) => s + (row[k] || 0), 0) || 1;
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" style={{ width: w }}>
      {STATUS_ORDER.map((k) =>
        row[k] > 0 ? (
          <div key={k} title={`${STATUS_LABEL[k]}: ${row[k]}`} style={{ width: (row[k] / tot) * 100 + "%", background: STATUS_COLOR[k] }} />
        ) : null,
      )}
    </div>
  );
}

// ---------- Popover ----------
export function Popover({
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

export function MultiBody({
  opts,
  labelMap,
  value,
  onChange,
  dots,
}: {
  opts: string[];
  labelMap?: Record<string, string>;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
  dots?: Record<string, string>;
}) {
  const [q, setQ] = React.useState("");
  const sel = value || [];
  const list = opts.filter((o) => norm(labelMap ? labelMap[o] : o).includes(norm(q)));
  const toggle = (o: string) => onChange(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);
  return (
    <div>
      {opts.length >= 6 && (
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
      )}
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400">
        <span>{sel.length ? `${sel.length} đã chọn` : "Chọn giá trị"}</span>
        {sel.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="hover:text-slate-600">
            Bỏ chọn
          </button>
        )}
      </div>
      <ul className="max-h-60 overflow-auto pb-1">
        {list.map((o) => {
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
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                {dots && dots[o] && <span className={cn("size-2 shrink-0 rounded-full", dots[o])} />}
                <span className="truncate">{labelMap ? labelMap[o] : o}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Không có kết quả</li>}
      </ul>
    </div>
  );
}

export function TextBody({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div className="p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Lọc theo ${label.toLowerCase()}…`}
          className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[13px] outline-none focus:border-slate-400 focus:bg-white"
        />
      </div>
    </div>
  );
}

export const DATE_PRESETS: Record<string, [string, string][]> = {
  batDau: [["thang", "Trong tháng này"], ["co", "Đã có ngày"], ["trong", "Chưa có ngày"]],
  ketThuc: [
    ["quahan", "Quá hạn"],
    ["sap", "Sắp đến hạn (≤3 ngày)"],
    ["thang", "Trong tháng này"],
    ["co", "Đã có ngày"],
    ["trong", "Chưa có ngày"],
  ],
  thucTe: [["co", "Đã hoàn thành"], ["trong", "Chưa hoàn thành"], ["tre", "Hoàn thành trễ hạn"]],
};

export function DateBody({ colKey, value, onChange }: { colKey: string; value: string | undefined; onChange: (v: string) => void }) {
  const presets = DATE_PRESETS[colKey] || [["co", "Đã có ngày"], ["trong", "Chưa có ngày"]];
  const opt = (v: string, l: string) => {
    const on = value === v || (v === "" && !value);
    return (
      <li key={v || "all"}>
        <button
          type="button"
          onClick={() => onChange(v)}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
        >
          <span className={cn("grid size-3.5 place-items-center rounded-full border", on ? "border-slate-800" : "border-slate-300")}>
            {on && <span className="size-1.5 rounded-full bg-slate-800" />}
          </span>
          <span className={v ? "" : "text-slate-500"}>{l}</span>
        </button>
      </li>
    );
  };
  return (
    <ul className="py-1">
      {opt("", "Tất cả")}
      {presets.map(([v, l]) => opt(v, l))}
    </ul>
  );
}

function matchDate(iso: string, val: string, r: TaskRow): boolean {
  const thisMonth = iso && iso.slice(0, 7) === todayMonth();
  switch (val) {
    case "co":
      return !!iso;
    case "trong":
      return !iso;
    case "thang":
      return !!thisMonth;
    case "quahan":
      return isOverdue(r);
    case "sap": {
      const n = daysUntil(iso);
      return n !== null && n >= 0 && n <= 3 && r.tinhTrang !== "HOAN_THANH";
    }
    case "tre":
      return !!(r.thucTe && r.ketThuc && r.thucTe > r.ketThuc);
    default:
      return true;
  }
}

// ---------- Cấu hình cột + logic lọc ----------
export type FilterKind = "text" | "multi" | "status" | "date";
export type ColDef = {
  key: string;
  label: string;
  w: number;
  filter?: FilterKind;
  opts?: string[];
  labelMap?: Record<string, string>;
  lvl?: number;
  get?: (r: TaskRow) => string;
};
export type ColFilters = Record<string, string | string[]>;

export function colActive(col: ColDef, v: string | string[] | undefined): boolean {
  if (v == null) return false;
  if (col.filter === "multi" || col.filter === "status") return Array.isArray(v) && v.length > 0;
  return !!v;
}
export function rowMatch(r: TaskRow, col: ColDef, v: string | string[] | undefined): boolean {
  if (!colActive(col, v)) return true;
  const cell = col.get ? col.get(r) : (r as unknown as Record<string, string>)[col.key];
  switch (col.filter) {
    case "text":
      return norm(String(cell)).includes(norm(v as string));
    case "date":
      return matchDate(String(cell ?? ""), v as string, r);
    case "status":
      return (v as string[]).includes(effStatus(r));
    case "multi":
      if (col.key === "thucHien") return (v as string[]).some((x) => r.thucHien.includes(x));
      return (v as string[]).includes(String(cell));
    default:
      return true;
  }
}
export function chipText(col: ColDef, v: string | string[]): string {
  if (col.filter === "text") return `"${v}"`;
  if (col.filter === "date") {
    const f = (DATE_PRESETS[col.key] || []).find(([k]) => k === v);
    return f ? f[1] : (v as string);
  }
  if (col.filter === "status") {
    const arr = v as string[];
    return arr.length === 1 ? STATUS_LABEL[arr[0] as EffStatus] : `${arr.length} trạng thái`;
  }
  const arr = v as string[];
  if (arr.length === 1) return col.labelMap ? col.labelMap[arr[0]] : arr[0];
  return `${arr.length} mục`;
}

export const STATUS_DOTS: Record<string, string> = {
  CHUA_LAM: "bg-slate-400",
  DANG_LAM: "bg-blue-500",
  HOAN_THANH: "bg-emerald-500",
  TAM_DUNG: "bg-amber-500",
  QUA_HAN: "bg-red-500",
};
