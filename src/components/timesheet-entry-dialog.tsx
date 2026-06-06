"use client";

import * as React from "react";
import { toast } from "sonner";
import { TaskCombobox } from "@/components/task-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { saveTimesheetEntry } from "@/server/actions/timesheet";

export type TimesheetEntry = {
  id: string;
  taskId: string | null;
  taskName: string | null;
  date: string;
  hours: number;
  note: string | null;
};
type TaskOpt = { id: string; name: string };

export function TimesheetEntryDialog({
  entry,
  defaultDate,
  tasks,
  lockedTask,
  onClose,
}: {
  entry?: TimesheetEntry;
  defaultDate?: string;
  /** Danh sách việc cho combobox. Bỏ qua khi có lockedTask. */
  tasks?: TaskOpt[];
  /** Khi truyền: khóa cứng công việc, ẩn combobox (vd ghi giờ từ dòng /tasks). */
  lockedTask?: { id: string; name: string };
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [taskId, setTaskId] = React.useState<string>(lockedTask?.id ?? entry?.taskId ?? "");
  const [complete, setComplete] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const markComplete = complete && !!taskId;
    const res = await saveTimesheetEntry({
      id: entry?.id,
      taskId: taskId || null,
      date: String(fd.get("date") || ""),
      hours: Number(fd.get("hours") || 0),
      note: (fd.get("note") as string) || null,
      markComplete,
    });
    setPending(false);
    if (res.ok) {
      toast.success(markComplete ? "Đã lưu & hoàn thành công việc" : "Đã lưu nhật ký");
      onClose();
    } else toast.error(res.error);
  }

  return (
    <Modal open onClose={onClose} title={entry ? "Sửa nhật ký" : "Thêm nhật ký"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Công việc</Label>
          {lockedTask ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{lockedTask.name}</div>
          ) : (
            <TaskCombobox
              tasks={tasks ?? []}
              value={taskId}
              onChange={setTaskId}
              placeholder="Gõ để tìm công việc được giao..."
            />
          )}
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
        {/* Chỉ hiện khi có gắn công việc — tích để đặt việc sang "Hoàn thành" khi lưu. */}
        {taskId ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={complete}
              onChange={(e) => setComplete(e.target.checked)}
            />
            Đánh dấu hoàn thành công việc
          </label>
        ) : null}
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
