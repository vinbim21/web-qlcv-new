"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDashed,
  Download,
  ExternalLink,
  KeyRound,
  ListChecks,
  RefreshCw,
  Search,
  UserX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
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
};

type LastSync = {
  at: string;
  userName: string | null;
  sheetCount: number;
  rowCount: number;
} | null;

// ---------- Map trạng thái nguồn → pill (giống STATUS_SOFT của /manage) ----------

type EffStatus = "HOAN_THANH" | "QUA_HAN" | "CHUA_CAP_NHAT";

const STATUS_SOFT: Record<EffStatus, { dot: string; pill: string; label: string }> = {
  HOAN_THANH: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800",
    label: "Hoàn thành",
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

const effStatus = (tinhTrang: string | null): EffStatus =>
  tinhTrang === "Xong" ? "HOAN_THANH" : tinhTrang === "Quá hạn" ? "QUA_HAN" : "CHUA_CAP_NHAT";

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

// Bề rộng cột (px) — 3 cột cây ghim trái giống /manage.
const W = { ma: 92, duAn: 110, sheet: 130, congViec: 230, boMon: 84, chuTri: 125, thucHien: 170, tinhTrang: 150, batDau: 96, pd: 112, ghiChu: 150 };
const TOTAL_MIN_W = Object.values(W).reduce((a, b) => a + b, 0);
const FROZEN_SHADOW = "2px 0 0 rgba(15,23,42,0.06)";
const LEFT = { duAn: 0, sheet: W.duAn, congViec: W.duAn + W.sheet };
const NONE_LEAD = "(trống)";

const cellPad = "px-2.5 py-1.5";

export function SmartsheetClient({
  rows,
  lastSync,
  hasToken,
}: {
  rows: SmartsheetRowDTO[];
  lastSync: LastSync;
  hasToken: boolean;
}) {
  const router = useRouter();

  // ---------- State lọc + cây ----------
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | EffStatus>("");
  const [leadFilter, setLeadFilter] = React.useState("");
  // Gộp 2 cấp thu gọn vào 1 state để mọi thao tác dùng được functional update
  // (bấm Collapse/Expand liên tiếp trước khi render xong vẫn nhảy đúng cấp).
  const [collapsed, setCollapsed] = React.useState<{ folders: Set<string>; sheets: Set<string> }>({
    folders: new Set(),
    sheets: new Set(),
  });

  // ---------- State sync + token ----------
  // phase "prepare": đang tải cây workspace, CHƯA biết mẫu số → thanh chạy vô định.
  // phase "scan":    đã biết tổng → hiện phần trăm thật + thời gian còn lại.
  // `inFlight` = số sheet của lô đang chạy dở → vẽ thành đoạn mờ nối sau phần đã xong,
  // để thanh không đứng im suốt thời gian chờ một lô.
  // `eta` tính sẵn lúc mỗi lô xong (không đọc đồng hồ khi render → hàm render thuần khiết).
  type SyncState =
    | { phase: "prepare" }
    | {
        phase: "scan";
        total: number;
        scanned: number;
        inFlight: number;
        rows: number;
        eta: string | null;
      };
  const [sync, setSync] = React.useState<SyncState | null>(null);
  const syncing = sync !== null;
  const [tokenOpen, setTokenOpen] = React.useState(false);
  const [tokenInput, setTokenInput] = React.useState("");
  const [tokenBusy, setTokenBusy] = React.useState(false);

  // ---------- Dựng cây Dự án (folder) → Sheet → Gói ----------
  const tree = React.useMemo(() => {
    const byFolder = new Map<string, Map<string, SmartsheetRowDTO[]>>();
    for (const r of rows) {
      const sheets = byFolder.get(r.folderName) ?? new Map<string, SmartsheetRowDTO[]>();
      const list = sheets.get(r.sheetName) ?? [];
      list.push(r);
      sheets.set(r.sheetName, list);
      byFolder.set(r.folderName, sheets);
    }
    return [...byFolder.keys()]
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((folder) => {
        const sheets = byFolder.get(folder)!;
        return {
          folder,
          sheets: [...sheets.keys()]
            .sort((a, b) => a.localeCompare(b, "vi"))
            .map((sheetName) => {
              const leaves = sheets
                .get(sheetName)!
                .slice()
                .sort((a, b) => (a.phatHanhPD ?? "9999").localeCompare(b.phatHanhPD ?? "9999"));
              const starts = leaves.map((l) => l.batDau).filter(Boolean).sort() as string[];
              const pds = leaves.map((l) => l.phatHanhPD).filter(Boolean).sort() as string[];
              return {
                key: `${folder}|${sheetName}`,
                sheetName,
                leaves,
                start: starts[0] ?? null,
                pd: pds.length ? pds[pds.length - 1] : null,
              };
            }),
        };
      });
  }, [rows]);

  const allSheetKeys = React.useMemo(() => tree.flatMap((f) => f.sheets.map((s) => s.key)), [tree]);

  // ---------- Chủ trì + KPI ----------
  const leads = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.chuTri?.trim() || NONE_LEAD;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const kpi = React.useMemo(() => {
    let done = 0, late = 0, none = 0;
    for (const r of rows) {
      const s = effStatus(r.tinhTrang);
      if (s === "HOAN_THANH") done++;
      else if (s === "QUA_HAN") late++;
      else none++;
    }
    return { total: rows.length, done, late, none };
  }, [rows]);

  // ---------- Lọc ----------
  const matches = React.useCallback(
    (r: SmartsheetRowDTO) => {
      if (statusFilter && effStatus(r.tinhTrang) !== statusFilter) return false;
      if (leadFilter && (r.chuTri?.trim() || NONE_LEAD) !== leadFilter) return false;
      if (q) {
        const hay = [r.folderName, r.sheetName, r.maGoi, r.hoSo, r.chuTri, r.cbth1, r.cbth2, r.ghiChu]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    },
    [q, statusFilter, leadFilter],
  );

  const view = React.useMemo(() => {
    const folders = tree
      .map((f) => {
        const sheets = f.sheets
          .map((s) => ({ ...s, visibleLeaves: s.leaves.filter(matches) }))
          .filter((s) => s.visibleLeaves.length > 0);
        return {
          ...f,
          visibleSheets: sheets,
          count: sheets.reduce((a, s) => a + s.visibleLeaves.length, 0),
        };
      })
      .filter((f) => f.count > 0);
    return { folders, shown: folders.reduce((a, f) => a + f.count, 0) };
  }, [tree, matches]);

  // ---------- Collapse/Expand TỪNG CẤP (đúng logic /manage) ----------
  // Thu: Sheet trước → rồi Dự án. Xổ: Dự án trước → rồi Sheet.
  const collapseOneLevel = () =>
    setCollapsed((prev) =>
      allSheetKeys.some((k) => !prev.sheets.has(k))
        ? { ...prev, sheets: new Set(allSheetKeys) }
        : { ...prev, folders: new Set(tree.map((f) => f.folder)) },
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
      let rows = 0;
      let denom = total;
      let eta: string | null = null;

      for (;;) {
        setSync({
          phase: "scan",
          total: denom,
          scanned,
          inFlight: Math.min(SMARTSHEET_BATCH_SIZE, denom - scanned),
          rows,
          eta,
        });
        const res = await syncSmartsheetBatch({ logId });
        if (!res.ok) { toast.error(res.error); return; }
        const d = res.data as SyncBatchResult;
        // Mẫu số lấy lại theo remaining thực tế, phòng khi có sheet mới bật cờ giữa chừng.
        scanned += d.processed;
        rows = d.totalRows;
        denom = Math.max(denom, scanned + d.remaining);
        eta =
          scanned > 0 && d.remaining > 0
            ? fmtEta(((denom - scanned) * (Date.now() - startedAt)) / 1000 / scanned)
            : null;
        setSync({ phase: "scan", total: denom, scanned, inFlight: 0, rows, eta });
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

  // Phần trăm + thời gian còn lại (ước lượng theo tốc độ đã đo trong chính phiên này).
  const pct =
    sync?.phase === "scan" && sync.total > 0
      ? Math.min(100, Math.round((sync.scanned / sync.total) * 100))
      : null;
  // Mốc cuối của lô đang chạy dở — vẽ đoạn mờ để thanh luôn "sống" trong lúc chờ server.
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

  // ---------- Ô Ghi chú: nhận diện link ----------
  function noteCell(note: string | null) {
    if (!note) return <span className="text-slate-300 dark:text-slate-600">—</span>;
    const m = note.match(/https?:\/\/\S+/);
    if (m) {
      return (
        <a
          href={m[0]}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="size-3 shrink-0" />
          <span className="truncate">Autodesk Docs</span>
        </a>
      );
    }
    return <span className="text-xs text-muted-foreground">{note}</span>;
  }

  const lastSyncText = lastSync
    ? `${new Date(lastSync.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · ${new Date(lastSync.at).toLocaleDateString("vi-VN")}${lastSync.userName ? ` · ${lastSync.userName}` : ""}`
    : "chưa đồng bộ lần nào";

  const kpiTiles: { key: "" | EffStatus; n: number; label: string; icon: React.ReactNode; cls: string; activeCls: string }[] = [
    { key: "", n: kpi.total, label: "Tổng gói thiết kế", icon: <ListChecks className="size-5" />, cls: "border-blue-200 bg-blue-50 text-blue-700", activeCls: "ring-2 ring-offset-1 ring-blue-400" },
    { key: "HOAN_THANH", n: kpi.done, label: "Hoàn thành", icon: <CheckCircle2 className="size-5" />, cls: "border-green-200 bg-green-50 text-green-700", activeCls: "ring-2 ring-offset-1 ring-green-400" },
    { key: "QUA_HAN", n: kpi.late, label: "Quá hạn", icon: <AlertTriangle className="size-5" />, cls: "border-red-200 bg-red-50 text-red-700", activeCls: "ring-2 ring-offset-1 ring-red-400" },
    { key: "CHUA_CAP_NHAT", n: kpi.none, label: "Chưa cập nhật", icon: <CircleDashed className="size-5" />, cls: "border-violet-200 bg-violet-50 text-violet-700", activeCls: "ring-2 ring-offset-1 ring-violet-400" },
  ];

  return (
    <div className="space-y-4">
      {/* ---- Dòng đếm + nút hành động ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{view.shown}</strong>/{rows.length} gói thiết kế ·{" "}
            {view.folders.length} dự án · Bộ môn: <strong className="text-foreground">BIM</strong>
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
            {/* Nền sáng dần theo % ngay trong nút; giai đoạn chưa biết tổng thì quét ngang vô định */}
            {syncing ? (
              <span
                aria-hidden
                // Dùng primary-foreground (không phải white) để lớp phủ vẫn tương phản ở giao diện tối,
                // nơi nút có nền sáng.
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

      {/* ---- Thanh tiến trình chi tiết (chỉ hiện khi đang đồng bộ) ---- */}
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
            {/* Đoạn mờ = lô đang chạy dở; đoạn đậm = số sheet đã lưu xong vào DB */}
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
            {/* Là TỔNG dòng đang có trong dữ liệu, không phải số tìm được riêng lượt này —
                khi quét lại toàn bộ, dòng cũ vẫn còn cho tới lúc từng sheet được đọc lại. */}
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

      {/* ---- Chip Chủ trì + Collapse/Expand ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-muted-foreground">Chủ trì:</span>
          <button
            type="button"
            onClick={() => setLeadFilter("")}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
              leadFilter === "" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Tất cả
          </button>
          {leads.map(([name, n]) => (
            <button
              key={name}
              type="button"
              onClick={() => setLeadFilter((s) => (s === name ? "" : name))}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                leadFilter === name ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {name} ({n})
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1">
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
          style={{ width: "100%", minWidth: TOTAL_MIN_W, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 }}
        >
          <colgroup>
            <col style={{ width: W.ma }} />
            <col style={{ width: W.duAn }} />
            <col style={{ width: W.sheet }} />
            <col style={{ width: W.congViec }} />
            <col style={{ width: W.boMon }} />
            <col style={{ width: W.chuTri }} />
            <col style={{ width: W.thucHien }} />
            <col style={{ width: W.tinhTrang }} />
            <col style={{ width: W.batDau }} />
            <col style={{ width: W.pd }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <Th>Mã gói</Th>
              <Th frozen left={LEFT.duAn} treeCol>Dự án</Th>
              <Th frozen left={LEFT.sheet} treeCol>Sheet</Th>
              <Th frozen left={LEFT.congViec} treeCol shadow>Công việc (Hồ sơ thiết kế)</Th>
              <Th>Bộ môn</Th>
              <Th>Chủ trì</Th>
              <Th>Thực hiện</Th>
              <Th>Tình trạng</Th>
              <Th>Bắt đầu</Th>
              <Th>Phát hành PD</Th>
              <Th>Ghi chú</Th>
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
                            ({f.visibleSheets.length} sheet)
                          </span>
                        </button>
                      </div>
                    </td>
                    <td /><td /><td />
                  </tr>
                  {!folderCollapsed &&
                    f.visibleSheets.map((s) => {
                      const sheetCollapsed = collapsed.sheets.has(s.key);
                      return (
                        <React.Fragment key={s.key}>
                          {/* g2 — Sheet */}
                          <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                            <td colSpan={8} className="overflow-hidden p-0">
                              <div className="sticky left-0 z-[11] inline-flex max-w-[calc(100vw-1rem)] items-center gap-2 bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900">
                                <div style={{ width: W.duAn }} className="shrink-0" />
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
                                    ({s.visibleLeaves.length} gói)
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
                            <td />
                          </tr>
                          {!sheetCollapsed &&
                            s.visibleLeaves.map((r) => {
                              const st = STATUS_SOFT[effStatus(r.tinhTrang)];
                              const doers = [r.cbth1, r.cbth2].filter(Boolean).join(", ");
                              return (
                                <tr
                                  key={r.id}
                                  className="bg-[var(--row-bg)] [--row-bg:var(--background)] hover:[--row-bg:var(--muted)]"
                                >
                                  <td className={cn(cellPad, "align-top")}>
                                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{r.maGoi ?? "—"}</span>
                                  </td>
                                  <td
                                    className="border-l border-slate-100 dark:border-slate-800"
                                    style={{ position: "sticky", left: LEFT.duAn, zIndex: 10, background: "var(--row-bg)" }}
                                  />
                                  <td
                                    className="border-l border-slate-100 dark:border-slate-800"
                                    style={{ position: "sticky", left: LEFT.sheet, zIndex: 10, background: "var(--row-bg)" }}
                                  />
                                  <td
                                    className={cn(cellPad, "border-l border-slate-100 align-top dark:border-slate-800")}
                                    style={{ position: "sticky", left: LEFT.congViec, zIndex: 10, background: "var(--row-bg)", boxShadow: FROZEN_SHADOW }}
                                  >
                                    <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                      {r.hoSo ?? "(Chưa có tên hồ sơ)"}
                                    </span>
                                  </td>
                                  <td className={cn(cellPad, "align-top")}>
                                    <span className="inline-flex rounded-md border px-2 py-px text-[11px] font-medium text-slate-700 dark:text-slate-200">
                                      {r.boMon ?? "—"}
                                    </span>
                                  </td>
                                  <td className={cn(cellPad, "align-top text-xs text-slate-700 dark:text-slate-200")}>
                                    {r.chuTri ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                                  </td>
                                  <td className={cn(cellPad, "align-top text-xs")}>
                                    {doers ? (
                                      <span className="text-slate-700 dark:text-slate-200">{doers}</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                        <UserX className="size-3" /> Chưa giao
                                      </span>
                                    )}
                                  </td>
                                  <td className={cn(cellPad, "align-top")}>
                                    <span
                                      title={`Giá trị gốc Smartsheet: ${r.tinhTrang || "(trống)"}`}
                                      className={cn(
                                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                                        st.pill,
                                      )}
                                    >
                                      <span className={cn("size-1.5 shrink-0 rounded-full", st.dot)} />
                                      {st.label}
                                    </span>
                                  </td>
                                  <td className={cn(cellPad, "whitespace-nowrap align-top text-[13px] tabular-nums text-slate-600 dark:text-slate-300")}>
                                    {fmtD(r.batDau) ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                                  </td>
                                  <td className={cn(cellPad, "whitespace-nowrap align-top text-[13px] tabular-nums text-slate-600 dark:text-slate-300")}>
                                    {fmtD(r.phatHanhPD) ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                                  </td>
                                  <td className={cn(cellPad, "align-top")}>{noteCell(r.ghiChu)}</td>
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}
                </React.Fragment>
              );
            })}
            {view.shown === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm text-slate-400">
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
        cấp: Dự án → Sheet → Gói thiết kế.{" "}
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

// ---------- Ô tiêu đề (sticky top, có thể ghim trái) ----------
function Th({
  children,
  frozen,
  left,
  shadow,
  treeCol,
}: {
  children: React.ReactNode;
  frozen?: boolean;
  left?: number;
  shadow?: boolean;
  treeCol?: boolean;
}) {
  return (
    <th
      style={{
        position: "sticky",
        top: 0,
        background: "var(--muted)",
        ...(frozen ? { left, zIndex: 30, ...(shadow ? { boxShadow: FROZEN_SHADOW } : {}) } : { zIndex: 20 }),
      }}
      className={cn(
        "select-none border-b border-slate-200 px-2.5 py-2.5 text-left text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400",
        treeCol && "border-l border-slate-100 dark:border-slate-800",
      )}
    >
      <span className="block truncate">{children}</span>
    </th>
  );
}
