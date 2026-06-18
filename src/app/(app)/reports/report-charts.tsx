"use client";

// Báo cáo — biểu đồ (port từ design_files/baocao-charts.jsx, giữ y nguyên màu/tỉ lệ/nhãn).
import * as React from "react";
import type { EffStatus } from "./report-data";

export type DonutSeg = { key: string; label: string; color: string; value: number };

export function Donut({
  segments,
  size = 188,
  thickness = 26,
  centerTop,
  centerBottom,
  selected,
  onSelect,
  vertical = false,
  legendTitle,
}: {
  segments: DonutSeg[];
  size?: number;
  thickness?: number;
  centerTop: React.ReactNode;
  centerBottom: string;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  vertical?: boolean;
  legendTitle?: string;
}) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const tot = segments.reduce((s, x) => s + x.value, 0) || 1;
  const offsets = segments.reduce<number[]>((acc, _s, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + (segments[i - 1].value / tot) * circ);
    return acc;
  }, []);
  const hasSelection = !!selected;

  const svgEl = (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={vertical ? "-rotate-90" : "shrink-0 -rotate-90"}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
      {segments.map((s, i) => {
        const len = (s.value / tot) * circ;
        const isSelected = selected === s.key;
        return (
          <circle
            key={s.key}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={isSelected ? thickness + 4 : thickness}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-offsets[i]}
            strokeLinecap="butt"
            style={{
              opacity: hasSelection && !isSelected ? 0.25 : 1,
              cursor: onSelect ? "pointer" : "default",
              transition: "opacity 0.15s, stroke-width 0.15s",
            }}
            onClick={() => onSelect?.(isSelected ? null : s.key)}
          >
            <title>{s.label}: {s.value}</title>
          </circle>
        );
      })}
      <text x={c} y={c - 4} textAnchor="middle" transform={`rotate(90 ${c} ${c})`}
        style={{ font: `700 ${Math.round(size * 0.14)}px system-ui`, fill: "#0f172a" }}>
        {centerTop}
      </text>
      <text x={c} y={c + Math.round(size * 0.085)} textAnchor="middle" transform={`rotate(90 ${c} ${c})`}
        style={{ font: `500 ${Math.round(size * 0.058)}px system-ui`, fill: "#64748b" }}>
        {centerBottom}
      </text>
    </svg>
  );

  const legendEl = (
    <div className={vertical ? "w-full" : undefined}>
      {legendTitle && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{legendTitle}</p>
      )}
      <ul className="grid gap-2.5">
        {segments.map((s) => {
          const pct = Math.round((s.value / tot) * 100);
          const isSelected = selected === s.key;
          return (
            <li
              key={s.key}
              className="flex items-center gap-2 text-sm"
              style={{
                opacity: hasSelection && !isSelected ? 0.35 : 1,
                cursor: onSelect ? "pointer" : "default",
                transition: "opacity 0.15s",
              }}
              onClick={() => onSelect?.(isSelected ? null : s.key)}
            >
              <span
                className="size-3 shrink-0 rounded-[3px]"
                style={{ background: s.color, outline: isSelected ? `2px solid ${s.color}` : undefined, outlineOffset: 2 }}
              />
              <span className="min-w-0 flex-1 truncate text-slate-600">{s.label}</span>
              <span className="font-semibold tabular-nums text-slate-800">{s.value}</span>
              <span className="w-9 text-right text-xs tabular-nums text-slate-400">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (vertical) {
    return (
      <div className="flex items-start gap-6">
        {svgEl}
        <div className="flex flex-1 flex-col justify-center self-stretch">{legendEl}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      {svgEl}
      {legendEl}
    </div>
  );
}

export type HBarDatum = { key: string; total: number; hours: number };

export function HBars({
  data,
  color = "#7c3aed",
  valueKey = "total",
  unit = "",
  maxRows = 99,
  valueFmt,
  selected,
  onSelect,
}: {
  data: HBarDatum[];
  color?: string;
  valueKey?: "total" | "hours";
  unit?: string;
  maxRows?: number;
  valueFmt?: (n: number) => string;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
}) {
  const rows = data.slice(0, maxRows);
  const mx = Math.max(1, ...rows.map((d) => d[valueKey]));
  const hasSelection = !!selected;
  if (rows.length === 0) {
    return <div className="grid h-24 place-items-center text-sm text-slate-400">Không có dữ liệu</div>;
  }
  return (
    <ul className="grid gap-1.5">
      {rows.map((d) => {
        const v = d[valueKey];
        const w = Math.max(2, (v / mx) * 100);
        const isSelected = selected === d.key;
        return (
          <li
            key={d.key}
            className="grid grid-cols-[140px_1fr] items-center gap-3 text-sm"
            style={{
              opacity: hasSelection && !isSelected ? 0.3 : 1,
              cursor: onSelect ? "pointer" : "default",
              transition: "opacity 0.15s",
            }}
            onClick={() => onSelect?.(isSelected ? null : d.key)}
          >
            <span className="truncate text-right text-slate-600" title={d.key}
              style={{ fontWeight: isSelected ? 600 : undefined, color: isSelected ? "#0f172a" : undefined }}>
              {d.key}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-5 flex-1 overflow-hidden rounded-[5px] bg-slate-100">
                <div
                  className="h-full rounded-[5px] transition-all"
                  style={{
                    width: w + "%",
                    background: color,
                    outline: isSelected ? `2px solid ${color}` : undefined,
                    outlineOffset: isSelected ? 1 : undefined,
                  }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
                {valueFmt ? valueFmt(v) : v}{unit}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export type StackBucket = { label: string } & Record<EffStatus, number>;

export function StackedBars({
  buckets,
  height = 250,
  colors,
  labels,
}: {
  buckets: StackBucket[];
  height?: number;
  colors: Record<EffStatus, string>;
  labels: Record<EffStatus, string>;
}) {
  const order: EffStatus[] = ["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG", "QUA_HAN"];
  const months = buckets;
  const max = Math.max(1, ...months.map((m) => order.reduce((s, k) => s + m[k], 0)));
  const step = max <= 20 ? 5 : max <= 50 ? 10 : max <= 120 ? 30 : 50;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <div>
      <div className="flex">
        <div className="relative mr-2 w-9 shrink-0" style={{ height }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
              style={{ bottom: (t / top) * height }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-dashed border-slate-200"
              style={{ bottom: (t / top) * height }}
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-1.5 px-1">
            {months.map((m, i) => {
              const colTotal = order.reduce((s, k) => s + m[k], 0);
              return (
                <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
                  {colTotal > 0 && (
                    <div
                      className="mx-auto flex w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-[4px]"
                      style={{ height: (colTotal / top) * height }}
                    >
                      {order.map((k) =>
                        m[k] > 0 ? <div key={k} title={`${labels[k]}: ${m[k]}`} style={{ flex: m[k], background: colors[k] }} /> : null,
                      )}
                    </div>
                  )}
                  {colTotal > 0 && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                      <div className="mb-0.5 font-semibold">
                        {m.label} · {colTotal} việc
                      </div>
                      {order
                        .filter((k) => m[k] > 0)
                        .map((k) => (
                          <div key={k} className="flex items-center gap-1.5">
                            <span className="size-2 rounded-[2px]" style={{ background: colors[k] }} />
                            {labels[k]}: {m[k]}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-11 flex justify-around gap-1.5 px-1 pt-1.5">
        {months.map((m, i) => (
          <span key={i} className="flex-1 text-center text-[11px] text-slate-400">
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MiniLegend({ items }: { items: { label: string; color: string; text?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: it.text || "#475569" }}>
          <span className="size-3 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
