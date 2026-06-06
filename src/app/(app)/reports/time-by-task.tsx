"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, removeVietnameseTones } from "@/lib/utils";

export type TimeTask = {
  id: string;
  sumId: string | null;
  name: string;
  groupName: string;
  projectName: string | null;
  plannedStart: string;
  plannedEnd: string;
  deleted: boolean;
  deptNorm: number | null; // giờ TB/lần của đầu việc (BC4), null nếu không có benchmark
};

export type TimeEntry = {
  taskId: string;
  userName: string;
  date: string; // "YYYY-MM-DD"
  hours: number;
};

function fmt(n: number): string {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

type Agg = {
  hours: number;
  users: Map<string, number>;
  dateHours: Map<string, number>;
  minD: string;
  maxD: string;
};

export function TimeByTask({
  tasks,
  entries,
  unattributedHours,
  selfOnly = false,
}: {
  tasks: TimeTask[];
  entries: TimeEntry[];
  unattributedHours: number;
  selfOnly?: boolean;
}) {
  const taskMeta = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const users = React.useMemo(
    () => [...new Set(entries.map((e) => e.userName))].sort((a, b) => a.localeCompare(b, "vi")),
    [entries],
  );
  const projects = React.useMemo(
    () => [...new Set(tasks.map((t) => t.projectName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "vi")),
    [tasks],
  );
  const groups = React.useMemo(
    () => [...new Set(tasks.map((t) => t.groupName))].sort((a, b) => a.localeCompare(b, "vi")),
    [tasks],
  );

  const [fUser, setFUser] = React.useState("");
  const [fProject, setFProject] = React.useState("");
  const [fGroup, setFGroup] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [q, setQ] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  // Gom giờ theo việc từ các entry đã lọc (người + khoảng ngày).
  const aggByTask = React.useMemo(() => {
    const m = new Map<string, Agg>();
    for (const e of entries) {
      if (fUser && e.userName !== fUser) continue;
      if (dateFrom && e.date < dateFrom) continue;
      if (dateTo && e.date > dateTo) continue;
      let a = m.get(e.taskId);
      if (!a) {
        a = { hours: 0, users: new Map(), dateHours: new Map(), minD: e.date, maxD: e.date };
        m.set(e.taskId, a);
      }
      a.hours += e.hours;
      a.users.set(e.userName, (a.users.get(e.userName) ?? 0) + e.hours);
      a.dateHours.set(e.date, (a.dateHours.get(e.date) ?? 0) + e.hours);
      if (e.date < a.minD) a.minD = e.date;
      if (e.date > a.maxD) a.maxD = e.date;
    }
    return m;
  }, [entries, fUser, dateFrom, dateTo]);

  const rows = React.useMemo(() => {
    const qn = removeVietnameseTones(q.trim());
    const out: Array<{ task: TimeTask; agg: Agg }> = [];
    for (const [taskId, agg] of aggByTask) {
      const task = taskMeta.get(taskId);
      if (!task) continue;
      if (fProject && task.projectName !== fProject) continue;
      if (fGroup && task.groupName !== fGroup) continue;
      if (qn && !removeVietnameseTones(`${task.sumId ?? ""} ${task.name}`).includes(qn)) continue;
      out.push({ task, agg });
    }
    return out.sort((a, b) => b.agg.hours - a.agg.hours);
  }, [aggByTask, taskMeta, fProject, fGroup, q]);

  const totalShown = rows.reduce((s, r) => s + r.agg.hours, 0);

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Chưa có timesheet nào gắn với công việc — không có dữ liệu thời gian theo việc.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Select value={fProject} onChange={(e) => setFProject(e.target.value)}>
          <option value="">— Dự án —</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
        <Select value={fGroup} onChange={(e) => setFGroup(e.target.value)}>
          <option value="">— Nhóm —</option>
          {groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </Select>
        {/* selfOnly (Cấp 3): chỉ dữ liệu của chính mình nên ẩn bộ lọc Nhân sự. */}
        {selfOnly ? null : (
          <Select value={fUser} onChange={(e) => setFUser(e.target.value)}>
            <option value="">— Nhân sự —</option>
            {users.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        )}
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Từ ngày" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Đến ngày" />
        <Input placeholder="Tìm mã / tên việc..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          <p className="pb-3 text-xs text-muted-foreground">
            Tổng giờ công (man-hours) theo từng công việc{dateFrom || dateTo ? " trong khoảng đã chọn" : ""}.
            Bấm một dòng để xem tách theo người &amp; ngày. ({rows.length} việc · {fmt(totalShown)} giờ)
            {unattributedHours > 0 ? (
              <span className="ml-1 text-amber-600">⚠ {fmt(unattributedHours)} giờ chưa gắn việc (không hiện ở đây).</span>
            ) : null}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead>Mã</TableHead>
                <TableHead>Công việc</TableHead>
                <TableHead className="text-right">Tổng giờ</TableHead>
                <TableHead className="text-right">Số người</TableHead>
                <TableHead className="text-right">Số ngày</TableHead>
                <TableHead>Khoảng làm</TableHead>
                <TableHead>Kế hoạch</TableHead>
                <TableHead className="text-right">ĐM đầu việc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 200).map(({ task, agg }) => {
                const open = expanded === task.id;
                return (
                  <React.Fragment key={task.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpanded(open ? null : task.id)}
                    >
                      <TableCell>
                        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{task.sumId ?? "—"}</TableCell>
                      <TableCell className="max-w-xs">
                        <span className="font-medium">{task.name}</span>
                        {task.deleted ? <span className="ml-1 text-xs text-red-600">(đã xóa)</span> : null}
                        <div className="text-xs text-muted-foreground">
                          {[task.groupName, task.projectName].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{fmt(agg.hours)}</TableCell>
                      <TableCell className="text-right">{agg.users.size}</TableCell>
                      <TableCell className="text-right">{agg.dateHours.size}</TableCell>
                      <TableCell className="text-xs">{agg.minD === agg.maxD ? agg.minD : `${agg.minD} → ${agg.maxD}`}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {task.plannedStart || task.plannedEnd
                          ? `${task.plannedStart || "?"} → ${task.plannedEnd || "?"}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {task.deptNorm != null ? fmt(task.deptNorm) : "—"}
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={8} className="py-3">
                          <Breakdown agg={agg} deptNorm={task.deptNorm} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Không có việc nào khớp bộ lọc
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {rows.length > 200 ? (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              Hiển thị 200/{rows.length} việc — dùng “Xuất Excel” để xem đầy đủ
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Breakdown({ agg, deptNorm }: { agg: Agg; deptNorm: number | null }) {
  const byUser = [...agg.users.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="pb-1 text-xs font-medium text-muted-foreground">Theo người</div>
        <table className="w-full text-sm">
          <tbody>
            {byUser.map(([name, h]) => {
              const pct = deptNorm && deptNorm > 0 ? Math.round(((h - deptNorm) / deptNorm) * 100) : null;
              const cls = pct == null ? "" : pct > 0 ? "text-red-600" : pct < 0 ? "text-emerald-600" : "text-muted-foreground";
              return (
                <tr key={name}>
                  <td className="py-0.5 pr-2">{name}</td>
                  <td className="py-0.5 pr-2 text-right font-medium">{fmt(h)} giờ</td>
                  <td className={cn("py-0.5 text-right text-xs", cls)}>
                    {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct}% so ĐM`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <div className="pb-1 text-xs font-medium text-muted-foreground">Theo ngày</div>
        <table className="w-full text-sm">
          <tbody>
            {[...agg.dateHours.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([d, h]) => (
                <tr key={d}>
                  <td className="py-0.5 pr-2">{d}</td>
                  <td className="py-0.5 text-right font-medium">{fmt(h)} giờ</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
