"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveTimesheetEntry } from "@/server/actions/timesheet";

export type TimesheetEntry = {
  id: string;
  taskId: string | null;
  taskName: string | null;
  taskGroupCode: string | null;
  taskLoaiHinhCode: string | null;
  taskLevel3: string | null;
  date: string;
  hours: number;
  note: string | null;
};

export type TaskOpt = {
  id: string;
  name: string;
  groupCode: string | null;
  loaiHinhCode: string | null;
  level3: string | null;
  disciplineCode: string | null;
};

type LockedTask = {
  id: string;
  name: string;
  groupCode?: string | null;
  loaiHinhCode?: string | null;
  level3?: string | null;
};

export function TimesheetEntryDialog({
  entry,
  defaultDate,
  tasks,
  lockedTask,
  onClose,
}: {
  entry?: TimesheetEntry;
  defaultDate?: string;
  tasks?: TaskOpt[];
  lockedTask?: LockedTask;
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [taskId, setTaskId] = React.useState<string>(lockedTask?.id ?? entry?.taskId ?? "");
  const [complete, setComplete] = React.useState(false);

  // Cascade filter states — init từ entry khi đang sửa
  const [filterGroup, setFilterGroup] = React.useState<string>(entry?.taskGroupCode ?? "");
  const [filterLoaiHinh, setFilterLoaiHinh] = React.useState<string>(entry?.taskLoaiHinhCode ?? "");
  const [filterLevel3, setFilterLevel3] = React.useState<string>(entry?.taskLevel3 ?? "");

  const allTasks = tasks ?? [];

  // Unique values cho từng dropdown (chỉ hiện giá trị có tồn tại trong tasks)
  const groupCodes = React.useMemo(
    () => [...new Set(allTasks.map((t) => t.groupCode).filter(Boolean) as string[])].sort(),
    [allTasks],
  );
  const loaiHinhCodes = React.useMemo(
    () =>
      [
        ...new Set(
          allTasks
            .filter((t) => !filterGroup || t.groupCode === filterGroup)
            .map((t) => t.loaiHinhCode)
            .filter(Boolean) as string[],
        ),
      ].sort(),
    [allTasks, filterGroup],
  );
  const level3Values = React.useMemo(
    () =>
      [
        ...new Set(
          allTasks
            .filter((t) => !filterGroup || t.groupCode === filterGroup)
            .filter((t) => !filterLoaiHinh || t.loaiHinhCode === filterLoaiHinh)
            .map((t) => t.level3)
            .filter(Boolean) as string[],
        ),
      ].sort(),
    [allTasks, filterGroup, filterLoaiHinh],
  );
  const filteredTasks = React.useMemo(
    () =>
      allTasks.filter(
        (t) =>
          (!filterGroup || t.groupCode === filterGroup) &&
          (!filterLoaiHinh || t.loaiHinhCode === filterLoaiHinh) &&
          (!filterLevel3 || t.level3 === filterLevel3),
      ),
    [allTasks, filterGroup, filterLoaiHinh, filterLevel3],
  );

  const selectedTask = allTasks.find((t) => t.id === taskId) ?? null;

  function handleGroupChange(v: string) {
    setFilterGroup(v);
    setFilterLoaiHinh("");
    setFilterLevel3("");
    setTaskId("");
  }
  function handleLoaiHinhChange(v: string) {
    setFilterLoaiHinh(v);
    setFilterLevel3("");
    setTaskId("");
  }
  function handleLevel3Change(v: string) {
    setFilterLevel3(v);
    setTaskId("");
  }

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
        {lockedTask ? (
          // Tab "Công việc của tôi": hiện thông tin tĩnh
          <TaskInfoPanel
            groupCode={lockedTask.groupCode ?? null}
            loaiHinhCode={lockedTask.loaiHinhCode ?? null}
            level3={lockedTask.level3 ?? null}
            taskName={lockedTask.name}
          />
        ) : (
          // Tab Timesheet: cascade dropdowns
          <div className="space-y-2">
            {groupCodes.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Dự án</Label>
                <Select value={filterGroup} onChange={(e) => handleGroupChange(e.target.value)}>
                  <option value="">— Tất cả —</option>
                  {groupCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
            ) : null}
            {loaiHinhCodes.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Loại hình</Label>
                <Select value={filterLoaiHinh} onChange={(e) => handleLoaiHinhChange(e.target.value)}>
                  <option value="">— Tất cả —</option>
                  {loaiHinhCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
            ) : null}
            {level3Values.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Hạng mục</Label>
                <Select value={filterLevel3} onChange={(e) => handleLevel3Change(e.target.value)}>
                  <option value="">— Tất cả —</option>
                  {level3Values.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Công việc</Label>
              <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">— Chọn công việc —</option>
                {filteredTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.disciplineCode ? `${t.name} · ${t.disciplineCode}` : t.name}
                  </option>
                ))}
              </Select>
            </div>
            {selectedTask ? (
              <TaskInfoPanel
                groupCode={selectedTask.groupCode}
                loaiHinhCode={selectedTask.loaiHinhCode}
                level3={selectedTask.level3}
                taskName={selectedTask.name}
              />
            ) : null}
          </div>
        )}

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

function TaskInfoPanel({
  groupCode,
  loaiHinhCode,
  level3,
  taskName,
}: {
  groupCode: string | null;
  loaiHinhCode: string | null;
  level3: string | null;
  taskName: string;
}) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Dự án", value: groupCode },
    { label: "Loại hình", value: loaiHinhCode },
    { label: "Hạng mục", value: level3 },
    { label: "Công việc", value: taskName },
  ];
  return (
    <div className="rounded-md border">
      <div className="divide-y px-3">
        {rows
          .filter((r) => r.value)
          .map((r) => (
            <div key={r.label} className="grid grid-cols-[80px_1fr] gap-2 py-2 text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-medium">{r.value}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
