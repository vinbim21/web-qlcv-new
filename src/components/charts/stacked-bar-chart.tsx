"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type StackSeries = { key: string; label: string; color: string };

/** Biểu đồ cột chồng theo kỳ (số lượng + tình trạng). data: mỗi phần tử là 1 cột (kỳ). */
export function StackedBarChart({
  data,
  series,
  xKey = "name",
  height = 300,
}: {
  data: Array<Record<string, string | number>>;
  series: StackSeries[];
  xKey?: string;
  height?: number;
}) {
  const total = data.reduce(
    (s, d) => s + series.reduce((a, ser) => a + (Number(d[ser.key]) || 0), 0),
    0,
  );
  if (total === 0) {
    return (
      <div className="grid h-64 place-items-center text-sm text-muted-foreground">
        Chưa có dữ liệu
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={36} />
        <Tooltip />
        <Legend />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
