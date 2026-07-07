"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ProjectReport } from "./project-report";
import { PivotReport } from "./pivot-report";
import { ReportsClient } from "./reports-client";
import type { TaskRow } from "./report-data";
import { TimeReport } from "./time-by-task";
import {
  type PeriodBounds,
  type PeriodType,
  filterByPeriod,
  getBounds,
  getISOWeekYear,
  isoWeeksInYear,
} from "./period-utils";

type TabKey = "overview" | "project" | "group" | "phong" | "person" | "time";
type Tab = { key: TabKey; label: string; isNew?: boolean; sensitive?: boolean };

const TABS: Tab[] = [
  { key: "overview", label: "Tổng quan", isNew: true },
  { key: "project", label: "Theo dự án" },
  { key: "group", label: "Theo nhóm" },
  { key: "phong", label: "Theo phòng" },
  { key: "person", label: "Theo nhân sự", sensitive: true },
  { key: "time", label: "Thời gian theo việc" },
];

const SELF_TABS: TabKey[] = ["overview", "time"];

const PERIOD_TYPES: { key: PeriodType; label: string }[] = [
  { key: "week", label: "Tuần" },
  { key: "month", label: "Tháng" },
  { key: "quarter", label: "Quý" },
  { key: "year", label: "Năm" },
  { key: "all", label: "Tất cả" },
];

function PeriodSelector({
  type,
  year,
  week,
  month,
  quarter,
  bounds,
  onTypeChange,
  onPrev,
  onNext,
  onClear,
  count,
  total,
}: {
  type: PeriodType;
  year: number;
  week: number;
  month: number;
  quarter: number;
  bounds: PeriodBounds | null;
  onTypeChange: (t: PeriodType) => void;
  onPrev: () => void;
  onNext: () => void;
  onClear: () => void;
  count: number;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Type buttons */}
      <div className="flex overflow-hidden rounded-lg border border-slate-200">
        {PERIOD_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTypeChange(t.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              type === t.key
                ? "bg-slate-800 text-white"
                : "bg-card text-slate-600 hover:bg-slate-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Navigator + clear (hiện khi chọn kỳ) */}
      {bounds && (
        <>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Kỳ trước"
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-card hover:bg-slate-50"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="min-w-[200px] text-center text-xs font-semibold text-slate-800">
              {bounds.label}
            </span>
            <button
              type="button"
              onClick={onNext}
              aria-label="Kỳ sau"
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-card hover:bg-slate-50"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          <span className="text-xs text-slate-400">
            {type === "week" && "T2–T7 · "}
            <span className="font-medium text-slate-600">{count}</span>/{total} việc
          </span>

          <button
            type="button"
            onClick={onClear}
            title="Bỏ lọc kỳ"
            className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

export function ReportsTabs({
  rows,
  canViewPerson,
  selfOnly,
  departmentByPerson,
}: {
  rows: TaskRow[];
  canViewPerson: boolean;
  selfOnly: boolean;
  departmentByPerson: Record<string, string>;
}) {
  const tabs = selfOnly
    ? TABS.filter((t) => SELF_TABS.includes(t.key))
    : TABS.filter((t) => !t.sensitive || canViewPerson);
  const [active, setActive] = React.useState<TabKey>("overview");

  // --- Period state ---
  const now = new Date();
  const curISOWeek = getISOWeekYear(now);

  const [periodType, setPeriodType] = React.useState<PeriodType>("week");
  const [year, setYear] = React.useState(curISOWeek.year);
  const [week, setWeek] = React.useState(curISOWeek.week);
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [quarter, setQuarter] = React.useState(Math.ceil((now.getMonth() + 1) / 3));

  const bounds = React.useMemo(
    () => getBounds(periodType, year, week, month, quarter),
    [periodType, year, week, month, quarter],
  );

  const periodRows = React.useMemo(() => filterByPeriod(rows, bounds), [rows, bounds]);

  function handleTypeChange(t: PeriodType) {
    // Reset về kỳ hiện tại khi đổi loại
    const iw = getISOWeekYear(now);
    setPeriodType(t);
    setYear(t === "week" ? iw.year : now.getFullYear());
    setWeek(iw.week);
    setMonth(now.getMonth() + 1);
    setQuarter(Math.ceil((now.getMonth() + 1) / 3));
  }

  function handlePrev() {
    if (periodType === "week") {
      if (week > 1) setWeek((w) => w - 1);
      else {
        setYear((y) => y - 1);
        setWeek(isoWeeksInYear(year - 1));
      }
    } else if (periodType === "month") {
      if (month > 1) setMonth((m) => m - 1);
      else {
        setYear((y) => y - 1);
        setMonth(12);
      }
    } else if (periodType === "quarter") {
      if (quarter > 1) setQuarter((q) => q - 1);
      else {
        setYear((y) => y - 1);
        setQuarter(4);
      }
    } else if (periodType === "year") {
      setYear((y) => y - 1);
    }
  }

  function handleNext() {
    if (periodType === "week") {
      const max = isoWeeksInYear(year);
      if (week < max) setWeek((w) => w + 1);
      else {
        setYear((y) => y + 1);
        setWeek(1);
      }
    } else if (periodType === "month") {
      if (month < 12) setMonth((m) => m + 1);
      else {
        setYear((y) => y + 1);
        setMonth(1);
      }
    } else if (periodType === "quarter") {
      if (quarter < 4) setQuarter((q) => q + 1);
      else {
        setYear((y) => y + 1);
        setQuarter(1);
      }
    } else if (periodType === "year") {
      setYear((y) => y + 1);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab bar + Xuất Excel */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-0.5">
          {tabs.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                  on ? "border-slate-800 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {t.label}
                {t.isNew && (
                  <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Mới</span>
                )}
              </button>
            );
          })}
        </div>
        <a
          href="/api/export/reports"
          className="mb-1.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-card px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download className="size-4" /> Xuất Excel
          {selfOnly ? " (của tôi)" : " (3 báo cáo)"}
        </a>
      </div>

      {/* Bộ lọc lát cắt thời gian — áp dụng cho toàn bộ tab */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5">
        <PeriodSelector
          type={periodType}
          year={year}
          week={week}
          month={month}
          quarter={quarter}
          bounds={bounds}
          onTypeChange={handleTypeChange}
          onPrev={handlePrev}
          onNext={handleNext}
          onClear={() => setPeriodType("all")}
          count={periodRows.length}
          total={rows.length}
        />
        {!bounds && (
          <span className="text-xs text-slate-400">
            Chọn kỳ để lọc dữ liệu toàn bộ tab bên dưới
          </span>
        )}
      </div>

      {/* Tab content — nhận periodRows đã lọc */}
      {active === "overview" ? <ReportsClient rows={periodRows} departmentByPerson={departmentByPerson} /> : null}
      {active === "project" && !selfOnly ? <ProjectReport rows={periodRows} /> : null}
      {active === "group" && !selfOnly ? <PivotReport rows={periodRows} mode="group" /> : null}
      {active === "phong" && !selfOnly ? <PivotReport rows={periodRows} mode="phong" /> : null}
      {active === "person" && canViewPerson ? <PivotReport rows={periodRows} mode="person" /> : null}
      {active === "time" ? <TimeReport rows={periodRows} /> : null}
    </div>
  );
}
