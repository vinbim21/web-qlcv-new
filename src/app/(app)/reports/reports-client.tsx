"use client";

import { Download } from "lucide-react";
import * as React from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, priorityVariant, statusVariant } from "@/lib/labels";

type Opt = { id: string; name: string };
type Bar = { name: string; value: number };

type Row = {
  id: string;
  sumId: string | null;
  name: string;
  workGroupId: string;
  workGroupName: string;
  disciplineId: string | null;
  disciplineName: string | null;
  projectId: string | null;
  projectName: string | null;
  status: string;
  priority: string;
  plannedEnd: string;
  assigneeNames: string[];
};

const STATUS_COLOR: Record<string, string> = {
  CHUA_LAM: "#94a3b8",
  DANG_LAM: "#2563eb",
  HOAN_THANH: "#16a34a",
  TAM_DUNG: "#f59e0b",
  QUA_HAN: "#dc2626",
};

function isOverdue(r: Row): boolean {
  if (!r.plannedEnd || r.status === "HOAN_THANH") return false;
  return new Date(r.plannedEnd) < new Date(new Date().toDateString());
}

export type ReportsClientProps = {
  tasks: Row[];
  workGroups: Opt[];
  disciplines: Opt[];
  projects: Opt[];
  hoursByUser: Bar[];
};

export function ReportsClient({
  tasks,
  workGroups,
  disciplines,
  projects,
  hoursByUser,
}: ReportsClientProps) {
  const [f, setF] = React.useState({ workGroupId: "", projectId: "", disciplineId: "" });

  const filtered = tasks.filter((t) => {
    if (f.workGroupId && t.workGroupId !== f.workGroupId) return false;
    if (f.projectId && t.projectId !== f.projectId) return false;
    if (f.disciplineId && t.disciplineId !== f.disciplineId) return false;
    return true;
  });

  // Theo trạng thái (gồm Quá hạn)
  const statusCounts: Record<string, number> = {
    CHUA_LAM: 0,
    DANG_LAM: 0,
    HOAN_THANH: 0,
    TAM_DUNG: 0,
    QUA_HAN: 0,
  };
  for (const t of filtered) {
    if (isOverdue(t)) statusCounts.QUA_HAN!++;
    else statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  }
  const statusData = Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: TASK_STATUS_LABEL[k] ?? k, value: v, color: STATUS_COLOR[k] ?? "#999" }));

  // Theo nhóm công việc
  const byGroup = new Map<string, number>();
  for (const t of filtered) byGroup.set(t.workGroupName, (byGroup.get(t.workGroupName) ?? 0) + 1);
  const groupData = [...byGroup.entries()].map(([name, value]) => ({ name, value }));

  // Theo nhân sự (đếm việc, mỗi người trong assignees +1)
  const byUser = new Map<string, number>();
  for (const t of filtered)
    for (const n of t.assigneeNames) byUser.set(n, (byUser.get(n) ?? 0) + 1);
  const userData = [...byUser.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  const exportUrl = `/api/export/tasks?${new URLSearchParams({
    workGroupId: f.workGroupId,
    projectId: f.projectId,
    disciplineId: f.disciplineId,
  }).toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{filtered.length} công việc</p>
        <a href={exportUrl} className={buttonVariants({ variant: "outline" })}>
          <Download className="size-4" /> Xuất Excel
        </a>
      </div>

      {/* Bộ lọc */}
      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-3">
        <Select value={f.workGroupId} onChange={(e) => setF({ ...f, workGroupId: e.target.value })}>
          <option value="">— Nhóm công việc —</option>
          {workGroups.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
          <option value="">— Dự án —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={f.disciplineId} onChange={(e) => setF({ ...f, disciplineId: e.target.value })}>
          <option value="">— Bộ môn —</option>
          {disciplines.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={statusData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Theo nhóm công việc</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={groupData} color="#0ea5e9" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Số việc theo nhân sự</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={userData} color="#8b5cf6" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Giờ công theo nhân sự</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={hoursByUser.slice(0, 20)} color="#16a34a" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách công việc</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Công việc</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead>Người thực hiện</TableHead>
                <TableHead>Ưu tiên</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 200).map((t) => {
                const ov = isOverdue(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.sumId ?? "—"}</TableCell>
                    <TableCell className="max-w-xs font-medium">{t.name}</TableCell>
                    <TableCell className="text-xs">{t.workGroupName}</TableCell>
                    <TableCell className="text-xs">{t.assigneeNames.join(", ") || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(ov ? "QUA_HAN" : t.status)}>
                        {ov ? "Quá hạn" : TASK_STATUS_LABEL[t.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length > 200 ? (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              Hiển thị 200/{filtered.length} — dùng "Xuất Excel" để xem đầy đủ
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
