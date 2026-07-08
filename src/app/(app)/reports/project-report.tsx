"use client";

import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  Layers,
  ListChecks,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { HBars } from "./report-charts";
import { buildProjects, STATUS_ORDER, type TaskRow } from "./report-data";
import { Kpi, Panel, StatusMiniBar } from "./report-ui";

function StatCell({ n, red = false }: { n: number; red?: boolean }) {
  if (!n) return <td className="px-3 py-3 text-center text-slate-300">·</td>;
  return (
    <td className="px-3 py-3 text-center">
      {red ? (
        <span className="inline-flex min-w-[22px] items-center justify-center rounded-md bg-red-600 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
          {n}
        </span>
      ) : (
        <span className="font-medium tabular-nums text-slate-700">{n}</span>
      )}
    </td>
  );
}

export function ProjectReport({ rows }: { rows: TaskRow[] }) {
  const { projects, unassignedTasks } = React.useMemo(() => buildProjects(rows), [rows]);
  const [openSet, setOpenSet] = React.useState<Set<string>>(() => new Set());
  const toggle = (name: string) =>
    setOpenSet((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  const allOpen = projects.length > 0 && openSet.size === projects.length;
  const toggleAll = () => setOpenSet(allOpen ? new Set() : new Set(projects.map((p) => p.duAn)));

  const totals = projects.reduce(
    (a, p) => {
      a.hangMuc += p.hangMucCount;
      a.total += p.total;
      for (const k of STATUS_ORDER) a[k] += p[k];
      return a;
    },
    { hangMuc: 0, total: 0, hours: 0, CHUA_LAM: 0, DANG_LAM: 0, HOAN_THANH: 0, TAM_DUNG: 0, QUA_HAN: 0 },
  );
  const avgHangMuc = projects.length ? (totals.hangMuc / projects.length).toFixed(1) : "0";
  const avgViec = projects.length ? (totals.total / projects.length).toFixed(0) : "0";
  const donePct = totals.total ? Math.round((totals.HOAN_THANH / totals.total) * 100) : 0;

  return (
    <div className="grid gap-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={Building2} label="Số dự án" value={projects.length} sub={`${unassignedTasks} việc chưa thuộc dự án`} tone="violet" />
        <Kpi icon={Layers} label="Tổng hạng mục" value={totals.hangMuc} sub={`TB ${avgHangMuc} hạng mục/dự án`} />
        <Kpi icon={ListChecks} label="Tổng việc (có dự án)" value={totals.total} sub={`TB ${avgViec} việc/dự án`} />
        <Kpi icon={Check} label="Hoàn thành" value={totals.HOAN_THANH} sub={`${donePct}%`} tone="emerald" />
        <Kpi icon={AlertTriangle} label="Quá hạn" value={totals.QUA_HAN} sub="trong các dự án" tone="red" />
      </div>

      {/* 2 lát cắt */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Khối lượng việc theo dự án" sub="Tổng số việc trong mỗi dự án">
          <HBars data={projects.map((p) => ({ key: p.duAn, total: p.total, hours: p.hours }))} color="#0891b2" />
        </Panel>
        <Panel title="Số hạng mục theo dự án">
          <HBars data={projects.map((p) => ({ key: p.duAn, total: p.hangMucCount, hours: 0 }))} color="#7c3aed" />
        </Panel>
      </div>

      {/* Bảng drill-down */}
      <Panel
        title="Tổng hợp theo Dự án → Hạng mục"
        sub="Bấm vào dự án để xem chi tiết hạng mục & tình trạng"
        right={
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {allOpen ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
            {allOpen ? "Thu gọn" : "Mở tất cả"}
          </button>
        }
        bodyClass="!px-0 !py-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 980 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5 text-left">Dự án / Hạng mục</th>
                <th className="px-3 py-2.5 text-center">Hạng mục</th>
                <th className="px-3 py-2.5 text-center">Tổng việc</th>
                <th className="px-3 py-2.5 text-left" style={{ width: 150 }}>
                  Tình trạng
                </th>
                <th className="px-3 py-2.5 text-center">Chưa thực hiện</th>
                <th className="px-3 py-2.5 text-center">Đang TH</th>
                <th className="px-3 py-2.5 text-center">Hoàn thành</th>
                <th className="px-3 py-2.5 text-center">Quá hạn</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const open = openSet.has(p.duAn);
                return (
                  <React.Fragment key={p.duAn}>
                    <tr
                      className={cn("cursor-pointer border-b border-slate-100 hover:bg-slate-50", open ? "bg-slate-50/60" : "bg-card")}
                      onClick={() => toggle(p.duAn)}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={cn("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-90")} />
                          <Building2 className="size-4 shrink-0 text-violet-500" />
                          <span className="font-semibold text-slate-800">{p.duAn}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-medium tabular-nums text-slate-700">{p.hangMucCount}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-semibold tabular-nums text-slate-800">{p.total}</span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusMiniBar row={p} />
                      </td>
                      <StatCell n={p.CHUA_LAM} />
                      <StatCell n={p.DANG_LAM} />
                      <StatCell n={p.HOAN_THANH} />
                      <StatCell n={p.QUA_HAN} red={p.QUA_HAN > 0} />
                    </tr>
                    {open &&
                      p.hangMuc.map((h) => (
                        <tr key={p.duAn + h.name} className="border-b border-slate-100 bg-slate-50/40 text-[13px] hover:bg-slate-100/50">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2 pl-7">
                              <CornerDownRight className="size-3.5 shrink-0 text-slate-300" />
                              <span className="text-slate-700">{h.name}</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{h.loaiHinh}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-300">·</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="font-medium tabular-nums text-slate-600">{h.total}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusMiniBar row={h} w={110} />
                          </td>
                          <StatCell n={h.CHUA_LAM} />
                          <StatCell n={h.DANG_LAM} />
                          <StatCell n={h.HOAN_THANH} />
                          <StatCell n={h.QUA_HAN} red={h.QUA_HAN > 0} />
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <td className="px-3 py-3">Tổng cộng · {projects.length} dự án</td>
                <td className="px-3 py-3 text-center tabular-nums">{totals.hangMuc}</td>
                <td className="px-3 py-3 text-center tabular-nums">{totals.total}</td>
                <td className="px-3 py-3">
                  <StatusMiniBar row={totals} />
                </td>
                <td className="px-3 py-3 text-center tabular-nums">{totals.CHUA_LAM}</td>
                <td className="px-3 py-3 text-center tabular-nums">{totals.DANG_LAM}</td>
                <td className="px-3 py-3 text-center tabular-nums">{totals.HOAN_THANH}</td>
                <td className="px-3 py-3 text-center tabular-nums text-red-600">{totals.QUA_HAN}</td>
              </tr>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    Chưa có dự án nào có công việc
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
