"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  ListChecks,
  UserX,
} from "lucide-react";
import * as React from "react";
import type { TaskRow } from "./report-data";
import { buildKpi, effStatus } from "./report-data";
import type { PeriodBounds } from "./period-utils";
import { fmtDate, Kpi, Panel, StatusPill } from "./report-ui";

export function PeriodReport({
  rows,
  bounds,
}: {
  rows: TaskRow[];
  bounds: PeriodBounds | null;
}) {
  const kpi = React.useMemo(() => buildKpi(rows), [rows]);

  const title = bounds
    ? `Công việc trong ${bounds.label}`
    : "Tất cả công việc";

  const sub = bounds
    ? `${rows.length} việc · bao gồm công việc đang chạy, quá hạn chưa HT và chưa xếp lịch`
    : `${rows.length} việc · không lọc kỳ — chọn Tuần/Tháng/Quý/Năm ở trên để lọc`;

  return (
    <div className="grid gap-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={ListChecks} label="Tổng việc" value={kpi.total} />
        <Kpi icon={Check} label="Hoàn thành" value={kpi.done} sub={`${kpi.donePct}%`} tone="emerald" />
        <Kpi icon={Activity} label="Đang thực hiện" value={kpi.doing} tone="blue" />
        <Kpi icon={AlertTriangle} label="Quá hạn" value={kpi.overdue} tone="red" />
        <Kpi icon={Clock} label="Giờ công" value={kpi.hours.toLocaleString("vi")} tone="amber" />
      </div>

      {/* Bảng công việc */}
      <Panel title={title} sub={sub} bodyClass="!px-0 !py-0">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Không có công việc nào trong kỳ này
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 940 }}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2.5" style={{ minWidth: 140 }}>Dự án</th>
                  <th className="px-3 py-2.5" style={{ minWidth: 140 }}>Hạng mục</th>
                  <th className="px-3 py-2.5" style={{ minWidth: 180 }}>Công việc</th>
                  <th className="px-3 py-2.5" style={{ minWidth: 140 }}>Tình trạng</th>
                  <th className="px-3 py-2.5" style={{ minWidth: 100 }}>Bắt đầu</th>
                  <th className="px-3 py-2.5" style={{ minWidth: 100 }}>Kết thúc</th>
                  <th className="px-3 py-2.5" style={{ minWidth: 130 }}>Thực tế HT</th>
                  <th className="px-3 py-2.5" style={{ minWidth: 160 }}>Người thực hiện</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => {
                  const eff = effStatus(r);
                  const late = r.thucTe && r.ketThuc && r.thucTe > r.ketThuc;
                  return (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="px-3 py-2 align-top text-slate-700">
                        {r.duAn === "—" ? <span className="text-slate-300">—</span> : r.duAn}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-600">
                        {r.hangMuc || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 align-top font-medium text-slate-800">{r.congViec}</td>
                      <td className="px-3 py-2 align-top">
                        <StatusPill s={eff} />
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-500">{fmtDate(r.batDau)}</td>
                      <td className="px-3 py-2 align-top text-xs">
                        <span className={eff === "QUA_HAN" ? "font-medium text-red-600" : "text-slate-600"}>
                          {fmtDate(r.ketThuc)}
                        </span>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 300 && (
          <div className="border-t border-slate-100 px-5 py-2.5 text-center text-xs text-slate-400">
            Hiển thị 300/{rows.length} việc — Xuất Excel để xem đầy đủ
          </div>
        )}
      </Panel>
    </div>
  );
}
