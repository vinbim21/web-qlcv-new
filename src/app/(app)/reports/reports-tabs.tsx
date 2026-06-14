"use client";

import { Download } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ProjectReport } from "./project-report";
import { PivotReport } from "./pivot-report";
import { ReportsClient } from "./reports-client";
import type { TaskRow } from "./report-data";
import { TimeReport } from "./time-by-task";

type TabKey = "overview" | "project" | "group" | "phong" | "person" | "time";
type Tab = { key: TabKey; label: string; isNew?: boolean; sensitive?: boolean };

const TABS: Tab[] = [
  { key: "overview", label: "Tổng quan" },
  { key: "project", label: "Theo dự án", isNew: true },
  { key: "group", label: "Theo nhóm" },
  { key: "phong", label: "Theo phòng" },
  { key: "person", label: "Theo nhân sự", sensitive: true },
  { key: "time", label: "Thời gian theo việc" },
];

// Cấp 3 (selfOnly): chỉ Tổng quan + Thời gian, dữ liệu của chính mình.
const SELF_TABS: TabKey[] = ["overview", "time"];

export function ReportsTabs({
  rows,
  canViewPerson,
  selfOnly,
}: {
  rows: TaskRow[];
  canViewPerson: boolean;
  selfOnly: boolean;
}) {
  const tabs = selfOnly
    ? TABS.filter((t) => SELF_TABS.includes(t.key))
    : TABS.filter((t) => !t.sensitive || canViewPerson);
  const [active, setActive] = React.useState<TabKey>("overview");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Báo cáo số liệu</h1>
          <p className="text-sm text-slate-500">Module biểu diễn &amp; báo cáo công việc phòng BIM</p>
        </div>
        <a
          href="/api/export/reports"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-card px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download className="size-4" /> Xuất Excel
          {selfOnly ? " (của tôi)" : " (3 báo cáo)"}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200">
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

      {active === "overview" ? <ReportsClient rows={rows} /> : null}
      {active === "project" && !selfOnly ? <ProjectReport rows={rows} /> : null}
      {active === "group" && !selfOnly ? <PivotReport rows={rows} mode="group" /> : null}
      {active === "phong" && !selfOnly ? <PivotReport rows={rows} mode="phong" /> : null}
      {active === "person" && canViewPerson ? <PivotReport rows={rows} mode="person" /> : null}
      {active === "time" ? <TimeReport rows={rows} /> : null}
    </div>
  );
}
