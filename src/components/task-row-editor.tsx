"use client";

import * as React from "react";
import { toast } from "sonner";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type { Catalog, Opt, TaskRow, UserOpt } from "@/components/task-form";
import { UserMultiSelect } from "@/components/user-multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
} from "@/lib/labels";
import { saveTask } from "@/server/actions/tasks";

// Nhóm công việc kèm tiền tố Id (abbr) + bộ đếm (lastSeq) để hiện Id như /assign.
type WgOpt = Opt & { abbr?: string | null; lastSeq?: number };

const NONE = "— Không —";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Sửa/Thêm 1 công việc theo phong cách lưới Giao việc (cùng các ô combobox),
 * nhưng cho đúng 1 item. Dùng riêng cho tab Quản lý công việc (/manage).
 */
export function TaskRowEditor({
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
}: {
  task?: TaskRow & { seq?: number | null };
  defaultWorkGroupId?: string;
  workGroups: WgOpt[];
  disciplines: Opt[];
  phases: Opt[];
  projects: Opt[];
  users: UserOpt[];
  catalog: Catalog;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const isEdit = !!task;
  const [pending, setPending] = React.useState(false);
  // Sửa: nhóm cố định (giữ seq/Id). Thêm: cho chọn (mặc định theo tab đang xem).
  const [wgId, setWgId] = React.useState(
    task?.workGroupId ?? defaultWorkGroupId ?? workGroups[0]?.id ?? "",
  );
  const [f, setF] = React.useState({
    projectId: task?.projectId ?? "",
    disciplineId: task?.disciplineId ?? "",
    phaseId: task?.phaseId ?? "",
    level2: task?.level2 ?? "",
    level3: task?.level3 ?? "",
    level5: task?.level5 ?? "",
    name: task?.name ?? "",
    priority: task?.priority ?? "TRUNG_BINH",
    status: task?.status ?? "CHUA_LAM",
    plannedStart: task?.plannedStart ?? "",
    plannedEnd: task?.plannedEnd ?? "",
    note: task?.note ?? "",
  });
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>(task?.assigneeIds ?? []);
  const [measureNorm, setMeasureNorm] = React.useState<boolean>(task?.measureNorm ?? false);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  const wg = workGroups.find((w) => w.id === wgId);
  // Nhóm Quản lý BIM (mã "3") mới có cột Dự án + Giai đoạn — như /assign.
  const isB3 = wg?.code === "3";
  const sug = catalog[wgId] ?? { l2: [], l3: [], l5: [] };

  const idLabel = (() => {
    const abbr = wg?.abbr || wg?.code || "—";
    if (isEdit) {
      return task?.seq != null ? `${abbr}-${String(task.seq).padStart(3, "0")}` : (task?.sumId ?? "—");
    }
    return "(mới)";
  })();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!wgId) {
      toast.error("Chọn nhóm công việc");
      return;
    }
    setPending(true);
    const res = await saveTask({
      id: task?.id,
      workGroupId: wgId,
      projectId: isB3 ? f.projectId || null : null,
      disciplineId: f.disciplineId || null,
      phaseId: isB3 ? f.phaseId || null : null,
      sumId: task?.sumId ?? null,
      level2: f.level2 || null,
      level3: f.level3 || null,
      level5: f.level5 || null,
      name: f.name || null,
      priority: f.priority,
      status: f.status,
      plannedStart: f.plannedStart || null,
      plannedEnd: f.plannedEnd || null,
      note: f.note || null,
      measureNorm,
      assigneeIds,
    });
    setPending(false);
    if (res.ok) {
      toast.success(isEdit ? "Đã cập nhật" : "Đã thêm công việc");
      onSuccess?.();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {/* Tiêu đề: nhóm công việc + Id */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {isEdit ? (
          <span className="rounded-md bg-muted px-2 py-1 font-medium">{wg?.name}</span>
        ) : (
          <Select className="h-8 w-56 text-sm" value={wgId} onChange={(e) => setWgId(e.target.value)}>
            <option value="">— Chọn nhóm công việc —</option>
            {workGroups.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        )}
        <span className="font-mono text-xs text-muted-foreground">Id: {idLabel}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isB3 ? (
          <Field label="Dự án">
            <Select value={f.projectId} onChange={(e) => set({ projectId: e.target.value })}>
              <option value="">{NONE}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Hạng mục (L2)">
          <SearchableCombobox value={f.level2} onChange={(v) => set({ level2: v })} options={sug.l2} />
        </Field>
        <Field label="Chi tiết (L3)">
          <SearchableCombobox value={f.level3} onChange={(v) => set({ level3: v })} options={sug.l3} />
        </Field>
        <Field label="Bộ môn (L4)">
          <SearchableCombobox
            creatable={false}
            placeholder={NONE}
            value={disciplines.find((d) => d.id === f.disciplineId)?.name ?? ""}
            options={[NONE, ...disciplines.map((d) => d.name)]}
            onChange={(label) =>
              set({
                disciplineId:
                  label === NONE ? "" : (disciplines.find((d) => d.name === label)?.id ?? ""),
              })
            }
          />
        </Field>
        <Field label="Đầu việc (L5)">
          <SearchableCombobox value={f.level5} onChange={(v) => set({ level5: v })} options={sug.l5} />
        </Field>

        {isB3 ? (
          <Field label="Giai đoạn">
            <Select value={f.phaseId} onChange={(e) => set({ phaseId: e.target.value })}>
              <option value="">{NONE}</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Ưu tiên">
          <SearchableCombobox
            creatable={false}
            value={PRIORITY_LABEL[f.priority] ?? ""}
            options={PRIORITY_OPTIONS.map((p) => PRIORITY_LABEL[p])}
            onChange={(label) =>
              set({ priority: PRIORITY_OPTIONS.find((p) => PRIORITY_LABEL[p] === label) ?? "TRUNG_BINH" })
            }
          />
        </Field>
        <Field label="Trạng thái (tự động)">
          {/* Khóa: trạng thái suy theo Thực tế hoàn thành/Tạm dừng — không set tay. */}
          <SearchableCombobox
            creatable={false}
            disabled
            value={TASK_STATUS_LABEL[f.status] ?? ""}
            options={TASK_STATUS_OPTIONS.map((s) => TASK_STATUS_LABEL[s])}
            onChange={() => {}}
          />
        </Field>

        <Field label="Ngày bắt đầu">
          <Input type="date" value={f.plannedStart} onChange={(e) => set({ plannedStart: e.target.value })} />
        </Field>
        <Field label="Ngày kết thúc">
          <Input type="date" value={f.plannedEnd} onChange={(e) => set({ plannedEnd: e.target.value })} />
        </Field>
      </div>

      <Field label="Người thực hiện">
        <UserMultiSelect users={users} value={assigneeIds} onChange={setAssigneeIds} />
      </Field>

      <Field label="Tên hiển thị (để trống → tự lấy đầu việc)">
        <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      <Field label="Ghi chú">
        <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={measureNorm}
          onChange={(e) => setMeasureNorm(e.target.checked)}
        />
        <span>
          Việc <b>cần đo định mức</b> (*) — đưa vào báo cáo tính định mức theo loại hình công trình
        </span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Hủy
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </form>
  );
}
