"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Download,
  ExternalLink,
  Filter,
  KeyRound,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Search,
  UserX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ColResizeHandle } from "@/components/col-resize-handle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SMARTSHEET_BATCH_SIZE } from "@/lib/smartsheet";
import { cn } from "@/lib/utils";
import {
  clearSmartsheetToken,
  prepareSmartsheetSync,
  saveSmartsheetToken,
  syncSmartsheetBatch,
  type SyncBatchResult,
  type SyncPrepareResult,
} from "@/server/actions/smartsheet";

// ---------- Kiểu dữ liệu từ server ----------

export type SmartsheetRowDTO = {
  id: string;
  folderName: string;
  sheetName: string;
  maGoi: string | null;
  hoSo: string | null;
  boMon: string | null;
  batDau: string | null; // "YYYY-MM-DD"
  phatHanhPD: string | null;
  tinhTrang: string | null; // giá trị GỐC Smartsheet
  chuTri: string | null;
  cbth1: string | null;
  cbth2: string | null;
  ghiChu: string | null;
  link: string | null; // mở đúng dòng trên Smartsheet
};

type LastSync = {
  at: string;
  userName: string | null;
  sheetCount: number;
  rowCount: number;
} | null;

// ---------- Trạng thái hiển thị ----------
// Nguồn Smartsheet chỉ có "Xong" / "Quá hạn" / trống. "Sắp đến hạn" và phần "Quá hạn" còn thiếu
// được SUY RA từ Ngày phát hành PD, đúng tinh thần effectiveStatus() của app (xem src/lib/task-status.ts).

type EffStatus = "HOAN_THANH" | "SAP_DEN_HAN" | "QUA_HAN" | "CHUA_CAP_NHAT";

/** Số ngày còn lại tính tới hạn (âm = đã quá hạn). Thuần khiết: chỉ đọc 2 chuỗi ISO. */
const dayDiff = (fromISO: string, toISO: string) =>
  Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000);

const DUE_SOON_DAYS = 3;

function effStatusOf(r: SmartsheetRowDTO, todayISO: string): EffStatus {
  if (r.tinhTrang === "Xong") return "HOAN_THANH";
  if (r.tinhTrang === "Quá hạn") return "QUA_HAN";
  if (r.phatHanhPD) {
    const left = dayDiff(todayISO, r.phatHanhPD);
    if (left < 0) return "QUA_HAN";
    if (left <= DUE_SOON_DAYS) return "SAP_DEN_HAN";
  }
  return "CHUA_CAP_NHAT";
}

const STATUS_SOFT: Record<EffStatus, { dot: string; pill: string; label: string }> = {
  HOAN_THANH: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800",
    label: "Hoàn thành",
  },
  SAP_DEN_HAN: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800",
    label: "Sắp đến hạn",
  },
  QUA_HAN: {
    dot: "bg-red-500",
    pill: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-800",
    label: "Quá hạn",
  },
  CHUA_CAP_NHAT: {
    dot: "bg-slate-400 dark:bg-slate-500",
    pill: "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700",
    label: "Chưa cập nhật",
  },
};

const fmtD = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : null);

/** "còn ~2 phút 30 giây" — làm tròn 5 giây cho con số đỡ nhảy liên tục. */
function fmtEta(seconds: number): string {
  if (seconds <= 3) return "sắp xong";
  const s = Math.round(seconds / 5) * 5;
  if (s < 60) return `còn ~${s} giây`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `còn ~${m} phút ${r} giây` : `còn ~${m} phút`;
}

// ---------- Định nghĩa cột ----------

type ColKey =
  | "maGoi" | "duAn" | "sheet" | "hoSo" | "boMon" | "chuTri"
  | "thucHien" | "tinhTrang" | "batDau" | "phatHanhPD" | "ghiChu" | "link";

type ColDef = {
  key: ColKey;
  label: string;
  w: number;
  /** Cột phân cấp của cây, được ghim trái (1 = Dự án, 2 = Sheet, 3 = Công việc). */
  tree?: 1 | 2 | 3;
  sortable?: boolean;
  /** Lọc chọn-nhiều theo danh sách giá trị có thật. */
  filter?: boolean;
  /** Lọc chọn-một theo mốc thời gian (cột ngày) — xem DATE_PRESETS. */
  dateFilter?: boolean;
};

/**
 * Mốc lọc cho cột ngày, giống bảng /manage.
 * "Phát hành PD" là cột HẠN của dữ liệu này nên có thêm Quá hạn / Sắp đến hạn.
 */
const DATE_PRESETS: Partial<Record<ColKey, [string, string][]>> = {
  batDau: [
    ["thang", "Trong tháng này"],
    ["co", "Đã có ngày"],
    ["trong", "Chưa có ngày"],
  ],
  phatHanhPD: [
    ["quahan", "Quá hạn"],
    ["sap", `Sắp đến hạn (≤${DUE_SOON_DAYS} ngày)`],
    ["thang", "Trong tháng này"],
    ["co", "Đã có ngày"],
    ["trong", "Chưa có ngày"],
  ],
};

function matchDatePreset(r: SmartsheetRowDTO, key: ColKey, val: string, todayISO: string): boolean {
  const iso = key === "batDau" ? r.batDau : r.phatHanhPD;
  switch (val) {
    case "co": return !!iso;
    case "trong": return !iso;
    case "thang": return !!iso && iso.slice(0, 7) === todayISO.slice(0, 7);
    case "quahan": return effStatusOf(r, todayISO) === "QUA_HAN";
    case "sap": return effStatusOf(r, todayISO) === "SAP_DEN_HAN";
    default: return true;
  }
}

// Bề rộng mặc định đã tính chỗ cho icon sắp xếp + nút lọc trong tiêu đề (thiếu là nhãn bị cắt).
const COLS: ColDef[] = [
  { key: "maGoi", label: "Mã gói", w: 104, sortable: true },
  { key: "duAn", label: "Dự án", w: 130, tree: 1, sortable: true, filter: true },
  { key: "sheet", label: "Sheet", w: 140, tree: 2, sortable: true, filter: true },
  { key: "hoSo", label: "Công việc (Hồ sơ thiết kế)", w: 230, tree: 3, sortable: true, filter: true },
  { key: "boMon", label: "Bộ môn", w: 112, sortable: true, filter: true },
  { key: "chuTri", label: "Chủ trì", w: 140, sortable: true, filter: true },
  { key: "thucHien", label: "Thực hiện", w: 175, sortable: true, filter: true },
  { key: "tinhTrang", label: "Tình trạng", w: 150, sortable: true, filter: true },
  { key: "batDau", label: "Bắt đầu", w: 116, sortable: true, dateFilter: true },
  { key: "phatHanhPD", label: "Phát hành PD", w: 140, sortable: true, dateFilter: true },
  { key: "ghiChu", label: "Ghi chú", w: 150 },
  { key: "link", label: "Smartsheet", w: 112 },
];

const DEFAULT_W = Object.fromEntries(COLS.map((c) => [c.key, c.w])) as Record<ColKey, number>;
const MIN_W = 60;
const MAX_W = 500;
const WIDTH_STORE = "smartsheet:colWidths";

// --- Bề rộng cột lưu ở localStorage, đọc qua useSyncExternalStore ---
// Dùng external store thay vì đọc trong useEffect: server render ra bề rộng mặc định, sau khi
// hydrate React tự đọc lại bản đã lưu — không lệch HTML, không setState trong effect.
type StoredWidths = Partial<Record<ColKey, number>>;
const SERVER_WIDTHS: StoredWidths = {};
let widthCache: { raw: string | null; value: StoredWidths } = { raw: null, value: SERVER_WIDTHS };
const widthListeners = new Set<() => void>();

function subscribeWidths(cb: () => void) {
  widthListeners.add(cb);
  return () => widthListeners.delete(cb);
}
function getWidthsSnapshot(): StoredWidths {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(WIDTH_STORE);
  } catch {
    raw = null;
  }
  // Chỉ dựng object mới khi chuỗi thô đổi — useSyncExternalStore đòi tham chiếu ổn định.
  if (raw !== widthCache.raw) {
    let value: StoredWidths = {};
    try {
      if (raw) value = JSON.parse(raw) as StoredWidths;
    } catch {
      value = {};
    }
    widthCache = { raw, value };
  }
  return widthCache.value;
}
function getServerWidthsSnapshot(): StoredWidths {
  return SERVER_WIDTHS;
}
function writeWidths(v: StoredWidths) {
  try {
    localStorage.setItem(WIDTH_STORE, JSON.stringify(v));
  } catch {
    /* hết dung lượng / bị chặn thì bỏ qua */
  }
  widthListeners.forEach((l) => l());
}
const FROZEN_SHADOW = "2px 0 0 rgba(15,23,42,0.06)";
const EMPTY = "(trống)";
const cellPad = "px-2.5 py-1.5";

/** Giá trị chữ của 1 ô — dùng chung cho sắp xếp, lọc và tìm kiếm. */
function textOf(r: SmartsheetRowDTO, key: ColKey, todayISO: string): string {
  switch (key) {
    case "maGoi": return r.maGoi ?? "";
    case "duAn": return r.folderName;
    case "sheet": return r.sheetName;
    case "hoSo": return r.hoSo ?? "";
    case "boMon": return r.boMon ?? "";
    case "chuTri": return r.chuTri?.trim() ?? "";
    case "thucHien": return [r.cbth1, r.cbth2].map((s) => s?.trim()).filter(Boolean).join(", ");
    case "tinhTrang": return STATUS_SOFT[effStatusOf(r, todayISO)].label;
    case "batDau": return r.batDau ?? "";
    case "phatHanhPD": return r.phatHanhPD ?? "";
    case "ghiChu": return r.ghiChu ?? "";
    case "link": return r.link ?? "";
  }
}

/** So sánh có dấu tiếng Việt; ô trống luôn xuống cuối bất kể chiều sắp xếp. */
function cmpText(a: string, b: string, dir: "asc" | "desc"): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const c = a.localeCompare(b, "vi", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? c : -c;
}

export function SmartsheetClient({
  rows,
  lastSync,
  hasToken,
  todayISO,
}: {
  rows: SmartsheetRowDTO[];
  lastSync: LastSync;
  hasToken: boolean;
  todayISO: string;
}) {
  const router = useRouter();

  // ---------- State bảng ----------
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | EffStatus>("");
  const [colFilters, setColFilters] = React.useState<Partial<Record<ColKey, string[]>>>({});
  // Cột ngày dùng lọc CHỌN-MỘT theo mốc thời gian (rỗng = Tất cả).
  const [dateFilters, setDateFilters] = React.useState<Partial<Record<ColKey, string>>>({});
  const [sort, setSort] = React.useState<{ key: ColKey; dir: "asc" | "desc" } | null>(null);
  const storedWidths = React.useSyncExternalStore(
    subscribeWidths,
    getWidthsSnapshot,
    getServerWidthsSnapshot,
  );
  // `draft` giữ bề rộng đang kéo dở để kéo mượt mà không ghi localStorage 60 lần/giây.
  const [draftWidths, setDraftWidths] = React.useState<StoredWidths | null>(null);
  const draggingRef = React.useRef(false);
  // Gộp 2 cấp thu gọn vào 1 state để mọi thao tác dùng được functional update
  // (bấm Collapse/Expand liên tiếp trước khi render xong vẫn nhảy đúng cấp).
  const [collapsed, setCollapsed] = React.useState<{ folders: Set<string>; sheets: Set<string> }>({
    folders: new Set(),
    sheets: new Set(),
  });

  const widthOf = (k: ColKey) => draftWidths?.[k] ?? storedWidths[k] ?? DEFAULT_W[k];
  const totalMinW = COLS.reduce((a, c) => a + widthOf(c.key), 0);
  // Cột cây ghim trái: cộng dồn bề rộng các cột cây đứng trước.
  const leftOf = (k: ColKey) => {
    if (k === "duAn") return 0;
    if (k === "sheet") return widthOf("duAn");
    if (k === "hoSo") return widthOf("duAn") + widthOf("sheet");
    return undefined;
  };

  // ---------- State sync + token ----------
  type SyncState =
    | { phase: "prepare" }
    | { phase: "scan"; total: number; scanned: number; inFlight: number; rows: number; eta: string | null };
  const [sync, setSync] = React.useState<SyncState | null>(null);
  const syncing = sync !== null;
  const [tokenOpen, setTokenOpen] = React.useState(false);
  const [tokenInput, setTokenInput] = React.useState("");
  const [tokenBusy, setTokenBusy] = React.useState(false);

  // ---------- Lọc ----------
  const matches = React.useCallback(
    (r: SmartsheetRowDTO) => {
      if (statusFilter && effStatusOf(r, todayISO) !== statusFilter) return false;
      for (const [key, sel] of Object.entries(colFilters)) {
        if (!sel?.length) continue;
        const k = key as ColKey;
        if (k === "thucHien") {
          // Lọc theo TỪNG người, không theo chuỗi đã ghép.
          const names = [r.cbth1, r.cbth2].map((s) => s?.trim()).filter(Boolean) as string[];
          const list = names.length ? names : [EMPTY];
          if (!sel.some((s) => list.includes(s))) return false;
        } else if (!sel.includes(textOf(r, k, todayISO) || EMPTY)) {
          return false;
        }
      }
      for (const [key, val] of Object.entries(dateFilters)) {
        if (!val) continue;
        if (!matchDatePreset(r, key as ColKey, val, todayISO)) return false;
      }
      if (q) {
        const hay = [r.folderName, r.sheetName, r.maGoi, r.hoSo, r.chuTri, r.cbth1, r.cbth2, r.ghiChu]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    },
    [q, statusFilter, colFilters, dateFilters, todayISO],
  );

  // ---------- Dựng cây Dự án → Sheet → Gói (có áp sắp xếp) ----------
  const view = React.useMemo(() => {
    // Sắp xếp TOÀN BẢNG trước, rồi mới gom nhóm — thứ tự nhóm đi theo thứ tự sắp xếp (Map giữ
    // thứ tự chèn), giống bảng /manage. Nếu chỉ sắp trong từng sheet thì bấm A→Z gần như không
    // thấy gì đổi vì đa số sheet chỉ có 1 dòng.
    const sortedRows = rows.filter(matches).sort((a, b) => {
      if (sort) {
        const c = cmpText(textOf(a, sort.key, todayISO), textOf(b, sort.key, todayISO), sort.dir);
        if (c !== 0) return c;
      }
      return (
        cmpText(a.folderName, b.folderName, "asc") ||
        cmpText(a.sheetName, b.sheetName, "asc") ||
        cmpText(a.phatHanhPD ?? "", b.phatHanhPD ?? "", "asc") ||
        cmpText(a.maGoi ?? "", b.maGoi ?? "", "asc")
      );
    });

    const byFolder = new Map<string, Map<string, SmartsheetRowDTO[]>>();
    for (const r of sortedRows) {
      const sheets = byFolder.get(r.folderName) ?? new Map<string, SmartsheetRowDTO[]>();
      const list = sheets.get(r.sheetName) ?? [];
      list.push(r);
      sheets.set(r.sheetName, list);
      byFolder.set(r.folderName, sheets);
    }

    const folders = [...byFolder.entries()].map(([folder, sheetMap]) => {
      const sheets = [...sheetMap.entries()].map(([sheetName, leaves]) => {
        const starts = leaves.map((l) => l.batDau).filter(Boolean).sort() as string[];
        const pds = leaves.map((l) => l.phatHanhPD).filter(Boolean).sort() as string[];
        return {
          key: `${folder}|${sheetName}`,
          sheetName,
          leaves,
          start: starts[0] ?? null,
          pd: pds.length ? pds[pds.length - 1]! : null,
        };
      });
      return { folder, sheets, count: sheets.reduce((a, s) => a + s.leaves.length, 0) };
    });

    return { folders, shown: sortedRows.length };
  }, [rows, matches, sort, todayISO]);

  const allSheetKeys = React.useMemo(
    () => view.folders.flatMap((f) => f.sheets.map((s) => s.key)),
    [view],
  );

  // ---------- Tùy chọn lọc cho từng cột (tính trên TOÀN BỘ dữ liệu) ----------
  const optionsOf = React.useCallback(
    (key: ColKey): string[] => {
      const set = new Set<string>();
      for (const r of rows) {
        if (key === "thucHien") {
          const names = [r.cbth1, r.cbth2].map((s) => s?.trim()).filter(Boolean) as string[];
          if (names.length) names.forEach((n) => set.add(n));
          else set.add(EMPTY);
        } else {
          set.add(textOf(r, key, todayISO) || EMPTY);
        }
      }
      return [...set].sort((a, b) => cmpText(a, b, "asc"));
    },
    [rows, todayISO],
  );

  // ---------- KPI ----------
  const kpi = React.useMemo(() => {
    let done = 0, dueSoon = 0, late = 0;
    for (const r of rows) {
      const s = effStatusOf(r, todayISO);
      if (s === "HOAN_THANH") done++;
      else if (s === "SAP_DEN_HAN") dueSoon++;
      else if (s === "QUA_HAN") late++;
    }
    return { total: rows.length, done, dueSoon, late };
  }, [rows, todayISO]);

  // Chip Chủ trì = lối tắt của bộ lọc cột "chuTri" (một cơ chế duy nhất, không đá nhau).
  const leads = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.chuTri?.trim() || EMPTY;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const leadSel = colFilters.chuTri ?? [];

  const activeFilterCount =
    Object.values(colFilters).filter((v) => v?.length).length +
    Object.values(dateFilters).filter(Boolean).length +
    (statusFilter ? 1 : 0) +
    (q ? 1 : 0);

  const setColFilter = (key: ColKey, sel: string[]) =>
    setColFilters((prev) => {
      const next = { ...prev };
      if (sel.length) next[key] = sel;
      else delete next[key];
      return next;
    });

  const clearAllFilters = () => {
    setColFilters({});
    setDateFilters({});
    setStatusFilter("");
    setQ("");
  };

  const toggleSort = (key: ColKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  // ---------- Collapse/Expand TỪNG CẤP (đúng logic /manage) ----------
  const collapseOneLevel = () =>
    setCollapsed((prev) =>
      allSheetKeys.some((k) => !prev.sheets.has(k))
        ? { ...prev, sheets: new Set(allSheetKeys) }
        : { ...prev, folders: new Set(view.folders.map((f) => f.folder)) },
    );
  const expandOneLevel = () =>
    setCollapsed((prev) =>
      prev.folders.size > 0 ? { ...prev, folders: new Set() } : { ...prev, sheets: new Set() },
    );
  const toggleFolder = (folder: string) =>
    setCollapsed((prev) => {
      const folders = new Set(prev.folders);
      if (folders.has(folder)) folders.delete(folder);
      else folders.add(folder);
      return { ...prev, folders };
    });
  const toggleSheet = (key: string) =>
    setCollapsed((prev) => {
      const sheets = new Set(prev.sheets);
      if (sheets.has(key)) sheets.delete(key);
      else sheets.add(key);
      return { ...prev, sheets };
    });

  // ---------- Sync 2 bước: chuẩn bị (biết tổng) → quét từng lô ----------
  async function runSync(full = false) {
    if (!hasToken) { setTokenOpen(true); return; }
    setSync({ phase: "prepare" });
    try {
      const prep = await prepareSmartsheetSync({ full });
      if (!prep.ok) { toast.error(prep.error); return; }
      const { logId, total } = prep.data as SyncPrepareResult;

      if (total === 0) {
        toast.success("Dữ liệu đã là mới nhất", { description: "Không sheet nào thay đổi từ lần đồng bộ trước" });
        return;
      }

      const startedAt = Date.now();
      let scanned = 0;
      let rowsFound = 0;
      let denom = total;
      let eta: string | null = null;

      for (;;) {
        setSync({
          phase: "scan",
          total: denom,
          scanned,
          inFlight: Math.min(SMARTSHEET_BATCH_SIZE, denom - scanned),
          rows: rowsFound,
          eta,
        });
        const res = await syncSmartsheetBatch({ logId });
        if (!res.ok) { toast.error(res.error); return; }
        const d = res.data as SyncBatchResult;
        scanned += d.processed;
        rowsFound = d.totalRows;
        denom = Math.max(denom, scanned + d.remaining);
        eta =
          scanned > 0 && d.remaining > 0
            ? fmtEta(((denom - scanned) * (Date.now() - startedAt)) / 1000 / scanned)
            : null;
        setSync({ phase: "scan", total: denom, scanned, inFlight: 0, rows: rowsFound, eta });
        if (d.done) {
          toast.success("Đã đồng bộ từ Smartsheet", {
            description: `${d.totalRows} dòng BIM · đã quét ${scanned} sheet`,
          });
          router.refresh();
          return;
        }
      }
    } finally {
      setSync(null);
    }
  }

  const pct =
    sync?.phase === "scan" && sync.total > 0
      ? Math.min(100, Math.round((sync.scanned / sync.total) * 100))
      : null;
  const pctInFlight =
    sync?.phase === "scan" && sync.total > 0
      ? Math.min(100, Math.round(((sync.scanned + sync.inFlight) / sync.total) * 100))
      : null;
  const etaText = sync?.phase === "scan" ? sync.eta : null;

  // ---------- Token ----------
  async function onSaveToken() {
    setTokenBusy(true);
    try {
      const res = await saveSmartsheetToken({ token: tokenInput });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Token hợp lệ — tài khoản ${res.data?.email}`);
      setTokenInput("");
      setTokenOpen(false);
      router.refresh();
    } finally {
      setTokenBusy(false);
    }
  }
  async function onClearToken() {
    if (!confirm("Xóa token Smartsheet đã lưu của bạn?")) return;
    setTokenBusy(true);
    try {
      const res = await clearSmartsheetToken();
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Đã xóa token");
      setTokenOpen(false);
      router.refresh();
    } finally {
      setTokenBusy(false);
    }
  }

  const lastSyncText = lastSync
    ? `${new Date(lastSync.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · ${new Date(lastSync.at).toLocaleDateString("vi-VN")}${lastSync.userName ? ` · ${lastSync.userName}` : ""}`
    : "chưa đồng bộ lần nào";

  const kpiTiles: { key: "" | EffStatus; n: number; label: string; icon: React.ReactNode; cls: string; activeCls: string }[] = [
    { key: "", n: kpi.total, label: "Tổng gói thiết kế", icon: <ListChecks className="size-5" />, cls: "border-blue-200 bg-blue-50 text-blue-700", activeCls: "ring-2 ring-offset-1 ring-blue-400" },
    { key: "HOAN_THANH", n: kpi.done, label: "Hoàn thành", icon: <CheckCircle2 className="size-5" />, cls: "border-green-200 bg-green-50 text-green-700", activeCls: "ring-2 ring-offset-1 ring-green-400" },
    { key: "SAP_DEN_HAN", n: kpi.dueSoon, label: `Sắp đến hạn (≤${DUE_SOON_DAYS} ngày)`, icon: <Clock className="size-5" />, cls: "border-amber-200 bg-amber-50 text-amber-700", activeCls: "ring-2 ring-offset-1 ring-amber-400" },
    { key: "QUA_HAN", n: kpi.late, label: "Quá hạn", icon: <AlertTriangle className="size-5" />, cls: "border-red-200 bg-red-50 text-red-700", activeCls: "ring-2 ring-offset-1 ring-red-400" },
  ];

  // ---------- Ô dữ liệu theo từng cột ----------
  function renderCell(col: ColDef, r: SmartsheetRowDTO) {
    const dash = <span className="text-slate-300 dark:text-slate-600">—</span>;
    switch (col.key) {
      case "maGoi":
        return <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{r.maGoi ?? "—"}</span>;
      case "duAn":
      case "sheet":
        return null; // cột cha để trống ở dòng lá (kiểu dedup của /manage)
      case "hoSo":
        return (
          <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
            {r.hoSo ?? "(Chưa có tên hồ sơ)"}
          </span>
        );
      case "boMon":
        return (
          <span className="inline-flex rounded-md border px-2 py-px text-[11px] font-medium text-slate-700 dark:text-slate-200">
            {r.boMon ?? "—"}
          </span>
        );
      case "chuTri":
        return r.chuTri ? <span className="text-xs text-slate-700 dark:text-slate-200">{r.chuTri}</span> : dash;
      case "thucHien": {
        const doers = [r.cbth1, r.cbth2].map((s) => s?.trim()).filter(Boolean).join(", ");
        return doers ? (
          <span className="text-xs text-slate-700 dark:text-slate-200">{doers}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <UserX className="size-3" /> Chưa giao
          </span>
        );
      }
      case "tinhTrang": {
        const st = STATUS_SOFT[effStatusOf(r, todayISO)];
        const left = r.phatHanhPD ? dayDiff(todayISO, r.phatHanhPD) : null;
        return (
          <span
            title={`Giá trị gốc Smartsheet: ${r.tinhTrang || "(trống)"}${left !== null ? ` · còn ${left} ngày tới hạn` : ""}`}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              st.pill,
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", st.dot)} />
            {st.label}
          </span>
        );
      }
      case "batDau":
      case "phatHanhPD": {
        const v = fmtD(col.key === "batDau" ? r.batDau : r.phatHanhPD);
        return v ? (
          <span className="whitespace-nowrap text-[13px] tabular-nums text-slate-600 dark:text-slate-300">{v}</span>
        ) : (
          dash
        );
      }
      case "ghiChu": {
        if (!r.ghiChu) return dash;
        const m = r.ghiChu.match(/https?:\/\/\S+/);
        return m ? (
          <a
            href={m[0]}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">Autodesk Docs</span>
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">{r.ghiChu}</span>
        );
      }
      case "link":
        return r.link ? (
          <a
            href={r.link}
            target="_blank"
            rel="noreferrer"
            title="Mở đúng dòng này trên Smartsheet"
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 hover:underline dark:text-blue-400 dark:hover:bg-blue-950"
          >
            <ExternalLink className="size-3 shrink-0" /> Mở dòng
          </a>
        ) : (
          dash
        );
    }
  }

  return (
    <div className="space-y-4">
      {/* ---- Dòng đếm + nút hành động ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{view.shown}</strong>/{rows.length} gói thiết kế ·{" "}
            {view.folders.length} dự án · Bộ môn: <strong className="text-foreground">BIM</strong>
            {activeFilterCount > 0 ? ` · đang lọc ${activeFilterCount} điều kiện` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Đồng bộ lần cuối: {lastSyncText} · Workspace “Viện Thiết Kế”
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setTokenOpen(true)}>
            <KeyRound className="size-4" /> {hasToken ? "Token" : "Cấu hình token"}
          </Button>
          <a
            href="/api/export/smartsheet"
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Download className="size-4" /> Xuất Excel
          </a>
          <Button
            onClick={() => void runSync(false)}
            disabled={syncing}
            title={
              hasToken
                ? "Lần đầu quét toàn bộ sheet của workspace (vài phút); các lần sau chỉ tải sheet có sửa đổi mới"
                : "Cần cấu hình token trước"
            }
            className={cn("relative min-w-[196px] overflow-hidden", syncing && "disabled:opacity-100")}
          >
            {syncing ? (
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 bg-primary-foreground/25 transition-[width] duration-300 ease-out",
                  pct === null && "w-full animate-pulse",
                )}
                style={pct === null ? undefined : { width: `${pct}%` }}
              />
            ) : null}
            <span className="relative inline-flex items-center gap-2">
              <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
              {!syncing ? "Tải từ Smartsheet" : pct === null ? "Đang chuẩn bị..." : `Đang quét ${pct}%`}
            </span>
          </Button>
        </div>
      </div>

      {/* ---- Thanh tiến trình (chỉ hiện khi đang đồng bộ) ---- */}
      {sync ? (
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium">
              {sync.phase === "prepare"
                ? "Đang lấy danh sách sheet của workspace..."
                : sync.inFlight > 0
                  ? `Đang quét sheet ${sync.scanned + 1}–${Math.min(sync.total, sync.scanned + sync.inFlight)}/${sync.total}`
                  : `Đã quét ${sync.scanned}/${sync.total} sheet`}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {pct === null ? "" : `${pct}%${etaText ? ` · ${etaText}` : ""}`}
            </span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
            {pctInFlight !== null ? (
              <div
                className="absolute inset-y-0 left-0 animate-pulse rounded-full bg-primary/35 transition-[width] duration-300 ease-out"
                style={{ width: `${pctInFlight}%` }}
              />
            ) : null}
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300 ease-out",
                pct === null && "w-1/3 animate-pulse",
              )}
              style={pct === null ? undefined : { width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {sync.phase === "scan" && sync.scanned > 0
              ? `Đang có ${sync.rows} dòng Bộ môn BIM trong dữ liệu`
              : "Chưa quét sheet nào"}
          </p>
        </div>
      ) : null}

      {/* ---- KPI bấm để lọc nhanh ---- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpiTiles.map((t) => (
          <button
            key={t.key || "all"}
            type="button"
            onClick={() => setStatusFilter((s) => (s === t.key ? "" : t.key))}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left outline-none transition",
              t.cls,
              statusFilter === t.key && t.activeCls,
            )}
          >
            {t.icon}
            <div className="min-w-0">
              <div className="text-xl font-semibold leading-none">{t.n}</div>
              <div className="truncate text-xs opacity-80">{t.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ---- Tìm kiếm ---- */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 pl-9 pr-9 text-base"
          placeholder="Tìm theo dự án, tên sheet, mã gói, hồ sơ thiết kế, người thực hiện..."
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Xóa tìm kiếm"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>

      {/* ---- Chip Chủ trì (lối tắt của bộ lọc cột) + Collapse/Expand ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-muted-foreground">Chủ trì:</span>
          <button
            type="button"
            onClick={() => setColFilter("chuTri", [])}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
              leadSel.length === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Tất cả
          </button>
          {leads.map(([name, n]) => (
            <button
              key={name}
              type="button"
              onClick={() => setColFilter("chuTri", leadSel.length === 1 && leadSel[0] === name ? [] : [name])}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                leadSel.includes(name) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {name} ({n})
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1">
          {activeFilterCount > 0 || sort ? (
            <button
              type="button"
              onClick={() => { clearAllFilters(); setSort(null); }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-red-600"
              title="Bỏ mọi bộ lọc và sắp xếp"
            >
              <RotateCcw className="size-3.5" /> Xóa lọc
            </button>
          ) : null}
          <Button variant="outline" size="sm" onClick={collapseOneLevel} title="Thu từng cấp: Sheet → Dự án">
            <ChevronsDownUp className="size-4" /> Collapse
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={expandOneLevel}
            disabled={collapsed.folders.size === 0 && collapsed.sheets.size === 0}
            title="Xổ từng cấp: Dự án → Sheet"
          >
            <ChevronsUpDown className="size-4" /> Expand
          </Button>
        </div>
      </div>

      {/* ---- Bảng tree ---- */}
      <div className="overflow-auto rounded-lg border bg-card shadow-sm max-h-[calc(100svh-40px)]">
        <table
          className="text-sm"
          style={{ width: "100%", minWidth: totalMinW, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 }}
        >
          <colgroup>
            {COLS.map((c) => (
              <col key={c.key} style={{ width: widthOf(c.key) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLS.map((col) => {
                const left = leftOf(col.key);
                const frozen = left !== undefined;
                const active = sort?.key === col.key;
                const sel = colFilters[col.key] ?? [];
                return (
                  <th
                    key={col.key}
                    style={{
                      position: "sticky",
                      top: 0,
                      background: "var(--muted)",
                      ...(frozen
                        ? { left, zIndex: 30, ...(col.key === "hoSo" ? { boxShadow: FROZEN_SHADOW } : {}) }
                        : { zIndex: 20 }),
                    }}
                    className={cn(
                      "group relative select-none border-b border-slate-200 px-2.5 py-2.5 text-left text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400",
                      col.tree && "border-l border-slate-100 dark:border-slate-800",
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => { if (!draggingRef.current) toggleSort(col.key); }}
                          title={`Sắp xếp ${active && sort?.dir === "asc" ? "Z → A" : "A → Z"}`}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          <span className="truncate">{col.label}</span>
                          {active ? (
                            sort?.dir === "asc" ? (
                              <ArrowUp className="size-3 shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 shrink-0" />
                            )
                          ) : (
                            <ChevronsUpDown className="size-3 shrink-0 opacity-25" />
                          )}
                        </button>
                      ) : (
                        <span className="min-w-0 flex-1 truncate">{col.label}</span>
                      )}
                      {col.filter ? (
                        <ColFilterButton
                          title={col.label}
                          options={optionsOf(col.key)}
                          selected={sel}
                          onChange={(v) => setColFilter(col.key, v)}
                        />
                      ) : null}
                      {col.dateFilter ? (
                        <DateFilterButton
                          title={col.label}
                          presets={DATE_PRESETS[col.key] ?? []}
                          selected={dateFilters[col.key] ?? ""}
                          onChange={(v) =>
                            setDateFilters((prev) => {
                              const next = { ...prev };
                              if (v) next[col.key] = v;
                              else delete next[col.key];
                              return next;
                            })
                          }
                        />
                      ) : null}
                    </div>
                    <ColResizeHandle
                      width={widthOf(col.key)}
                      minW={MIN_W}
                      maxW={MAX_W}
                      draggingRef={draggingRef}
                      onResize={(px) => setDraftWidths((d) => ({ ...(d ?? {}), [col.key]: px }))}
                      onResizeEnd={() => {
                        if (draftWidths) writeWidths({ ...storedWidths, ...draftWidths });
                        setDraftWidths(null);
                      }}
                      onReset={() => {
                        writeWidths({ ...storedWidths, [col.key]: DEFAULT_W[col.key] });
                        setDraftWidths(null);
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="[&_td]:border-b [&_td]:border-slate-100 dark:[&_td]:border-slate-800">
            {view.folders.map((f) => {
              const folderCollapsed = collapsed.folders.has(f.folder);
              return (
                <React.Fragment key={f.folder}>
                  {/* g1 — Dự án (folder) */}
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <td colSpan={8} className="overflow-hidden p-0">
                      <div className="sticky left-0 z-[11] inline-flex max-w-[calc(100vw-1rem)] items-center gap-2 bg-slate-100 px-2.5 py-1.5 dark:bg-slate-800">
                        <button
                          type="button"
                          onClick={() => toggleFolder(f.folder)}
                          className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200"
                        >
                          {folderCollapsed ? (
                            <ChevronRight className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                          ) : (
                            <ChevronDown className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                          )}
                          <span className="whitespace-nowrap">{f.folder}</span>
                          <span className="whitespace-nowrap text-xs font-normal text-slate-400 dark:text-slate-500">
                            ({f.sheets.length} sheet · {f.count} gói)
                          </span>
                        </button>
                      </div>
                    </td>
                    <td /><td /><td /><td />
                  </tr>
                  {!folderCollapsed &&
                    f.sheets.map((s) => {
                      const sheetCollapsed = collapsed.sheets.has(s.key);
                      return (
                        <React.Fragment key={s.key}>
                          {/* g2 — Sheet */}
                          <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                            <td colSpan={8} className="overflow-hidden p-0">
                              <div className="sticky left-0 z-[11] inline-flex max-w-[calc(100vw-1rem)] items-center gap-2 bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900">
                                <div style={{ width: widthOf("duAn") }} className="shrink-0" />
                                <button
                                  type="button"
                                  onClick={() => toggleSheet(s.key)}
                                  className="flex items-center gap-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300"
                                >
                                  {sheetCollapsed ? (
                                    <ChevronRight className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                                  ) : (
                                    <ChevronDown className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                                  )}
                                  <span className="whitespace-nowrap">{s.sheetName}</span>
                                  <span className="whitespace-nowrap text-xs font-normal text-slate-400 dark:text-slate-500">
                                    ({s.leaves.length} gói)
                                  </span>
                                </button>
                              </div>
                            </td>
                            <td className={cn(cellPad, "whitespace-nowrap text-xs font-medium text-slate-500 dark:text-slate-400")}>
                              {fmtD(s.start)}
                            </td>
                            <td className={cn(cellPad, "whitespace-nowrap text-xs font-medium text-slate-500 dark:text-slate-400")}>
                              {fmtD(s.pd)}
                            </td>
                            <td /><td />
                          </tr>
                          {!sheetCollapsed &&
                            s.leaves.map((r) => (
                              <tr
                                key={r.id}
                                className="bg-[var(--row-bg)] [--row-bg:var(--background)] hover:[--row-bg:var(--muted)]"
                              >
                                {COLS.map((col) => {
                                  const left = leftOf(col.key);
                                  const frozen = left !== undefined;
                                  return (
                                    <td
                                      key={col.key}
                                      className={cn(
                                        cellPad,
                                        "align-top",
                                        col.tree && "border-l border-slate-100 dark:border-slate-800",
                                      )}
                                      style={
                                        frozen
                                          ? {
                                              position: "sticky",
                                              left,
                                              zIndex: 10,
                                              background: "var(--row-bg)",
                                              ...(col.key === "hoSo" ? { boxShadow: FROZEN_SHADOW } : {}),
                                            }
                                          : undefined
                                      }
                                    >
                                      {renderCell(col, r)}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })}
                </React.Fragment>
              );
            })}
            {view.shown === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="py-12 text-center text-sm text-slate-400">
                  {rows.length === 0
                    ? "Chưa có dữ liệu — bấm 'Tải từ Smartsheet' để đồng bộ lần đầu"
                    : "Không có gói thiết kế phù hợp với bộ lọc"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Nguồn: Smartsheet · Workspace “Viện Thiết Kế” · chỉ đồng bộ dòng có Bộ môn chứa “BIM” · Cây 3
        cấp: Dự án → Sheet → Gói thiết kế · kéo mép phải tiêu đề cột để giãn, nhấp đúp để đặt lại.{" "}
        <button type="button" onClick={() => void runSync(true)} disabled={syncing} className="underline hover:text-foreground disabled:opacity-50">
          Quét lại toàn bộ
        </button>{" "}
        (bỏ qua incremental, đọc lại mọi sheet — dùng khi nghi dữ liệu lệch).
      </p>

      {/* ---- Modal token ---- */}
      <Modal
        open={tokenOpen}
        onClose={() => setTokenOpen(false)}
        title="Token Smartsheet cá nhân"
        description="Token dùng để tải dữ liệu từ workspace Viện Thiết Kế, lưu mã hóa theo tài khoản của bạn."
      >
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Lấy token: vào <strong>Smartsheet</strong> → ảnh đại diện →{" "}
            <strong>Personal Settings</strong> → <strong>API Access</strong> →{" "}
            <strong>Generate new access token</strong>. Tài khoản của bạn phải được share workspace
            “Viện Thiết Kế” (quyền Viewer là đủ).
          </div>
          <Input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={hasToken ? "Đã có token — dán token mới để thay" : "Dán token vào đây"}
            autoComplete="off"
          />
          <div className="flex items-center justify-between gap-2">
            {hasToken ? (
              <Button variant="outline" onClick={() => void onClearToken()} disabled={tokenBusy} className="text-red-600 hover:text-red-700">
                Xóa token
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTokenOpen(false)}>Đóng</Button>
              <Button onClick={() => void onSaveToken()} disabled={tokenBusy || tokenInput.trim().length < 20}>
                {tokenBusy ? "Đang kiểm tra..." : "Kiểm tra & lưu"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------- Nút lọc theo cột + popover (mô phỏng bảng /manage) ----------

/** Khung popover dùng chung: định vị theo nút bấm, đóng khi click ngoài / cuộn / Esc. */
function PopoverShell({
  rect,
  title,
  onClose,
  onClear,
  children,
}: {
  rect: DOMRect;
  title: string;
  onClose: () => void;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const WIDTH = 248;

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onScroll(e: Event) {
      if (ref.current?.contains(e.target as Node)) return;
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

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 12)),
        top: Math.min(rect.bottom + 6, window.innerHeight - 120),
        width: WIDTH,
      }}
      className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</span>
        {onClear ? (
          <button type="button" onClick={onClear} className="text-[11px] font-medium text-slate-400 hover:text-red-600">
            Xóa
          </button>
        ) : null}
      </div>
      {children}
    </div>,
    document.body,
  );
}

/** Nút phễu chung — đo tọa độ nút để popover neo đúng chỗ. */
function FunnelButton({
  active,
  title,
  onOpen,
}: {
  active: boolean;
  title: string;
  onOpen: (box: DOMRect) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      // Phải đo NGAY trong handler: React xóa e.currentTarget trước khi hàm cập nhật state chạy.
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded transition",
        active
          ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
          : "text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700",
      )}
    >
      <Filter className="size-3" strokeWidth={active ? 2.5 : 2} />
    </button>
  );
}

/** Lọc CHỌN-NHIỀU theo danh sách giá trị có thật trong dữ liệu. */
function ColFilterButton({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [q, setQ] = React.useState("");
  const shown = options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);

  return (
    <>
      <FunnelButton
        active={selected.length > 0}
        title={`Lọc theo ${title}`}
        onOpen={(box) => setRect((cur) => (cur ? null : box))}
      />
      {rect ? (
        <PopoverShell
          rect={rect}
          title={title}
          onClose={() => setRect(null)}
          onClear={selected.length > 0 ? () => onChange([]) : undefined}
        >
          {options.length >= 5 ? (
            <div className="relative border-b border-slate-100 p-2 dark:border-slate-800">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm…"
                className="h-7 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-xs outline-none focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400">
            <span>{selected.length ? `${selected.length} đã chọn` : "Chọn giá trị"}</span>
            <span>{shown.length} mục</span>
          </div>
          <ul className="max-h-60 overflow-auto pb-1">
            {shown.map((o) => {
              const on = selected.includes(o);
              return (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => toggle(o)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border",
                        on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 dark:border-slate-600",
                      )}
                    >
                      {on ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate">{o}</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 ? <li className="px-3 py-2 text-xs text-slate-400">Không có kết quả</li> : null}
          </ul>
        </PopoverShell>
      ) : null}
    </>
  );
}

/** Lọc CHỌN-MỘT theo mốc thời gian cho cột ngày (giống phiếu lọc ngày của /manage). */
function DateFilterButton({
  title,
  presets,
  selected,
  onChange,
}: {
  title: string;
  presets: [string, string][];
  selected: string;
  onChange: (v: string) => void;
}) {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const items: [string, string][] = [["", "Tất cả"], ...presets];

  return (
    <>
      <FunnelButton
        active={!!selected}
        title={`Lọc theo ${title}`}
        onOpen={(box) => setRect((cur) => (cur ? null : box))}
      />
      {rect ? (
        <PopoverShell
          rect={rect}
          title={title}
          onClose={() => setRect(null)}
          onClear={selected ? () => onChange("") : undefined}
        >
          <ul className="max-h-72 overflow-auto py-1">
            {items.map(([val, label]) => {
              const on = selected === val;
              return (
                <li key={val || "all"}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(val);
                      setRect(null);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full border",
                        on ? "border-slate-800 dark:border-slate-200" : "border-slate-300 dark:border-slate-600",
                      )}
                    >
                      {on ? <span className="size-2 rounded-full bg-slate-800 dark:bg-slate-200" /> : null}
                    </span>
                    <span className="truncate">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverShell>
      ) : null}
    </>
  );
}
