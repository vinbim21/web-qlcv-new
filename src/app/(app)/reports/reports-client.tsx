"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Filter,
  ListChecks,
  Search,
  UserX,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ResultCell } from "@/components/result-cell";
import { Donut, HBars } from "./report-charts";
import {
  buildKpi,
  effStatus,
  PRIO_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  tally,
  type TaskRow,
} from "./report-data";
import {
  type ColDef,
  type ColFilters,
  colActive,
  DateBody,
  fmtDate,
  Kpi,
  MultiBody,
  norm,
  Panel,
  Popover,
  rowMatch,
  STATUS_DOTS,
  StatusPill,
  TextBody,
} from "./report-ui";

const CYAN = "#0891b2";
// Bảng màu cho biểu đồ tròn "Công việc" (cột congViec — cardinality cao hơn duAn/trạng thái).
const CONGVIEC_PALETTE = [
  "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#2563eb", "#ca8a04", "#64748b", "#0d9488", "#be123c",
];

// 5 trường có thể lọc chéo từ biểu đồ: click thường = thay hẳn bộ lọc; giữ Ctrl = nối thêm điều kiện.
type ChartField = "status" | "duAn" | "hangMuc" | "thucHien" | "congViec";
type ChartFilters = Partial<Record<ChartField, string[]>>;

function uniq(rows: TaskRow[], pick: (r: TaskRow) => string): string[] {
  return [...new Set(rows.map(pick).filter((x) => x && x !== "—"))].sort((a, b) => a.localeCompare(b, "vi"));
}

const NO_DEPARTMENT = "Chưa gán bộ phận";

// 1 dòng checkbox dùng chung cho cả 2 tab (Nhân sự / Bộ phận).
function CheckRow({ label, sub, on, onClick }: { label: string; sub?: string; on: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded border",
            on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300",
          )}
        >
          {on && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {sub && <span className="shrink-0 text-xs text-slate-400">{sub}</span>}
      </button>
    </li>
  );
}

// Danh sách nhân sự — 2 tab: "Nhân sự" (checkbox từng người) và "Bộ phận" (checkbox chọn cả bộ phận —
// tick 1 bộ phận = chọn toàn bộ nhân sự thuộc bộ phận đó vào bộ lọc thucHien, đồng thời xổ ra danh sách
// nhân sự trong bộ phận đó để xem/bỏ bớt từng người). Mode + ô tìm kiếm điều khiển từ ngoài (cùng dòng tiêu đề panel).
function PersonCheckList({
  people,
  groupOf,
  counts,
  mode,
  q,
  value,
  onChange,
}: {
  people: string[];
  groupOf: (p: string) => string;
  counts: Record<string, number>;
  mode: "person" | "department";
  q: string;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const sel = value ?? [];
  const togglePerson = (p: string) => onChange(sel.includes(p) ? sel.filter((x) => x !== p) : [...sel, p]);

  const departments = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of people) {
      const g = groupOf(p);
      (m.get(g) ?? m.set(g, []).get(g)!).push(p);
    }
    return [...m.entries()]
      .sort(([a], [b]) => (a === NO_DEPARTMENT ? 1 : b === NO_DEPARTMENT ? -1 : a.localeCompare(b, "vi")))
      .map(([name, members]) => ({ name, members }));
  }, [people, groupOf]);

  const toggleDepartment = (d: { name: string; members: string[] }) => {
    const allIn = d.members.every((m) => sel.includes(m));
    onChange(allIn ? sel.filter((x) => !d.members.includes(x)) : [...new Set([...sel, ...d.members])]);
    setExpanded((prev) => new Set(prev).add(d.name));
  };
  const toggleExpand = (name: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  const filteredPeople = people.filter((p) => norm(p).includes(norm(q)));
  const filteredDepartments = departments.filter((d) => norm(d.name).includes(norm(q)));

  return (
    <div>
      {sel.length > 0 && (
        <div className="mb-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
          >
            {sel.length} đã chọn · Bỏ chọn
          </button>
        </div>
      )}
      <ul className="max-h-[800px] overflow-auto pr-1">
        {mode === "person" &&
          filteredPeople.map((p) => (
            <CheckRow
              key={p}
              label={p}
              sub={`${counts[p] ?? 0} việc`}
              on={sel.includes(p)}
              onClick={() => togglePerson(p)}
            />
          ))}
        {mode === "department" &&
          filteredDepartments.map((d) => {
            const allIn = d.members.every((m) => sel.includes(m));
            const isOpen = expanded.has(d.name);
            const taskCount = d.members.reduce((s, m) => s + (counts[m] ?? 0), 0);
            return (
              <li key={d.name}>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleExpand(d.name)}
                    className="grid size-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleDepartment(d)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border",
                        allIn ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300",
                      )}
                    >
                      {allIn && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {d.members.length} người · {taskCount} việc
                    </span>
                  </button>
                </div>
                {isOpen && (
                  <ul className="ml-6 border-l border-slate-100 pl-1">
                    {d.members.map((m) => (
                      <CheckRow
                        key={m}
                        label={m}
                        sub={`${counts[m] ?? 0} việc`}
                        on={sel.includes(m)}
                        onClick={() => togglePerson(m)}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        {(mode === "person" ? filteredPeople.length : filteredDepartments.length) === 0 && (
          <li className="px-2 py-4 text-center text-xs text-slate-400">Không có kết quả</li>
        )}
      </ul>
    </div>
  );
}

export function ReportsClient({
  rows,
  departmentByPerson,
}: {
  rows: TaskRow[];
  departmentByPerson: Record<string, string>;
}) {
  const groupOfPerson = React.useCallback(
    (p: string) => departmentByPerson[p] ?? NO_DEPARTMENT,
    [departmentByPerson],
  );
  const people = React.useMemo(
    () => [...new Set(rows.flatMap((r) => r.thucHien))].sort((a, b) => a.localeCompare(b, "vi")),
    [rows],
  );
  const [personMode, setPersonMode] = React.useState<"person" | "department">("person");
  const [personQuery, setPersonQuery] = React.useState("");

  const cols: ColDef[] = React.useMemo(
    () => [
      { key: "duAn", label: "Dự án", w: 95, filter: "multi", opts: uniq(rows, (r) => r.duAn), lvl: 1 },
      { key: "loaiHinh", label: "Loại hình", w: 120, filter: "multi", opts: uniq(rows, (r) => r.loaiHinh), lvl: 2 },
      { key: "hangMuc", label: "Hạng mục", w: 125, filter: "multi", opts: uniq(rows, (r) => r.hangMuc), lvl: 3 },
      { key: "congViec", label: "Công việc", w: 190, filter: "multi", opts: uniq(rows, (r) => r.congViec) },
      { key: "giaiDoan", label: "Giai đoạn", w: 110, filter: "multi", opts: uniq(rows, (r) => r.giaiDoan) },
      { key: "boMon", label: "Bộ môn", w: 110, filter: "multi", opts: uniq(rows, (r) => r.boMon) },
      { key: "thucHien", label: "Thực hiện", w: 150, filter: "multi", opts: people },
      { key: "uuTien", label: "Ưu tiên", w: 100, filter: "multi", opts: ["CAO", "TRUNG_BINH", "THAP"], labelMap: PRIO_LABEL },
      { key: "tinhTrang", label: "Tình trạng", w: 140, filter: "status" },
      { key: "batDau", label: "Bắt đầu", w: 110, filter: "date" },
      { key: "ketThuc", label: "Kết thúc", w: 110, filter: "date" },
      { key: "thucTe", label: "Thực tế hoàn thành", w: 158, filter: "date" },
      { key: "soGio", label: "Thời gian", w: 100 },
      { key: "result", label: "Kết quả", w: 120, filter: "text" },
    ],
    [rows, people],
  );

  const [search, setSearch] = React.useState("");
  const [colFilters, setColFilters] = React.useState<ColFilters>({});
  const [open, setOpen] = React.useState<{ key: string; rect: DOMRect } | null>(null);
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" }>({ key: "duAn", dir: "asc" });

  // Cross-filter: click biểu đồ → lọc toàn bộ data. Click thường thay hẳn bộ lọc (chỉ giữ 1 tiêu chí);
  // giữ Ctrl/Cmd khi click sẽ nối thêm điều kiện (giữ các biểu đồ khác đang chọn, OR trong cùng 1 biểu đồ).
  const [chartFilters, setChartFilters] = React.useState<ChartFilters>({});
  function toggleChart(field: ChartField, value: string, chained: boolean) {
    setChartFilters((prev) => {
      if (chained) {
        const cur = new Set(prev[field] ?? []);
        if (cur.has(value)) cur.delete(value);
        else cur.add(value);
        const next = { ...prev };
        if (cur.size) next[field] = [...cur];
        else delete next[field];
        return next;
      }
      const isSolo = Object.keys(prev).length === 1 && prev[field]?.length === 1 && prev[field]![0] === value;
      return isSolo ? {} : { [field]: [value] };
    });
  }
  const setChartValues = (field: ChartField, values: string[]) =>
    setChartFilters((prev) => {
      if (!values.length) {
        const n = { ...prev };
        delete n[field];
        return n;
      }
      return { ...prev, [field]: values };
    });
  const chartFilterEntries = (Object.entries(chartFilters) as [ChartField, string[]][]).filter(([, v]) => v.length > 0);

  const setCF = (k: string, v: string | string[]) => setColFilters((f) => ({ ...f, [k]: v }));
  const clearCol = (k: string) =>
    setColFilters((f) => {
      const n = { ...f };
      delete n[k];
      return n;
    });
  const clearAll = () => {
    setColFilters({});
    setSearch("");
    setChartFilters({});
  };
  const filtered = React.useMemo(() => {
    const q = norm(search.trim());
    return rows.filter((r) => {
      if (q) {
        const hay = norm([r.ma, r.duAn, r.loaiHinh, r.hangMuc, r.congViec, r.giaiDoan, r.boMon, r.thucHien.join(" "), r.result].join(" "));
        if (!hay.includes(q)) return false;
      }
      for (const c of cols) if (!rowMatch(r, c, colFilters[c.key])) return false;
      for (const [field, values] of chartFilterEntries) {
        if (field === "status" && !values.includes(effStatus(r))) return false;
        if (field === "duAn" && !values.includes(r.duAn)) return false;
        if (field === "hangMuc" && !values.includes(r.hangMuc)) return false;
        if (field === "congViec" && !values.includes(r.congViec)) return false;
        if (field === "thucHien" && !values.some((v) => r.thucHien.includes(v))) return false;
      }
      return true;
    });
  }, [rows, search, colFilters, cols, chartFilterEntries]);

  const kpi = React.useMemo(() => buildKpi(filtered), [filtered]);
  const activeCols = cols.filter((c) => colActive(c, colFilters[c.key]));
  const hasAnyFilter = activeCols.length > 0 || !!search || Object.keys(chartFilters).length > 0;
  // Esc (bất kỳ đâu trên trang) → xóa hết bộ lọc, trừ khi popover lọc cột đang mở (để nó tự đóng trước).
  React.useEffect(() => {
    if (!hasAnyFilter || open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clearAll();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasAnyFilter, open]);

  const agg = React.useMemo(() => {
    const sub = filtered;
    const status = STATUS_ORDER.map((s) => ({
      key: s,
      label: STATUS_LABEL[s],
      color: STATUS_COLOR[s],
      value: sub.filter((r) => effStatus(r) === s).length,
    })).filter((s) => s.value > 0);
    const congViec = tally(sub, (r) => r.congViec)
      .slice(0, 10)
      .map((s, i) => ({ key: s.key, label: s.key, color: CONGVIEC_PALETTE[i % CONGVIEC_PALETTE.length], value: s.total }));
    const byDuAn = tally(sub, (r) => r.duAn);
    const hangMucDonut = tally(sub, (r) => r.hangMuc)
      .slice(0, 10)
      .map((s, i) => ({ key: s.key, label: s.key, color: CONGVIEC_PALETTE[i % CONGVIEC_PALETTE.length], value: s.total }));
    return {
      status,
      congViec,
      hangMucDonut,
      byDuAn,
      byThucHien: tally(sub, (r) => r.thucHien),
      count: sub.length,
    };
  }, [filtered]);
  const personCounts = React.useMemo(
    () => Object.fromEntries(agg.byThucHien.map((s) => [s.key, s.total])),
    [agg.byThucHien],
  );

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      if (key === "soGio") return dir === "asc" ? a.hours - b.hours : b.hours - a.hours;
      let va: string;
      let vb: string;
      if (key === "thucHien") {
        va = a.thucHien.join(",");
        vb = b.thucHien.join(",");
      } else if (key === "batDau" || key === "ketThuc" || key === "thucTe") {
        va = a[key] || "9999";
        vb = b[key] || "9999";
      } else if (key === "tinhTrang") {
        va = effStatus(a);
        vb = effStatus(b);
      } else {
        va = (a as unknown as Record<string, string>)[key] || "";
        vb = (b as unknown as Record<string, string>)[key] || "";
      }
      let c = String(va).localeCompare(String(vb), "vi");
      if (c === 0) c = (a.duAn + a.hangMuc + a.congViec + a.giaiDoan).localeCompare(b.duAn + b.hangMuc + b.congViec + b.giaiDoan, "vi");
      return dir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, sort]);
  const toggleSort = (k: string) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  // Xuất Excel — lấy đúng dữ liệu đang lọc/sắp xếp trên màn hình (không phải toàn bộ DB).
  const [exporting, setExporting] = React.useState(false);
  async function handleExport() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Cong viec");
      ws.columns = [
        { header: "Dự án", key: "duAn", width: 14 },
        { header: "Loại hình", key: "loaiHinh", width: 16 },
        { header: "Hạng mục", key: "hangMuc", width: 20 },
        { header: "Công việc", key: "congViec", width: 28 },
        { header: "Giai đoạn", key: "giaiDoan", width: 14 },
        { header: "Bộ môn", key: "boMon", width: 12 },
        { header: "Thực hiện", key: "thucHien", width: 24 },
        { header: "Ưu tiên", key: "uuTien", width: 10 },
        { header: "Tình trạng", key: "tinhTrang", width: 16 },
        { header: "Bắt đầu", key: "batDau", width: 12 },
        { header: "Kết thúc", key: "ketThuc", width: 12 },
        { header: "Thực tế hoàn thành", key: "thucTe", width: 16 },
        { header: "Thời gian (giờ)", key: "hours", width: 14 },
        { header: "Kết quả", key: "result", width: 24 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const r of sorted) {
        ws.addRow({
          duAn: r.duAn === "—" ? "" : r.duAn,
          loaiHinh: r.loaiHinh,
          hangMuc: r.hangMuc,
          congViec: r.congViec,
          giaiDoan: r.giaiDoan,
          boMon: r.boMon,
          thucHien: r.thucHien.join(", "),
          uuTien: PRIO_LABEL[r.uuTien] ?? r.uuTien,
          tinhTrang: STATUS_LABEL[effStatus(r)],
          batDau: fmtDate(r.batDau),
          ketThuc: fmtDate(r.ketThuc),
          thucTe: fmtDate(r.thucTe),
          hours: r.hours || "",
          result: r.result,
        });
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bao-cao-cong-viec-loc-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const openCol = open ? cols.find((c) => c.key === open.key) : null;

  return (
    <div className="grid gap-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={Building2} label="Dự án" value={kpi.projects} sub={`${kpi.hangMuc} hạng mục`} tone="violet" />
        <Kpi icon={ListChecks} label="Tổng việc" value={kpi.total} sub={`${kpi.loaiHinh} loại hình`} />
        <Kpi icon={Check} label="Hoàn thành" value={kpi.done} sub={`${kpi.donePct}% tổng việc`} tone="emerald" />
        <Kpi icon={Activity} label="Đang thực hiện" value={kpi.doing} tone="blue" />
        <Kpi icon={AlertTriangle} label="Quá hạn" value={kpi.overdue} sub={`${kpi.unassigned} việc chưa giao`} tone="red" />
        <Kpi icon={Clock} label="Giờ công" value={kpi.hours.toLocaleString("vi")} sub="ước tính timesheet" tone="amber" />
      </div>

      {/* Lát cắt — mọi biểu đồ click chọn 1 tiêu chí; giữ Ctrl/Cmd để nối thêm bộ lọc khác */}
      <div className="grid grid-cols-3 gap-4">
        <Panel
          title="Danh sách nhân sự"
          right={
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
                {(["person", "department"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPersonMode(m)}
                    className={cn(
                      "rounded px-2.5 py-1 font-medium transition-colors",
                      personMode === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {m === "person" ? "Nhân sự" : "Bộ phận"}
                  </button>
                ))}
              </div>
              <div className="relative w-40">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                  placeholder={personMode === "person" ? "Tìm nhân sự…" : "Tìm bộ phận…"}
                  className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-xs outline-none focus:border-slate-400 focus:bg-white"
                />
              </div>
            </div>
          }
        >
          <PersonCheckList
            people={people}
            groupOf={groupOfPerson}
            counts={personCounts}
            mode={personMode}
            q={personQuery}
            value={chartFilters.thucHien}
            onChange={(v) => setChartValues("thucHien", v)}
          />
        </Panel>
        <Panel title="Danh sách dự án" className="col-span-2">
          <HBars
            data={agg.byDuAn}
            color={CYAN}
            maxRows={20}
            selected={chartFilters.duAn}
            onSelect={(v, chained) => toggleChart("duAn", v, chained)}
          />
        </Panel>
        <Panel title="Công việc">
          <Donut
            segments={agg.congViec}
            size={200}
            thickness={26}
            centerTop={agg.count}
            centerBottom="việc"
            selected={chartFilters.congViec}
            onSelect={(v, chained) => toggleChart("congViec", v, chained)}
            vertical
            legendTitle="Theo đầu việc (top 10)"
          />
        </Panel>
        <Panel title="Trạng thái công việc">
          <Donut
            segments={agg.status}
            size={200}
            thickness={26}
            centerTop={agg.count}
            centerBottom="việc"
            selected={chartFilters.status}
            onSelect={(v, chained) => toggleChart("status", v, chained)}
            vertical
            legendTitle="Tình trạng công việc"
          />
        </Panel>
        <Panel title="Hạng mục">
          <Donut
            segments={agg.hangMucDonut}
            size={200}
            thickness={26}
            centerTop={agg.count}
            centerBottom="việc"
            selected={chartFilters.hangMuc}
            onSelect={(v, chained) => toggleChart("hangMuc", v, chained)}
            vertical
            legendTitle="Theo hạng mục (top 10)"
          />
        </Panel>
      </div>

      {/* Bảng việc */}
      <Panel
        title="Danh sách công việc"
        sub={`${sorted.length} việc · mọi cột đều lọc được`}
        right={
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowDown className="size-3.5" /> {exporting ? "Đang xuất…" : `Xuất Excel (${sorted.length} việc đang lọc)`}
          </button>
        }
        bodyClass="!px-0 !py-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 1350 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold text-slate-500">
                {cols.map((c) => {
                  const on = colActive(c, colFilters[c.key]);
                  const act = sort.key === c.key;
                  return (
                    <th key={c.key} className="sticky top-0 z-20 bg-slate-50/95 px-3 py-2.5 backdrop-blur group" style={{ minWidth: c.w }}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left hover:text-slate-800"
                        >
                          {c.lvl && (
                            <span className="grid size-3.5 shrink-0 place-items-center rounded bg-slate-200 text-[9px] font-bold text-slate-500">
                              {c.lvl}
                            </span>
                          )}
                          <span className="truncate">{c.label}</span>
                          {act ? (
                            sort.dir === "asc" ? (
                              <ArrowUp className="size-3 shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 shrink-0" />
                            )
                          ) : (
                            <ChevronsUpDown className="size-3 shrink-0 opacity-25" />
                          )}
                        </button>
                        {c.filter && (
                          <button
                            type="button"
                            title="Lọc cột này"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setOpen((o) => (o && o.key === c.key ? null : { key: c.key, rect }));
                            }}
                            className={cn(
                              "grid size-5 shrink-0 place-items-center rounded transition",
                              on ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-200 hover:text-slate-600",
                            )}
                          >
                            <Filter className="size-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 200).map((r) => {
                const eff = effStatus(r);
                const late = r.thucTe && r.ketThuc && r.thucTe > r.ketThuc;
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="px-3 py-2 align-top font-medium text-slate-700">
                      {r.duAn === "—" ? <span className="text-slate-300">—</span> : r.duAn}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-600">{r.loaiHinh || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 align-top text-slate-600">{r.hangMuc || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 align-top font-medium text-slate-800">{r.congViec}</td>
                    <td className="px-3 py-2 align-top text-xs text-slate-600">{r.giaiDoan || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 align-top text-xs text-slate-600">{r.boMon || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 align-top text-xs">
                      {r.thucHien.length ? (
                        <span className="text-slate-700">{r.thucHien.join(", ")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <UserX className="size-3" />
                          Chưa giao
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                          r.uuTien === "CAO"
                            ? "bg-red-600 text-white"
                            : r.uuTien === "TRUNG_BINH"
                              ? "bg-amber-500 text-white"
                              : "text-slate-500 ring-1 ring-inset ring-slate-300",
                        )}
                      >
                        {PRIO_LABEL[r.uuTien]}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <StatusPill s={eff} />
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-500">{fmtDate(r.batDau)}</td>
                    <td className="px-3 py-2 align-top text-xs">
                      <span className={eff === "QUA_HAN" ? "font-medium text-red-600" : "text-slate-600"}>{fmtDate(r.ketThuc)}</span>
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {r.thucTe ? (
                        <span className={late ? "font-medium text-red-600" : "text-slate-600"}>
                          {fmtDate(r.thucTe)}
                          {late && " · trễ"}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-center text-xs tabular-nums text-slate-600">
                      {r.hours > 0 ? `${Number.isInteger(r.hours) ? r.hours : r.hours.toFixed(1)} (h)` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 align-top text-xs">
                      <ResultCell taskId={r.id} value={r.result || null} canEdit={false} />
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="py-12 text-center text-sm text-slate-400">
                    Không có việc phù hợp bộ lọc
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sorted.length > 200 && (
          <div className="border-t border-slate-100 px-5 py-2.5 text-center text-xs text-slate-400">
            Hiển thị 200/{sorted.length} việc — Xuất Excel để xem đầy đủ
          </div>
        )}
      </Panel>

      {/* Popover lọc */}
      {open && openCol && (
        <Popover
          rect={open.rect}
          onClose={() => setOpen(null)}
          width={openCol.filter === "multi" && (openCol.opts?.length ?? 0) >= 6 ? 256 : 240}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">{openCol.label}</span>
            {colActive(openCol, colFilters[openCol.key]) && (
              <button
                type="button"
                onClick={() => clearCol(openCol.key)}
                className="text-[11px] font-medium text-slate-400 hover:text-red-600"
              >
                Xóa
              </button>
            )}
          </div>
          {openCol.filter === "text" && (
            <TextBody label={openCol.label} value={colFilters[openCol.key] as string} onChange={(v) => setCF(openCol.key, v)} />
          )}
          {openCol.filter === "multi" && (
            <MultiBody
              opts={openCol.opts ?? []}
              labelMap={openCol.labelMap}
              value={colFilters[openCol.key] as string[]}
              onChange={(v) => setCF(openCol.key, v)}
            />
          )}
          {openCol.filter === "status" && (
            <MultiBody
              opts={[...STATUS_ORDER]}
              labelMap={STATUS_LABEL}
              dots={STATUS_DOTS}
              value={colFilters[openCol.key] as string[]}
              onChange={(v) => setCF(openCol.key, v)}
            />
          )}
          {openCol.filter === "date" && (
            <DateBody
              colKey={openCol.key}
              value={colFilters[openCol.key] as string}
              onChange={(v) => {
                setCF(openCol.key, v);
                setOpen(null);
              }}
            />
          )}
        </Popover>
      )}
    </div>
  );
}
