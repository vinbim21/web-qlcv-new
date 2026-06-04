"use client";

import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { TaskCombobox } from "@/components/task-combobox";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WEEKDAY_LABEL } from "@/lib/timesheet";
import { deleteTimesheetEntry, saveTimesheetEntry } from "@/server/actions/timesheet";

type Entry = {
  id: string;
  taskId: string | null;
  taskName: string | null;
  date: string;
  hours: number;
  note: string | null;
};
type TaskOpt = { id: string; name: string };

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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timesheet</h1>
          <p className="text-sm text-muted-foreground">
            Tuần {ws.format("DD/MM")} – {ws.add(6, "day").format("DD/MM/YYYY")} · Tổng{" "}
            <strong>{total} h</strong>
          </p>
        </div>
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
                      <div className="truncate text-muted-foreground" title={e.taskName ?? ""}>
                        {e.taskName ?? "(không gắn việc)"}
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
                <TableCell className="text-xs">{e.taskName ?? "—"}</TableCell>
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
        <EntryDialog defaultDate={creating} tasks={tasks} onClose={() => setCreating(null)} />
      ) : null}
      {editing ? <EntryDialog entry={editing} tasks={tasks} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EntryDialog({
  entry,
  defaultDate,
  tasks,
  onClose,
}: {
  entry?: Entry;
  defaultDate?: string;
  tasks: TaskOpt[];
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [taskId, setTaskId] = React.useState<string>(entry?.taskId ?? "");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await saveTimesheetEntry({
      id: entry?.id,
      taskId: taskId || null,
      date: String(fd.get("date") || ""),
      hours: Number(fd.get("hours") || 0),
      note: (fd.get("note") as string) || null,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Đã lưu nhật ký");
      onClose();
    } else toast.error(res.error);
  }
  return (
    <Modal open onClose={onClose} title={entry ? "Sửa nhật ký" : "Thêm nhật ký"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Công việc</Label>
          <TaskCombobox
            tasks={tasks}
            value={taskId}
            onChange={setTaskId}
            placeholder="Gõ để tìm công việc được giao..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Ngày</Label>
            <Input id="date" name="date" type="date" defaultValue={entry?.date ?? defaultDate} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hours">Số giờ</Label>
            <Input
              id="hours"
              name="hours"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              defaultValue={entry?.hours ?? ""}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">Nội dung công việc</Label>
          <Textarea id="note" name="note" defaultValue={entry?.note ?? ""} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
