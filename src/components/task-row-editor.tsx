"use client";

import * as React from "react";
import { toast } from "sonner";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type { Catalog, Opt, TaskRow, UserOpt } from "@/components/task-form";
import type { ProjectOpt } from "@/app/(app)/assign/assign-client";
import { UserMultiSelect } from "@/components/user-multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
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
type DisciplineOpt = Opt & { code?: string | null };

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
  disciplines: DisciplineOpt[];
  phases: Opt[];
  projects: ProjectOpt[];
  users: UserOpt[];
  catalog: Catalog;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const isEdit = !!task;
  const [pending, setPending] = React.useState(false);
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
    result: task?.result ?? "",
  });
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>(task?.assigneeIds ?? []);
  const [measureNorm, setMeasureNorm] = React.useState<boolean>(task?.measureNorm ?? false);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  const wg = workGroups.find((w) => w.id === wgId);
  const isB3 = wg?.code === "3";
  // Nhóm hiện L1 catalog Dự án: XD(1) DT(2) PT(5) PM(6) CK(7).
  // QL(3)/TT(4) dùng Project cascade (bảng Project riêng).
  const isProjectBased = wg?.code === "3" || wg?.code === "4";
  const sug = catalog[wgId] ?? { l1: [], l2: [], l3: [], l5: [], l2ByL1: {}, l3ByL2: {} };
  const ptProjectGroups = sug.projectGroups ?? [];
  const ptProjectGroupLabel = React.useCallback((g: { code: string; name: string }) => `${g.code} — ${g.name}`, []);
  const ptProjectGroupLabelById = React.useMemo(
    () => new Map(ptProjectGroups.map((g) => [g.id, g.code])),
    [ptProjectGroups, ptProjectGroupLabel],
  );
  const ptProjectGroupIdByLabel = React.useMemo(
    () => new Map(ptProjectGroups.map((g) => [g.code, g.id])),
    [ptProjectGroups, ptProjectGroupLabel],
  );
  // L1 cascade (Dự án) cho non-project-based groups — chỉ lọc L2, không lưu DB.
  const [activeL1, setActiveL1] = React.useState(() => {
    if (task?.level3 && wg?.code === "5") return catalog[wgId]?.projectGroupByL3?.[task.level3]?.id ?? "";
    if (!task?.level2 || isProjectBased) return "";
    for (const [l1, l2s] of Object.entries(catalog[wgId]?.l2ByL1 ?? {})) {
      if (l2s.includes(task.level2)) return l1;
    }
    return "";
  });
  const isBT = wg?.code === "5"; // BIM Tools: level3 = Dự án BIM Tools
  const l2Opts = !isProjectBased && !isBT && activeL1 && sug.l2ByL1[activeL1]?.length ? sug.l2ByL1[activeL1] : sug.l2;
  // PT: cascade L2→L3 (Loại hình → Dự án BIM Tools)
  const l3Opts = React.useMemo(() => {
    if (!isBT) return sug.l3;
    const byProject = activeL1 ? (sug.l3ByProjectGroup?.[activeL1] ?? []) : sug.l3;
    const byType = f.level2 && sug.l3ByL2[f.level2]?.length ? sug.l3ByL2[f.level2] : [];
    return byType.length ? byProject.filter((v) => byType.includes(v)) : byProject;
  }, [activeL1, f.level2, isBT, sug]);

  // Cascade state cho isB3: Dự án (ProjectGroup) → Loại hình (ConstructionType) → Hạng mục
  const initProject = task?.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const [pgCode, setPgCode] = React.useState(initProject?.groupCode ?? "");
  const [ctCode, setCtCode] = React.useState(initProject?.constructionTypeCode ?? f.level2 ?? "");

  const b3PgCodes = React.useMemo(
    () => [...new Set(projects.map((p) => p.groupCode).filter(Boolean))].sort(),
    [projects],
  );
  const b3CtCodes = React.useMemo(() => {
    const pool = pgCode ? projects.filter((p) => p.groupCode === pgCode) : projects;
    return [...new Set(pool.map((p) => p.constructionTypeCode).filter(Boolean))];
  }, [projects, pgCode]);
  const b3HangMucOpts = React.useMemo(() => {
    const pool = pgCode ? projects.filter((p) => p.groupCode === pgCode) : projects;
    return [...new Set(pool.filter((p) => !ctCode || p.constructionTypeCode === ctCode).map((p) => p.name))];
  }, [projects, pgCode, ctCode]);

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
      projectGroupCode: isB3 ? pgCode || null : null,
      disciplineId: f.disciplineId || null,
      phaseId: isB3 ? f.phaseId || null : null,
      sumId: task?.sumId ?? null,
      level1: !isProjectBased && !isBT ? activeL1 || null : null,
      level2: isB3 ? ctCode || null : f.level2 || null,
      level3: f.level3 || null,
      level5: f.level5 || null,
      name: f.name || null,
      priority: f.priority,
      status: f.status,
      plannedStart: f.plannedStart || null,
      plannedEnd: f.plannedEnd || null,
      note: f.note || null,
      result: f.result || null,
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
          <>
            <Field label="Dự án">
              <SearchableCombobox
                creatable={false}
                placeholder={NONE}
                value={pgCode}
                options={[NONE, ...b3PgCodes]}
                onChange={(v) => {
                  const nv = v === NONE ? "" : v;
                  setPgCode(nv);
                  setCtCode("");
                  set({ projectId: "", level2: "", level3: "" });
                }}
              />
            </Field>
            <Field label="Loại hình">
              <SearchableCombobox
                creatable
                placeholder={NONE}
                value={ctCode}
                options={[NONE, ...b3CtCodes]}
                onChange={(v) => {
                  const nv = v === NONE ? "" : v;
                  setCtCode(nv);
                  set({ level2: nv, level3: "", projectId: "" });
                }}
              />
            </Field>
            <Field label="Hạng mục">
              <SearchableCombobox
                creatable
                placeholder="Chọn hoặc nhập mới..."
                value={f.level3}
                options={b3HangMucOpts}
                onChange={(v) => {
                  const p = projects.find(
                    (pp) => pp.groupCode === pgCode && pp.constructionTypeCode === ctCode && pp.name === v,
                  );
                  set({ level3: v, projectId: p?.id ?? "" });
                }}
              />
            </Field>
          </>
        ) : (
          <>
            {!isProjectBased && (
              <Field label="Dự án">
                <SearchableCombobox
                  creatable={false}
                  placeholder="— Chưa chọn —"
                  value={isBT ? (ptProjectGroupLabelById.get(activeL1) ?? activeL1) : activeL1}
                  options={["— Chưa chọn —", ...sug.l1]}
                  onChange={(v) => {
                    const nv = v === "— Chưa chọn —" ? "" : v;
                    setActiveL1(nv);
                    if (isBT) {
                      const byProject = nv ? (sug.l3ByProjectGroup?.[nv] ?? []) : sug.l3;
                      if (byProject.length > 0 && !byProject.includes(f.level3)) {
                        set({ level3: "" });
                      }
                      return;
                    }
                    // Chỉ reset L2 nếu L1 có link L2 và L2 hiện tại không thuộc L1 mới.
                    const linked = nv ? (sug.l2ByL1[nv] ?? []) : [];
                    if (linked.length > 0 && !linked.includes(f.level2)) {
                      set({ level2: "" });
                    }
                  }}
                />
              </Field>
            )}
            <Field label={isBT ? "Loại hình" : "Hạng mục (L2)"}>
              <SearchableCombobox
                value={f.level2}
                onChange={(v) => {
                  // PT: đổi Loại hình → reset Dự án nếu không còn thuộc nhóm mới
                  if (isBT) {
                    const byProject = activeL1 ? (sug.l3ByProjectGroup?.[activeL1] ?? []) : sug.l3;
                    const byType = v && sug.l3ByL2[v]?.length ? sug.l3ByL2[v] : [];
                    const newL3Opts = byType.length ? byProject.filter((x) => byType.includes(x)) : byProject;
                    set({ level2: v, level3: newL3Opts.includes(f.level3) ? f.level3 : "" });
                  } else {
                    set({ level2: v });
                  }
                }}
                options={l2Opts}
              />
            </Field>
            <Field label={isBT ? "Dự án BIM Tools" : "Chi tiết (L3)"}>
              <SearchableCombobox value={f.level3} onChange={(v) => set({ level3: v })} options={l3Opts} />
            </Field>
          </>
        )}
        <Field label="Bộ môn (L4)">
          <SearchableCombobox
            creatable={false}
            placeholder={NONE}
            value={disciplines.find((d) => d.id === f.disciplineId)?.code ?? disciplines.find((d) => d.id === f.disciplineId)?.name ?? ""}
            options={[NONE, ...disciplines.map((d) => d.code ?? d.name)]}
            onChange={(label) =>
              set({
                disciplineId:
                  label === NONE ? "" : (disciplines.find((d) => (d.code ?? d.name) === label)?.id ?? ""),
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
          <DateInput value={f.plannedStart} onChange={(e) => set({ plannedStart: e.target.value })} />
        </Field>
        <Field label="Ngày kết thúc">
          <DateInput value={f.plannedEnd} onChange={(e) => set({ plannedEnd: e.target.value })} />
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

      <Field label="Kết quả (URL hoặc đường dẫn file)">
        <Input
          value={f.result}
          onChange={(e) => set({ result: e.target.value })}
          placeholder="https://... hoặc T:\thư mục\file.xlsx"
        />
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
