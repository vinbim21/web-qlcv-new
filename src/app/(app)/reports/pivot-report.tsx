"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";
import { PHONG_LABEL, PHONG_ORDER, phongOf } from "@/lib/dept-map";
import { PERIOD_LABEL, type PeriodType, periodLabel, periodOf, yearOf } from "@/lib/report-period";
import { MiniLegend, type StackBucket, StackedBars } from "./report-charts";
import { distinctYears, effStatus, STATUS_COLOR, STATUS_LABEL, type EffStatus, type TaskRow } from "./report-data";
import { Panel } from "./report-ui";

type Mode = "group" | "phong" | "person";
const NONE_KEY = "__none__";

const STATUS_LEGEND = [
  { label: "Chưa làm", color: STATUS_COLOR.CHUA_LAM },
  { label: "Hoàn thành", color: STATUS_COLOR.HOAN_THANH, text: STATUS_COLOR.HOAN_THANH },
  { label: "Quá hạn", color: STATUS_COLOR.QUA_HAN, text: STATUS_COLOR.QUA_HAN },
  { label: "Tạm dừng", color: STATUS_COLOR.TAM_DUNG, text: STATUS_COLOR.TAM_DUNG },
  { label: "Đang thực hiện", color: STATUS_COLOR.DANG_LAM, text: STATUS_COLOR.DANG_LAM },
];

type Bucket = { key: string; label: string; order: number };
function bucketsOf(r: TaskRow, mode: Mode): Bucket[] {
  if (mode === "group") return [{ key: r.groupId, label: r.groupName, order: r.groupOrder }];
  if (mode === "phong") {
    const p = phongOf(r.boMonCode);
    return p ? [{ key: p, label: PHONG_LABEL[p], order: PHONG_ORDER.indexOf(p) }] : [{ key: NONE_KEY, label: "Chưa phân phòng", order: 99 }];
  }
  if (r.thucHien.length === 0) return [{ key: NONE_KEY, label: "⚠ Chưa giao", order: Number.MAX_SAFE_INTEGER }];
  return r.thucHien.map((name, i) => ({ key: r.thucHienIds[i] ?? name, label: name, order: 0 }));
}

type Agg = {
  key: string;
  label: string;
  order: number;
  total: number;
  status: Record<string, number>;
  priority: Record<string, number>;
};

const STATUS_KEYS: EffStatus[] = ["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG", "QUA_HAN"];
const PRIO_KEYS = ["CAO", "TRUNG_BINH", "THAP"] as const;

const AXIS_LABEL: Record<Mode, string> = { group: "Nhóm công việc", phong: "Phòng / Bộ môn", person: "Nhân sự" };
const TITLE: Record<Mode, string> = { group: "Tổng hợp theo Nhóm công việc", phong: "Tổng hợp theo Phòng", person: "Tổng hợp theo Nhân sự" };

export function PivotReport({ rows, mode }: { rows: TaskRow[]; mode: Mode }) {
  const router = useRouter();
  const years = React.useMemo(() => distinctYears(rows), [rows]);
  const year = years.length ? years[years.length - 1] : new Date().getFullYear();
  const type: PeriodType = "month";

  const inScope = React.useMemo(
    () => rows.filter((r) => yearOf(r.ketThuc) === year),
    [rows, year],
  );
  const noDeadline = React.useMemo(() => rows.filter((r) => !r.ketThuc).length, [rows]);

  // Biểu đồ cột chồng theo kỳ.
  const buckets: StackBucket[] = React.useMemo(() => {
    const map = new Map<number, StackBucket>();
    for (const r of inScope) {
      const p = periodOf(r.ketThuc, type);
      if (!p) continue;
      let b = map.get(p.idx);
      if (!b) {
        b = { label: periodLabel(type, p.idx), CHUA_LAM: 0, DANG_LAM: 0, HOAN_THANH: 0, TAM_DUNG: 0, QUA_HAN: 0 };
        map.set(p.idx, b);
      }
      b[effStatus(r)]++;
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }, [inScope, type]);

  // Bảng pivot theo trục.
  const aggs = React.useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of inScope) {
      const eff = effStatus(r);
      for (const b of bucketsOf(r, mode)) {
        let a = map.get(b.key);
        if (!a) {
          a = { key: b.key, label: b.label, order: b.order, total: 0, status: {}, priority: {} };
          map.set(b.key, a);
        }
        a.total += 1;
        a.status[eff] = (a.status[eff] ?? 0) + 1;
        a.priority[r.uuTien] = (a.priority[r.uuTien] ?? 0) + 1;
      }
    }
    return [...map.values()].sort((x, y) => x.order - y.order || x.label.localeCompare(y.label, "vi"));
  }, [inScope, mode]);

  const totals = React.useMemo(() => {
    const t = { total: 0, status: {} as Record<string, number>, priority: {} as Record<string, number> };
    for (const a of aggs) {
      t.total += a.total;
      for (const k of STATUS_KEYS) t.status[k] = (t.status[k] ?? 0) + (a.status[k] ?? 0);
      for (const k of PRIO_KEYS) t.priority[k] = (t.priority[k] ?? 0) + (a.priority[k] ?? 0);
    }
    return t;
  }, [aggs]);

  function manageHref(key: string): string | null {
    if (key === NONE_KEY) return null;
    const p = new URLSearchParams();
    if (mode === "group") p.set("group", key);
    else if (mode === "phong") p.set("phong", key);
    else p.set("user", key);
    p.set("from", `${year}-01-01`);
    p.set("to", `${year}-12-31`);
    return `/manage?${p.toString()}`;
  }

  const num = (n: number, red = false) =>
    n ? (
      red ? (
        <span className="inline-flex min-w-[22px] items-center justify-center rounded-md bg-red-600 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
          {n}
        </span>
      ) : (
        <span className="tabular-nums text-slate-700">{n}</span>
      )
    ) : (
      <span className="text-slate-300">·</span>
    );

  return (
    <div className="grid gap-4">
      {noDeadline > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <AlertCircle className="size-3.5 text-amber-500" />
          <span>
            <span className="font-semibold">{noDeadline} việc chưa có hạn</span> — không tính vào trục thời gian.
          </span>
        </p>
      )}

      {/* Biểu đồ cột chồng */}
      <Panel title={`Số lượng & tình trạng theo ${PERIOD_LABEL[type]} · ${year}`}>
        {buckets.length ? (
          <>
            <StackedBars buckets={buckets} colors={STATUS_COLOR} labels={STATUS_LABEL} height={250} />
            <div className="mt-4">
              <MiniLegend items={STATUS_LEGEND} />
            </div>
          </>
        ) : (
          <div className="grid h-40 place-items-center text-sm text-slate-400">Không có việc có hạn trong phạm vi</div>
        )}
      </Panel>

      {/* Bảng pivot */}
      <Panel title={`${TITLE[mode]} · năm ${year} (${inScope.length} việc)`} bodyClass="!px-0 !py-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 920 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5 text-left">{AXIS_LABEL[mode]}</th>
                <th className="px-3 py-2.5 text-center">Tổng</th>
                <th className="px-3 py-2.5 text-center">Chưa làm</th>
                <th className="px-3 py-2.5 text-center">Đang TH</th>
                <th className="px-3 py-2.5 text-center">Hoàn thành</th>
                <th className="px-3 py-2.5 text-center">Tạm dừng</th>
                <th className="px-3 py-2.5 text-center">Quá hạn</th>
                <th className="px-3 py-2.5 text-center">Cao</th>
                <th className="px-3 py-2.5 text-center">Trung bình</th>
                <th className="px-3 py-2.5 text-center">Thấp</th>
              </tr>
            </thead>
            <tbody>
              {aggs.map((a) => {
                const href = manageHref(a.key);
                return (
                  <tr
                    key={a.key}
                    className={cn("border-b border-slate-100 hover:bg-slate-50/70", href && "cursor-pointer")}
                    onClick={href ? () => router.push(href) : undefined}
                  >
                    <td className="px-3 py-3 font-medium text-slate-800">
                      {href ? <span className="text-primary underline-offset-2 hover:underline">{a.label}</span> : a.label}
                    </td>
                    <td className="px-3 py-3 text-center font-semibold tabular-nums text-slate-800">{a.total}</td>
                    <td className="px-3 py-3 text-center">{num(a.status.CHUA_LAM ?? 0)}</td>
                    <td className="px-3 py-3 text-center">{num(a.status.DANG_LAM ?? 0)}</td>
                    <td className="px-3 py-3 text-center">{num(a.status.HOAN_THANH ?? 0)}</td>
                    <td className="px-3 py-3 text-center">{num(a.status.TAM_DUNG ?? 0)}</td>
                    <td className="px-3 py-3 text-center">{num(a.status.QUA_HAN ?? 0, true)}</td>
                    <td className="px-3 py-3 text-center">{num(a.priority.CAO ?? 0)}</td>
                    <td className="px-3 py-3 text-center">{num(a.priority.TRUNG_BINH ?? 0)}</td>
                    <td className="px-3 py-3 text-center">{num(a.priority.THAP ?? 0)}</td>
                  </tr>
                );
              })}
              {aggs.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-sm text-slate-400">
                    Không có việc trong phạm vi này
                  </td>
                </tr>
              )}
              {aggs.length > 0 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-3 py-3">Tổng cộng</td>
                  <td className="px-3 py-3 text-center tabular-nums">{totals.total}</td>
                  {STATUS_KEYS.map((k) => (
                    <td key={k} className={cn("px-3 py-3 text-center tabular-nums", k === "QUA_HAN" && "text-red-600")}>
                      {totals.status[k] ?? 0}
                    </td>
                  ))}
                  {PRIO_KEYS.map((k) => (
                    <td key={k} className="px-3 py-3 text-center tabular-nums">
                      {totals.priority[k] ?? 0}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
