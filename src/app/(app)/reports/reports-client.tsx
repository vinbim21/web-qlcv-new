"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronsUpDown,
  Clock,
  Filter,
  ListChecks,
  RotateCcw,
  Search,
  UserX,
  X,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
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
  chipText,
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

const VIOLET = "#7c3aed";
const BLUE = "#2563eb";
const GREEN = "#16a34a";
const SLATE = "#475569";
const AMBER = "#d97706";
const CYAN = "#0891b2";

function uniq(rows: TaskRow[], pick: (r: TaskRow) => string): string[] {
  return [...new Set(rows.map(pick).filter((x) => x && x !== "—"))].sort((a, b) => a.localeCompare(b, "vi"));
}

export function ReportsClient({ rows }: { rows: TaskRow[] }) {
  const people = React.useMemo(
    () => [...new Set(rows.flatMap((r) => r.thucHien))].sort((a, b) => a.localeCompare(b, "vi")),
    [rows],
  );

  const cols: ColDef[] = React.useMemo(
    () => [
      { key: "duAn", label: "Dự án", w: 150, filter: "multi", opts: uniq(rows, (r) => r.duAn), lvl: 1 },
      { key: "loaiHinh", label: "Loại hình", w: 146, filter: "multi", opts: uniq(rows, (r) => r.loaiHinh), lvl: 2 },
      { key: "hangMuc", label: "Hạng mục", w: 150, filter: "multi", opts: uniq(rows, (r) => r.hangMuc), lvl: 3 },
      { key: "congViec", label: "Công việc", w: 190, filter: "multi", opts: uniq(rows, (r) => r.congViec) },
      { key: "boMon", label: "Bộ môn", w: 110, filter: "multi", opts: uniq(rows, (r) => r.boMon) },
      { key: "thucHien", label: "Thực hiện", w: 150, filter: "multi", opts: people },
      { key: "uuTien", label: "Ưu tiên", w: 100, filter: "multi", opts: ["CAO", "TRUNG_BINH", "THAP"], labelMap: PRIO_LABEL },
      { key: "tinhTrang", label: "Tình trạng", w: 140, filter: "status" },
      { key: "batDau", label: "Bắt đầu", w: 110, filter: "date" },
      { key: "ketThuc", label: "Kết thúc", w: 110, filter: "date" },
      { key: "thucTe", label: "Hoàn thành thực tế", w: 158, filter: "date" },
    ],
    [rows, people],
  );

  const [search, setSearch] = React.useState("");
  const [colFilters, setColFilters] = React.useState<ColFilters>({});
  const [open, setOpen] = React.useState<{ key: string; rect: DOMRect } | null>(null);
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" }>({ key: "duAn", dir: "asc" });

  // Cross-filter kiểu Power BI: click chart segment → lọc toàn bộ data.
  type ChartSel = { field: "status" | "group" | "loaiHinh" | "boMon" | "person" | "duAn"; value: string } | null;
  const [chartSel, setChartSel] = React.useState<ChartSel>(null);
  function toggleChart(field: NonNullable<ChartSel>["field"], value: string) {
    setChartSel((s) => (s?.field === field && s.value === value ? null : { field, value }));
  }

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
    setChartSel(null);
  };

  const filtered = React.useMemo(() => {
    const q = norm(search.trim());
    return rows.filter((r) => {
      if (q) {
        const hay = norm([r.ma, r.duAn, r.loaiHinh, r.hangMuc, r.congViec, r.boMon, r.thucHien.join(" ")].join(" "));
        if (!hay.includes(q)) return false;
      }
      for (const c of cols) if (!rowMatch(r, c, colFilters[c.key])) return false;
      if (chartSel) {
        const { field, value } = chartSel;
        if (field === "status" && effStatus(r) !== value) return false;
        if (field === "group" && r.groupName !== value) return false;
        if (field === "loaiHinh" && r.loaiHinh !== value) return false;
        if (field === "boMon" && r.boMon !== value) return false;
        if (field === "person" && !r.thucHien.includes(value)) return false;
        if (field === "duAn" && r.duAn !== value) return false;
      }
      return true;
    });
  }, [rows, search, colFilters, cols, chartSel]);

  const kpi = React.useMemo(() => buildKpi(filtered), [filtered]);
  const activeCols = cols.filter((c) => colActive(c, colFilters[c.key]));

  const agg = React.useMemo(() => {
    const sub = filtered;
    const status = STATUS_ORDER.map((s) => ({
      key: s,
      label: STATUS_LABEL[s],
      color: STATUS_COLOR[s],
      value: sub.filter((r) => effStatus(r) === s).length,
    })).filter((s) => s.value > 0);
    return {
      status,
      byGroup: tally(sub, (r) => r.groupName),
      byLoaiHinh: tally(sub, (r) => r.loaiHinh),
      byBoMon: tally(sub, (r) => r.boMon),
      byPerson: tally(sub, (r) => (r.thucHien.length ? r.thucHien : ["Chưa giao"])),
      byDuAn: tally(sub, (r) => r.duAn),
      count: sub.length,
    };
  }, [filtered]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    arr.sort((a, b) => {
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
      if (c === 0) c = (a.duAn + a.hangMuc + a.congViec).localeCompare(b.duAn + b.hangMuc + b.congViec, "vi");
      return dir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, sort]);
  const toggleSort = (k: string) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

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

      {/* Tìm + lọc */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm việc theo tên, mã, hạng mục, người thực hiện…"
            className="h-10 w-full rounded-lg border border-slate-200 bg-card pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        {(activeCols.length > 0 || search || chartSel) && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            <RotateCcw className="size-3.5" /> Xóa lọc
          </button>
        )}
      </div>
      {(activeCols.length > 0 || chartSel) && (
        <div className="-mt-1 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
            <Filter className="size-3.5" /> Đang lọc:
          </span>
          {chartSel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 py-1 pl-2.5 pr-1 text-xs shadow-sm">
              <span className="size-2 rounded-full bg-violet-400" />
              <span className="font-medium text-violet-700">{chartSel.value}</span>
              <button
                type="button"
                onClick={() => setChartSel(null)}
                className="grid size-4 place-items-center rounded-full text-violet-400 hover:bg-violet-100 hover:text-violet-700"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {activeCols.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-card py-1 pl-2.5 pr-1 text-xs shadow-sm"
            >
              <span className="text-slate-400">{c.label}:</span>
              <span className="font-medium text-slate-700">{chipText(c, colFilters[c.key])}</span>
              <button
                type="button"
                onClick={() => clearCol(c.key)}
                className="grid size-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <span className="text-xs text-slate-400">· {agg.count} việc khớp</span>
        </div>
      )}

      {/* Lát cắt */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Theo trạng thái" sub={`${agg.count} việc trong phạm vi lọc`}>
          <Donut
            segments={agg.status}
            centerTop={agg.count}
            centerBottom="việc"
            selected={chartSel?.field === "status" ? chartSel.value : null}
            onSelect={(v) => v && toggleChart("status", v)}
          />
        </Panel>
        <Panel title="Theo nhóm công việc">
          <HBars
            data={agg.byGroup}
            color={VIOLET}
            selected={chartSel?.field === "group" ? chartSel.value : null}
            onSelect={(v) => v && toggleChart("group", v)}
          />
        </Panel>
        <Panel title="Theo loại hình công trình">
          <HBars
            data={agg.byLoaiHinh}
            color={BLUE}
            selected={chartSel?.field === "loaiHinh" ? chartSel.value : null}
            onSelect={(v) => v && toggleChart("loaiHinh", v)}
          />
        </Panel>
        <Panel title="Theo bộ môn">
          <HBars
            data={agg.byBoMon}
            color={GREEN}
            selected={chartSel?.field === "boMon" ? chartSel.value : null}
            onSelect={(v) => v && toggleChart("boMon", v)}
          />
        </Panel>
        <Panel title="Số việc theo nhân sự" sub="Top 12">
          <HBars
            data={agg.byPerson}
            color={SLATE}
            maxRows={12}
            selected={chartSel?.field === "person" ? chartSel.value : null}
            onSelect={(v) => v && toggleChart("person", v)}
          />
        </Panel>
        <Panel title="Giờ công theo nhân sự" sub="Top 12">
          <HBars
            data={agg.byPerson.filter((p) => p.key !== "Chưa giao").slice().sort((a, b) => b.hours - a.hours)}
            valueKey="hours"
            color={AMBER}
            maxRows={12}
            unit="h"
            valueFmt={(n) => Math.round(n).toString()}
            selected={chartSel?.field === "person" ? chartSel.value : null}
            onSelect={(v) => v && toggleChart("person", v)}
          />
        </Panel>
        <Panel title="Theo dự án" className="xl:col-span-2">
          <HBars
            data={agg.byDuAn}
            color={CYAN}
            maxRows={20}
            selected={chartSel?.field === "duAn" ? chartSel.value : null}
            onSelect={(v) => v && toggleChart("duAn", v)}
          />
        </Panel>
      </div>

      {/* Bảng việc */}
      <Panel
        title="Danh sách công việc"
        sub={`${sorted.length} việc · mọi cột đều lọc được`}
        right={
          <a
            href="/api/export/tasks"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <ArrowDown className="size-3.5" /> Xuất Excel
          </a>
        }
        bodyClass="!px-0 !py-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 1120 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold text-slate-500">
                {cols.map((c) => {
                  const on = colActive(c, colFilters[c.key]);
                  const act = sort.key === c.key;
                  return (
                    <th key={c.key} className="group px-3 py-2.5" style={{ minWidth: c.w }}>
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
