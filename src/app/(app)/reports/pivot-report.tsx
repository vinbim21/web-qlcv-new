"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { StackedBarChart, type StackSeries } from "@/components/charts/stacked-bar-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PHONG_LABEL, PHONG_ORDER, phongOf } from "@/lib/dept-map";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import { effectiveStatus } from "@/lib/task-status";
import { PERIOD_LABEL, PERIOD_TYPES, type PeriodType, periodLabel, periodOf, yearOf } from "@/lib/report-period";

export type ReportRow = {
  id: string;
  groupId: string;
  groupName: string;
  groupOrder: number;
  disciplineCode: string | null;
  status: string;
  priority: string;
  plannedStart: string; // "YYYY-MM-DD" hoặc ""
  plannedEnd: string; // "YYYY-MM-DD" hoặc "" (chưa có hạn)
  assignees: { id: string; name: string }[];
};

/** Trạng thái suy diễn (gồm Quá hạn + nâng Đang thực hiện) cho 1 dòng báo cáo. */
function effOf(r: ReportRow): string {
  return effectiveStatus({
    status: r.status,
    plannedStart: r.plannedStart,
    plannedEnd: r.plannedEnd,
    assigneeCount: r.assignees.length,
  });
}

export type PivotMode = "group" | "phong" | "user";

const STATUS_KEYS = ["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG", "QUA_HAN"] as const;
const STATUS_COLOR: Record<string, string> = {
  CHUA_LAM: "#94a3b8",
  DANG_LAM: "#2563eb",
  HOAN_THANH: "#16a34a",
  TAM_DUNG: "#f59e0b",
  QUA_HAN: "#dc2626",
};
const PRIORITY_KEYS = ["CAO", "TRUNG_BINH", "THAP"] as const;
const NONE_KEY = "__none__";

type Bucket = { key: string; label: string; order: number };

function bucketsOf(row: ReportRow, mode: PivotMode): Bucket[] {
  if (mode === "group") {
    return [{ key: row.groupId, label: row.groupName, order: row.groupOrder }];
  }
  if (mode === "phong") {
    const p = phongOf(row.disciplineCode);
    return p
      ? [{ key: p, label: PHONG_LABEL[p], order: PHONG_ORDER.indexOf(p) }]
      : [{ key: NONE_KEY, label: "Chưa phân phòng", order: 99 }];
  }
  // user — nổ theo từng người được giao (đếm theo lượt giao)
  if (row.assignees.length === 0) {
    return [{ key: NONE_KEY, label: "⚠ Chưa giao", order: Number.MAX_SAFE_INTEGER }];
  }
  return row.assignees.map((a) => ({ key: a.id, label: a.name, order: 0 }));
}

type Agg = {
  key: string;
  label: string;
  order: number;
  total: number;
  status: Record<string, number>;
  priority: Record<string, number>;
};

export function PivotReport({
  rows,
  mode,
  rowHeader,
}: {
  rows: ReportRow[];
  mode: PivotMode;
  rowHeader: string;
}) {
  const years = React.useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      const y = yearOf(r.plannedEnd);
      if (y != null) set.add(y);
    }
    return [...set].sort((a, b) => a - b);
  }, [rows]);

  const defaultYear = years.length ? years[years.length - 1]! : new Date().getFullYear();
  const [type, setType] = React.useState<PeriodType>("month");
  const [year, setYear] = React.useState<number>(defaultYear);
  const byYear = type !== "year";
  const router = useRouter();

  // Link sang /manage lọc đúng chiều (nhóm/phòng/người) + khoảng Hạn khớp scope bảng.
  // byYear → trọn năm đang xem; tất cả-năm → range rộng (ép /manage loại việc không-hạn, khớp báo cáo).
  // NONE_KEY ("Chưa giao"/"Chưa phân phòng") không có đích filter → trả null (để trơ).
  function manageHref(key: string): string | null {
    if (key === NONE_KEY) return null;
    const p = new URLSearchParams();
    if (mode === "group") p.set("group", key);
    else if (mode === "phong") p.set("phong", key);
    else if (mode === "user") p.set("user", key);
    else return null;
    if (byYear) {
      p.set("from", `${year}-01-01`);
      p.set("to", `${year}-12-31`);
    } else {
      p.set("from", "0001-01-01");
      p.set("to", "9999-12-31");
    }
    return `/manage?${p.toString()}`;
  }

  // Việc trong phạm vi đang xem (theo Hạn). type=Năm → toàn bộ (có hạn).
  const inScope = React.useMemo(
    () => rows.filter((r) => (byYear ? yearOf(r.plannedEnd) === year : yearOf(r.plannedEnd) != null)),
    [rows, byYear, year],
  );
  const noDeadline = React.useMemo(() => rows.filter((r) => !r.plannedEnd).length, [rows]);

  // Bảng: gom theo trục (nhóm/phòng/người) cho phạm vi đang xem.
  const aggs = React.useMemo(() => {
    const map = new Map<string, Agg>();
    const add = (rs: ReportRow[]) => {
      for (const r of rs) {
        const eff = effOf(r);
        for (const b of bucketsOf(r, mode)) {
          let a = map.get(b.key);
          if (!a) {
            a = { key: b.key, label: b.label, order: b.order, total: 0, status: {}, priority: {} };
            map.set(b.key, a);
          }
          a.total += 1;
          a.status[eff] = (a.status[eff] ?? 0) + 1;
          a.priority[r.priority] = (a.priority[r.priority] ?? 0) + 1;
        }
      }
    };
    add(inScope);
    return [...map.values()].sort((x, y2) => x.order - y2.order || x.label.localeCompare(y2.label, "vi"));
  }, [inScope, mode]);


  // Biểu đồ: số lượng + tình trạng theo kỳ.
  const chart = React.useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const r of inScope) {
      const p = periodOf(r.plannedEnd, type);
      if (!p) continue;
      let row = map.get(p.idx);
      if (!row) {
        row = {};
        map.set(p.idx, row);
      }
      const eff = effOf(r);
      row[eff] = (row[eff] ?? 0) + 1;
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, counts]) => ({ name: periodLabel(type, idx), ...counts }));
  }, [inScope, type]);

  const series: StackSeries[] = STATUS_KEYS.map((k) => ({
    key: k,
    label: TASK_STATUS_LABEL[k] ?? k,
    color: STATUS_COLOR[k] ?? "#999",
  }));

  const totalRow = React.useMemo(() => {
    const t = { total: 0, status: {} as Record<string, number>, priority: {} as Record<string, number> };
    for (const a of aggs) {
      t.total += a.total;
      for (const k of STATUS_KEYS) t.status[k] = (t.status[k] ?? 0) + (a.status[k] ?? 0);
      for (const k of PRIORITY_KEYS) t.priority[k] = (t.priority[k] ?? 0) + (a.priority[k] ?? 0);
    }
    return t;
  }, [aggs]);

  return (
    <div className="space-y-4">
      {/* Điều khiển kỳ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md border bg-card p-1">
          {PERIOD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                type === t ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {PERIOD_LABEL[t]}
            </button>
          ))}
        </div>
        {byYear ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="grid size-8 place-items-center rounded-md border hover:bg-muted"
              aria-label="Năm trước"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-16 text-center text-sm font-medium">Năm {year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="grid size-8 place-items-center rounded-md border hover:bg-muted"
              aria-label="Năm sau"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Tất cả các năm (theo Hạn)</span>
        )}
      </div>

      {noDeadline > 0 ? (
        <p className="text-xs text-muted-foreground">
          ⚠ {noDeadline} việc <b>chưa có hạn</b> — không tính vào trục thời gian.
        </p>
      ) : null}

      {/* Biểu đồ theo kỳ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Số lượng &amp; tình trạng theo {PERIOD_LABEL[type]} {byYear ? `· ${year}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StackedBarChart data={chart} series={series} />
        </CardContent>
      </Card>

      {/* Bảng theo trục + ưu tiên */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tổng hợp theo {rowHeader} {byYear ? `· năm ${year}` : "· tất cả"} ({inScope.length} việc)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-40">{rowHeader}</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
                {STATUS_KEYS.map((k) => (
                  <TableHead key={k} className="text-right text-xs">
                    {TASK_STATUS_LABEL[k]}
                  </TableHead>
                ))}
                {PRIORITY_KEYS.map((k) => (
                  <TableHead key={k} className="text-right text-xs">
                    {PRIORITY_LABEL[k]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggs.map((a) => {
                const href = manageHref(a.key);
                return (
                <TableRow
                  key={a.key}
                  className={cn(href && "cursor-pointer hover:bg-muted/50")}
                  onClick={href ? () => router.push(href) : undefined}
                >
                  <TableCell className="font-medium">
                    {href ? (
                      <Link
                        href={href}
                        className="text-primary underline-offset-2 hover:underline"
                        title={`Mở ở Quản lý công việc: ${a.label}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.label}
                      </Link>
                    ) : (
                      a.label
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{a.total}</TableCell>
                  {STATUS_KEYS.map((k) => (
                    <TableCell key={k} className="text-right text-sm">
                      {k === "QUA_HAN" && (a.status[k] ?? 0) > 0 ? (
                        <Badge variant="destructive">{a.status[k]}</Badge>
                      ) : (
                        (a.status[k] ?? 0) || <span className="text-muted-foreground">·</span>
                      )}
                    </TableCell>
                  ))}
                  {PRIORITY_KEYS.map((k) => (
                    <TableCell key={k} className="text-right text-sm">
                      {(a.priority[k] ?? 0) || <span className="text-muted-foreground">·</span>}
                    </TableCell>
                  ))}
                </TableRow>
                );
              })}
              {aggs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Không có việc trong phạm vi này
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            {aggs.length > 0 ? (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Tổng cộng</TableCell>
                  <TableCell className="text-right font-semibold">{totalRow.total}</TableCell>
                  {STATUS_KEYS.map((k) => (
                    <TableCell key={k} className="text-right font-medium">
                      {totalRow.status[k] ?? 0}
                    </TableCell>
                  ))}
                  {PRIORITY_KEYS.map((k) => (
                    <TableCell key={k} className="text-right font-medium">
                      {totalRow.priority[k] ?? 0}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
