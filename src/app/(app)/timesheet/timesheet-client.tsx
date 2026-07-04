"use client";

import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { TimesheetEntryDialog } from "@/components/timesheet-entry-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WEEKDAY_LABEL } from "@/lib/timesheet";
import { deleteTimesheetEntry } from "@/server/actions/timesheet";

type Entry = {
  id: string;
  taskId: string | null;
  taskName: string | null;
  disciplineCode: string | null;
  projectCode: string | null;
  loaiHinhCode: string | null;
  hangMuc: string | null;
  taskGroupCode: string | null;
  taskLoaiHinhCode: string | null;
  taskLevel3: string | null;
  date: string;
  hours: number;
  note: string | null;
};
type TaskOpt = {
  id: string;
  name: string;
  groupCode: string | null;
  loaiHinhCode: string | null;
  level3: string | null;
  disciplineCode: string | null;
};

export function TimesheetClient({
  weekStartISO,
  isAdmin,
  entries,
  tasks,
}: {
  weekStartISO: string;
  isAdmin: boolean;
  entries: Entry[];
  tasks: TaskOpt[];
}) {
  const ws = dayjs(weekStartISO);
  const prevWeek = ws.subtract(7, "day").format("YYYY-MM-DD");
  const nextWeek = ws.add(7, "day").format("YYYY-MM-DD");
  const days = Array.from({ length: 7 }, (_, i) => ws.add(i, "day"));

  const [editing, setEditing] = React.useState<Entry | null>(null);
  const [creating, setCreating] = React.useState<string | null>(null); // date ISO

  const total = entries.reduce((s, e) => s + e.hours, 0);
  const byDay = (iso: string) => entries.filter((e) => e.date === iso);

  async function onDelete(e: Entry) {
    if (!confirm("Xóa dòng nhật ký này?")) return;
    const res = await deleteTimesheetEntry(e.id);
    if (res.ok) toast.success("Đã xóa");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Tuần {ws.format("DD/MM")} – {ws.add(6, "day").format("DD/MM/YYYY")} · Tổng{" "}
          <strong>{total} h</strong>
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/timesheet?week=${prevWeek}`}
            aria-label="Tuần trước"
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link href="/timesheet" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Tuần này
          </Link>
          <Link
            href={`/timesheet?week=${nextWeek}`}
            aria-label="Tuần sau"
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d, i) => {
          const iso = d.format("YYYY-MM-DD");
          const dayEntries = byDay(iso);
          const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
          const isToday = d.isSame(dayjs(), "day");
          return (
            <Card key={iso} className={isToday ? "ring-2 ring-ring" : ""}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {WEEKDAY_LABEL[i]} · {d.format("DD/MM")}
                  </div>
                  <span className="text-xs text-muted-foreground">{dayTotal}h</span>
                </div>
                <div className="space-y-1">
                  {dayEntries.map((e) => (
                    <div key={e.id} className="rounded-md border p-1.5 text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium">{e.hours}h</span>
                        <div className="flex gap-0.5">
                          <button type="button" onClick={() => setEditing(e)} aria-label="Sửa">
                            <Pencil className="size-3 text-muted-foreground" />
                          </button>
                          <button type="button" onClick={() => onDelete(e)} aria-label="Xóa">
                            <Trash2 className="size-3 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                      {(e.projectCode || e.loaiHinhCode || e.hangMuc) && (
                        <div className="truncate text-[11px] text-slate-400">
                          {[e.projectCode, e.loaiHinhCode, e.hangMuc].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div className="truncate text-muted-foreground" title={[e.taskName, e.disciplineCode].filter(Boolean).join(" · ")}>
                        {e.taskName
                          ? e.disciplineCode
                            ? <>{e.taskName} <span className="text-xs font-medium text-slate-400">· {e.disciplineCode}</span></>
                            : e.taskName
                          : "(không gắn việc)"}
                      </div>
                      {e.note ? <div className="truncate">{e.note}</div> : null}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setCreating(iso)}
                >
                  <Plus className="size-3" /> Thêm
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Bảng tổng hợp tuần */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead>Công việc</TableHead>
              <TableHead>Giờ</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{dayjs(e.date).format("DD/MM")}</TableCell>
                <TableCell className="text-xs">
                  {e.taskName
                    ? e.disciplineCode
                      ? <>{e.taskName} <span className="font-medium text-slate-400">· {e.disciplineCode}</span></>
                      : e.taskName
                    : "—"}
                </TableCell>
                <TableCell>{e.hours}h</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.note ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(e)} title="Sửa">
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(e)} title="Xóa">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Chưa có nhật ký tuần này
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {creating ? (
        <TimesheetEntryDialog defaultDate={creating} tasks={tasks} onClose={() => setCreating(null)} />
      ) : null}
      {editing ? (
        <TimesheetEntryDialog entry={editing} tasks={tasks} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
