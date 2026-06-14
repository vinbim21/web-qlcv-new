"use client";

import { Activity, Clock, GitBranch, Info, ListChecks } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { TaskRow } from "./report-data";
import { Kpi, Panel } from "./report-ui";

export function TimeReport({ rows }: { rows: TaskRow[] }) {
  // Gom giờ công theo Công việc (đầu việc) — chỉ việc có giờ; đối chiếu định mức TB phòng.
  const data = React.useMemo(() => {
    const map = new Map<string, { key: string; lan: number; hours: number }>();
    for (const r of rows) {
      if (!r.hours) continue;
      let o = map.get(r.congViec);
      if (!o) {
        o = { key: r.congViec, lan: 0, hours: 0 };
        map.set(r.congViec, o);
      }
      o.lan++;
      o.hours += r.hours;
    }
    const list = [...map.values()].map((o) => ({ ...o, dinhMuc: o.hours / o.lan })).sort((a, b) => b.hours - a.hours);
    const avgAll = list.reduce((s, r) => s + r.dinhMuc, 0) / (list.length || 1);
    const totalHours = list.reduce((s, r) => s + r.hours, 0);
    const totalLan = list.reduce((s, r) => s + r.lan, 0);
    return { list, avgAll, totalHours, totalLan };
  }, [rows]);

  const { list, avgAll, totalHours, totalLan } = data;

  if (list.length === 0) {
    return (
      <Panel title="Định mức giờ công theo đầu việc">
        <div className="py-10 text-center text-sm text-slate-400">
          Chưa có timesheet nào gắn với công việc — không có dữ liệu định mức.
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={Clock} label="Tổng giờ công" value={Math.round(totalHours).toLocaleString("vi")} tone="amber" />
        <Kpi icon={ListChecks} label="Lượt thực hiện" value={totalLan} />
        <Kpi icon={GitBranch} label="Loại đầu việc" value={list.length} />
        <Kpi icon={Activity} label="Định mức TB" value={`${avgAll.toFixed(1)}h`} sub="giờ / lượt" tone="violet" />
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Info className="size-3.5 text-slate-400" />
        Định mức = tổng giờ công ÷ số lượt thực hiện. So với TB toàn phòng để đánh giá năng suất theo đầu việc.
      </p>

      <Panel
        title="Định mức giờ công theo đầu việc"
        sub={`${list.length} đầu việc · đối chiếu TB phòng ${avgAll.toFixed(1)}h`}
        bodyClass="!px-0 !py-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 820 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5 text-left">Đầu việc</th>
                <th className="px-4 py-2.5 text-center">Số lượt</th>
                <th className="px-4 py-2.5 text-center">Tổng giờ</th>
                <th className="px-4 py-2.5 text-center">Định mức (h/lượt)</th>
                <th className="px-4 py-2.5 text-center">So TB phòng</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const diff = ((r.dinhMuc - avgAll) / avgAll) * 100;
                const slow = diff > 5;
                const fast = diff < -5;
                return (
                  <tr key={r.key} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.key}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-600">{r.lan}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-700">{Math.round(r.hours)}h</td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums text-slate-800">{r.dinhMuc.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          slow
                            ? "bg-red-50 text-red-600 ring-red-200"
                            : fast
                              ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
                              : "bg-slate-50 text-slate-500 ring-slate-200",
                        )}
                      >
                        {diff > 0 ? "+" : ""}
                        {diff.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
