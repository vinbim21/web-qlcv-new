"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UserMultiSelect } from "@/components/user-multi-select";
import { PRIORITY_LABEL, PRIORITY_OPTIONS, TASK_STATUS_LABEL } from "@/lib/labels";
import { saveTask } from "@/server/actions/tasks";

export type Opt = { id: string; name: string; code?: string | null };
export type UserOpt = { id: string; fullName: string };
export type CatalogProjectGroup = { id: string; code: string; name: string };
export type Catalog = Record<string, {
  l1: string[];
  l2: string[];
  l3: string[];
  l5: string[];
  l2ByL1: Record<string, string[]>;
  l3ByL2: Record<string, string[]>;
  projectGroups?: CatalogProjectGroup[];
  l3ByProjectGroup?: Record<string, string[]>;
  projectGroupByL3?: Record<string, CatalogProjectGroup>;
}>;

export type TaskRow = {
  id: string;
  sumId: string | null;
  workGroupId: string;
  workGroupName: string;
  projectId: string | null;
  projectName: string | null;
  disciplineId: string | null;
  disciplineName: string | null;
  phaseId: string | null;
  phaseName: string | null;
  level2: string | null;
  level3: string | null;
  level5: string | null;
  name: string;
  priority: string;
  status: string;
  progressPercent: number;
  plannedStart: string;
  plannedEnd: string;
  note: string | null;
  result?: string | null;
  measureNorm?: boolean;
  assigneeIds: string[];
  assigneeNames: string[];
};

/**
 * Form tạo/sửa công việc dùng chung cho trang Công việc (trong Modal) và
 * trang Giao việc (full-page). Tự gọi saveTask + hiện toast.
 */
export function TaskForm({
  task,
  defaultWorkGroupId,
  workGroups,
  disciplines,
  phases,
  projects,
  users,
  catalog,
  onSuccess,
  onCancel,
  submitLabel = "Lưu",
  successMessage,
}: {
  task?: TaskRow;
  defaultWorkGroupId?: string;
  workGroups: Opt[];
  disciplines: Opt[];
  phases: Opt[];
  projects: Opt[];
  users: UserOpt[];
  catalog: Catalog;
  /** Gọi sau khi lưu thành công (đóng modal hoặc reset form). */
  onSuccess?: () => void;
  /** Nếu truyền → hiện nút "Hủy". */
  onCancel?: () => void;
  submitLabel?: string;
  /** Ghi đè thông báo toast khi lưu thành công. */
  successMessage?: string;
}) {
  const [pending, setPending] = React.useState(false);
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>(task?.assigneeIds ?? []);
  const [wgId, setWgId] = React.useState(task?.workGroupId ?? defaultWorkGroupId ?? "");
  const sug = catalog[wgId] ?? { l1: [], l2: [], l3: [], l5: [], l2ByL1: {}, l3ByL2: {} };
  const wgCode = workGroups.find((w) => w.id === wgId)?.code ?? "";
  // QL(3)/TT(4) dùng Project cascade. PT(5) dùng L1 catalog như các nhóm khác.
  const isProjectBased = wgCode === "3" || wgCode === "4";
  // L1 cascade (Dự án) cho non-project-based groups — không lưu DB, chỉ lọc L2 options.
  const [activeL1, setActiveL1] = React.useState(() => {
    const level2 = task?.level2;
    if (!level2) return "";
    const wgCat = catalog[task?.workGroupId ?? defaultWorkGroupId ?? ""];
    for (const [l1, l2s] of Object.entries(wgCat?.l2ByL1 ?? {})) {
      if (l2s.includes(level2)) return l1;
    }
    return "";
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await saveTask({
      id: task?.id,
      workGroupId: String(fd.get("workGroupId") || ""),
      projectId: (fd.get("projectId") as string) || null,
      disciplineId: (fd.get("disciplineId") as string) || null,
      phaseId: (fd.get("phaseId") as string) || null,
      sumId: (fd.get("sumId") as string) || null,
      level1: !isProjectBased && wgCode !== "5" ? activeL1 || null : null,
      level2: (fd.get("level2") as string) || null,
      level3: (fd.get("level3") as string) || null,
      level5: (fd.get("level5") as string) || null,
      name: (fd.get("name") as string) || null,
      priority: String(fd.get("priority") || "TRUNG_BINH"),
      status: String(fd.get("status") || "CHUA_LAM"),
      plannedStart: (fd.get("plannedStart") as string) || null,
      plannedEnd: (fd.get("plannedEnd") as string) || null,
      note: (fd.get("note") as string) || null,
      assigneeIds,
    });
    setPending(false);
    if (res.ok) {
      toast.success(successMessage ?? (task ? "Đã cập nhật" : "Đã thêm công việc"));
      onSuccess?.();
    } else toast.error(res.error);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="workGroupId">Nhóm công việc *</Label>
          <Select
            id="workGroupId"
            name="workGroupId"
            value={wgId}
            onChange={(e) => { setWgId(e.target.value); setActiveL1(""); }}
            required
          >
            <option value="">— Chọn —</option>
            {workGroups.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        {!isProjectBased ? (
          <div className="space-y-1.5">
            <Label htmlFor="l1filter">Dự án</Label>
            <Select
              id="l1filter"
              value={activeL1}
              onChange={(e) => { setActiveL1(e.target.value); }}
            >
              <option value="">— Chưa chọn —</option>
              {sug.l1.map((l1) => (
                <option key={l1} value={l1}>{l1}</option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="projectId">Dự án</Label>
            <Select id="projectId" name="projectId" defaultValue={task?.projectId ?? ""}>
              <option value="">— Không —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="level2">Hạng mục (L2)</Label>
          <Input id="level2" name="level2" list="dl-l2" defaultValue={task?.level2 ?? ""} />
          <datalist id="dl-l2">
            {(activeL1 && sug.l2ByL1[activeL1]?.length ? sug.l2ByL1[activeL1] : sug.l2).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="level3">Chi tiết (L3)</Label>
          <Input id="level3" name="level3" list="dl-l3" defaultValue={task?.level3 ?? ""} />
          <datalist id="dl-l3">
            {sug.l3.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="level5">Đầu việc (L5)</Label>
          <Input id="level5" name="level5" list="dl-l5" defaultValue={task?.level5 ?? ""} />
          <datalist id="dl-l5">
            {sug.l5.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Tên hiển thị (để trống → tự lấy đầu việc)</Label>
          <Input id="name" name="name" defaultValue={task?.name ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="disciplineId">Bộ môn (L4)</Label>
          <Select id="disciplineId" name="disciplineId" defaultValue={task?.disciplineId ?? ""}>
            <option value="">— Không —</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phaseId">Giai đoạn</Label>
          <Select id="phaseId" name="phaseId" defaultValue={task?.phaseId ?? ""}>
            <option value="">— Không —</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sumId">Mã (Sum ID)</Label>
          <Input id="sumId" name="sumId" defaultValue={task?.sumId ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="priority">Ưu tiên</Label>
          <Select id="priority" name="priority" defaultValue={task?.priority ?? "TRUNG_BINH"}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          {/* Khóa: trạng thái tự suy theo "Thực tế hoàn thành"/Tạm dừng — giữ giá trị cũ qua hidden input. */}
          <input type="hidden" name="status" value={task?.status ?? "CHUA_LAM"} />
          <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
            {TASK_STATUS_LABEL[task?.status ?? "CHUA_LAM"] ?? "Chưa thực hiện"}
            <span className="ml-2 text-xs">· tự động theo Thực tế hoàn thành</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="plannedStart">Bắt đầu</Label>
          <DateInput id="plannedStart" name="plannedStart" defaultValue={task?.plannedStart} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plannedEnd">Kết thúc</Label>
          <DateInput id="plannedEnd" name="plannedEnd" defaultValue={task?.plannedEnd} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Người thực hiện</Label>
        <UserMultiSelect users={users} value={assigneeIds} onChange={setAssigneeIds} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Ghi chú</Label>
        <Textarea id="note" name="note" defaultValue={task?.note ?? ""} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Hủy
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
