"use client";

import { Download } from "lucide-react";
import * as React from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NormReport, type NormRow } from "./norm-report";
import { PivotReport, type ReportRow } from "./pivot-report";
import { ReportsClient, type ReportsClientProps } from "./reports-client";
import { TimeByTask, type TimeEntry, type TimeTask } from "./time-by-task";

type TabKey = "overview" | "group" | "phong" | "user" | "norm" | "time";
type Tab = { key: TabKey; label: string; sensitive?: boolean };

const TABS: Tab[] = [
  { key: "overview", label: "Tổng quan" },
  { key: "group", label: "Theo nhóm" },
  { key: "phong", label: "Theo phòng" },
  { key: "user", label: "Theo nhân sự", sensitive: true },
  { key: "norm", label: "Định mức", sensitive: true },
  { key: "time", label: "Thời gian theo việc", sensitive: true },
];

export function ReportsTabs({
  overview,
  rows,
  normRows,
  normCts,
  timeTasks,
  timeEntries,
  unattributedHours,
  canViewPerson,
}: {
  overview: ReportsClientProps;
  rows: ReportRow[];
  normRows: NormRow[];
  normCts: string[];
  timeTasks: TimeTask[];
  timeEntries: TimeEntry[];
  unattributedHours: number;
  canViewPerson: boolean;
}) {
  const tabs = TABS.filter((t) => !t.sensitive || canViewPerson);
  const [active, setActive] = React.useState<TabKey>("overview");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Báo cáo số liệu</h1>
          <p className="text-sm text-muted-foreground">Module biểu diễn &amp; báo cáo công việc phòng BIM</p>
        </div>
        <a href="/api/export/reports" className={buttonVariants({ variant: "outline" })}>
          <Download className="size-4" /> Xuất Excel{canViewPerson ? " (4 báo cáo)" : " (BC1-3)"}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "overview" ? <ReportsClient {...overview} /> : null}
      {active === "group" ? <PivotReport rows={rows} mode="group" rowHeader="Nhóm công việc" /> : null}
      {active === "phong" ? <PivotReport rows={rows} mode="phong" rowHeader="Phòng" /> : null}
      {active === "user" && canViewPerson ? (
        <PivotReport rows={rows} mode="user" rowHeader="Nhân sự" />
      ) : null}
      {active === "norm" && canViewPerson ? <NormReport rows={normRows} cts={normCts} /> : null}
      {active === "time" && canViewPerson ? (
        <TimeByTask tasks={timeTasks} entries={timeEntries} unattributedHours={unattributedHours} />
      ) : null}
    </div>
  );
}
