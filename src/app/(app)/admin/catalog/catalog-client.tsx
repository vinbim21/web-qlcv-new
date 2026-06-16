"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building,
  Building2,
  Check,
  ChevronsUpDown,
  Database,
  Filter,
  GitBranch,
  GripVertical,
  Info,
  Layers,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shapes,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { cn, removeVietnameseTones } from "@/lib/utils";
import {
  addCatalogValue,
  batchReorderItems,
  deleteCatalogValue,
  deletePhase,
  deleteWorkGroup,
  savePhase,
  saveWorkGroup,
  updateCatalogValue,
} from "@/server/actions/catalog";
import { deleteConstructionType, saveConstructionType } from "@/server/actions/construction-types";
import { deleteDiscipline, saveDiscipline } from "@/server/actions/disciplines";
import {
  batchSaveCatalogProjects,
  deleteProject,
  deleteProjectGroup,
  saveCatalogProject,
  saveProjectGroup,
} from "@/server/actions/projects";
import type { Result } from "@/server/actions/_helpers";

const norm = removeVietnameseTones;

// ---------- Kiểu dữ liệu hàng ----------
type WorkGroupRow = { id: string; code: string; abbr: string | null; name: string; order: number; taskCount: number };
type ProjectGroupRow = { id: string; code: string; name: string; order: number; itemCount: number };
type ProjectRow = {
  id: string;
  groupId: string | null;
  code: string;
  name: string;
  scale: string | null;
  constructionTypeId: string | null;
  taskCount: number;
};
type WorkRow = { id: string; workGroupId: string; value: string; order: number };
type SimpleRow = { id: string; code: string; name: string; order: number };
type Row = { id: string; order: number } & Record<string, unknown>;

type TabId = "groups" | "projects" | "works" | "phases" | "disciplines" | "ctypes";

// ---------- Cấu hình cột FilterTable ----------
type FilterKind = "text" | "multi";
type Col = {
  key: string;
  label: string;
  thClass?: string;
  align?: "right";
  filter?: FilterKind;
  text: (r: Row) => string; // giá trị để lọc / sort / chip
  cell: (r: Row) => React.ReactNode; // hiển thị
  sortVal?: (r: Row) => number | string;
};

// ===================================================================
//  Trang chính
// ===================================================================
export function CatalogClient({
  workGroups,
  phases,
  disciplines,
  constructionTypes,
  projectGroups,
  projects,
  works,
}: {
  workGroups: WorkGroupRow[];
  phases: SimpleRow[];
  disciplines: SimpleRow[];
  constructionTypes: SimpleRow[];
  projectGroups: ProjectGroupRow[];
  projects: ProjectRow[];
  works: WorkRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>("groups");
  const [manageProjects, setManageProjects] = React.useState(false);

  // Modal thêm/sửa + xác nhận xóa (dùng chung).
  const [addItems, setAddItems] = React.useState(false);

  const [record, setRecord] = React.useState<{
    title: string;
    subtitle?: string;
    fields: Field[];
    initial: Record<string, string>;
    existingCodes?: string[];
    submit: (values: Record<string, string>) => Promise<Result<unknown>>;
  } | null>(null);
  const [confirm, setConfirm] = React.useState<{
    name: string;
    warnMsg?: string;
    blockMsg?: string;
    run: () => Promise<Result<unknown>>;
  } | null>(null);

  const ctById = React.useMemo(() => new Map(constructionTypes.map((c) => [c.id, c])), [constructionTypes]);
  const wgById = React.useMemo(() => new Map(workGroups.map((w) => [w.id, w])), [workGroups]);
  const pgById = React.useMemo(() => new Map(projectGroups.map((g) => [g.id, g])), [projectGroups]);

  async function run(p: Promise<Result<unknown>>, okMsg: string) {
    const res = await p;
    if (res.ok) {
      toast.success(okMsg);
      router.refresh();
    } else {
      toast.error(res.error);
    }
    return res;
  }

  async function reorder(model: Parameters<typeof batchReorderItems>[0], ids: string[]) {
    const res = await batchReorderItems(model, ids);
    if (res.ok) router.refresh();
    else toast.error(res.error);
  }

  // ---- Tabs meta (huy hiệu số + icon + nhãn + badge đếm) ----
  const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }>; count: number }[] = [
    { id: "groups", label: "Nhóm công việc", Icon: Layers, count: workGroups.length },
    { id: "projects", label: "Dự án", Icon: Building2, count: projectGroups.length },
    { id: "works", label: "Công việc", Icon: ListChecks, count: works.length },
    { id: "phases", label: "Giai đoạn", Icon: GitBranch, count: phases.length },
    { id: "disciplines", label: "Bộ môn", Icon: Shapes, count: disciplines.length },
    { id: "ctypes", label: "Loại hình công trình", Icon: Building, count: constructionTypes.length },
  ];

  // ============== TAB 1 — Nhóm công việc ==============
  const groupsView = () => (
    <FilterTable
      title="Nhóm công việc"
      rows={workGroups as unknown as Row[]}
      addLabel="Thêm nhóm"
      minWidth={620}
      onBatchReorder={(ids) => reorder("workGroup", ids)}
      onAdd={() =>
        setRecord({
          title: "Thêm nhóm công việc",
          fields: GROUP_FIELDS,
          initial: { code: "", name: "", abbr: "", order: "0" },
          existingCodes: workGroups.map((w) => w.code),
          submit: (v) =>
            saveWorkGroup({ code: v.code, name: v.name, abbr: v.abbr, order: Number(v.order || 0) }),
        })
      }
      onEdit={(r) => {
        const w = r as unknown as WorkGroupRow;
        setRecord({
          title: "Sửa nhóm công việc",
          fields: GROUP_FIELDS,
          initial: { code: w.code, name: w.name, abbr: w.abbr ?? "", order: String(w.order) },
          existingCodes: workGroups.filter((x) => x.id !== w.id).map((x) => x.code),
          submit: (v) =>
            saveWorkGroup({ id: w.id, code: v.code, name: v.name, abbr: v.abbr, order: Number(v.order || 0) }),
        });
      }}
      onDelete={(r) => {
        const w = r as unknown as WorkGroupRow;
        setConfirm({
          name: w.name,
          blockMsg:
            w.taskCount > 0
              ? `Nhóm đang có ${w.taskCount} công việc. Hãy gỡ/giao lại các công việc trước khi xóa nhóm.`
              : undefined,
          run: () => deleteWorkGroup(w.id),
        });
      }}
      rowExtra={(r) => (
        <Link
          href={`/admin/catalog/${r.id}`}
          title="Khai báo Loại hình / Hạng mục / Đầu việc của nhóm này"
          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <SlidersHorizontal className="size-4" />
        </Link>
      )}
      columns={[
        {
          key: "code",
          label: "Mã",
          thClass: "w-24",
          filter: "text",
          text: (r) => String(r.code ?? ""),
          cell: (r) => <Code>{String(r.code ?? "")}</Code>,
        },
        {
          key: "abbr",
          label: "Viết tắt",
          thClass: "w-32",
          filter: "multi",
          text: (r) => String(r.abbr ?? ""),
          cell: (r) =>
            r.abbr ? (
              <span className="font-mono text-xs text-slate-600">{String(r.abbr)}</span>
            ) : (
              <Dash />
            ),
        },
        {
          key: "name",
          label: "Tên nhóm",
          filter: "text",
          text: (r) => String(r.name ?? ""),
          cell: (r) => <strong className="font-medium text-slate-800">{String(r.name)}</strong>,
        },
      ]}
    />
  );

  // ============== TAB 2 — Dự án · Hạng mục ==============
  const ctOptions = constructionTypes.map((c) => ({ value: c.id, label: c.code }));
  const groupSelectOptions = projectGroups.map((g) => ({ value: g.id, label: g.code }));
  const itemFields: Field[] = [
    {
      key: "groupId",
      label: "Dự án",
      type: "select",
      span: 3,
      required: true,
      hint: 'tạo/đổi tên dự án ở nút “Quản lý dự án”',
      options: groupSelectOptions,
    },
    {
      key: "constructionTypeId",
      label: "Loại hình",
      type: "select",
      span: 3,
      hint: "từ danh mục Loại hình công trình",
      options: [{ value: "", label: "— Không —" }, ...ctOptions],
    },
    { key: "name", label: "Hạng mục", required: true, span: 2, autoFocus: true },
    { key: "scale", label: "Quy mô (m² sàn)", span: 1, placeholder: "vd 12.000 m²" },
  ];
  const projectsView = () => (
    <FilterTable
      title="Dự án · Hạng mục"
      rows={projects as unknown as Row[]}
      addLabel="Thêm hạng mục"
      minWidth={720}
      infoBar={{
        tone: "slate",
        text: 'Mỗi dòng là một Hạng mục thuộc một Dự án, kèm Loại hình & Quy mô. Quản lý danh sách Dự án ở nút “Quản lý dự án”.',
      }}
      headerExtra={
        <button
          type="button"
          onClick={() => setManageProjects(true)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Building2 className="size-4 text-slate-400" /> Quản lý dự án
          <span className="rounded-full bg-slate-100 px-1.5 text-xs">{projectGroups.length}</span>
        </button>
      }
      onAdd={() => {
        if (projectGroups.length === 0) {
          toast.error('Chưa có dự án nào — hãy tạo dự án ở “Quản lý dự án” trước.');
          return;
        }
        setAddItems(true);
      }}
      onEdit={(r) => {
        const p = r as unknown as ProjectRow;
        setRecord({
          title: "Sửa hạng mục",
          fields: itemFields,
          initial: {
            groupId: p.groupId ?? "",
            constructionTypeId: p.constructionTypeId ?? "",
            name: p.name,
            scale: p.scale ?? "",
          },
          submit: (v) =>
            saveCatalogProject({
              id: p.id,
              groupId: v.groupId,
              name: v.name,
              constructionTypeId: v.constructionTypeId || null,
              scale: v.scale || null,
            }),
        });
      }}
      onDelete={(r) => {
        const p = r as unknown as ProjectRow;
        setConfirm({
          name: p.name,
          blockMsg:
            p.taskCount > 0
              ? `Hạng mục đang có ${p.taskCount} công việc. Hãy gỡ/chuyển các công việc trước khi xóa.`
              : undefined,
          run: () => deleteProject(p.id),
        });
      }}
      columns={[
        {
          key: "group",
          label: "Dự án",
          thClass: "w-60",
          filter: "multi",
          text: (r) => pgById.get((r.groupId as string) ?? "")?.code ?? "",
          cell: (r) => {
            const g = pgById.get((r.groupId as string) ?? "");
            return g ? (
              <span className="font-mono text-xs text-slate-600" title={g.name}>{g.code}</span>
            ) : (
              <Dash />
            );
          },
        },
        {
          key: "ct",
          label: "Loại hình",
          thClass: "w-52",
          filter: "multi",
          text: (r) => ctById.get((r.constructionTypeId as string) ?? "")?.name ?? "",
          cell: (r) => {
            const ct = ctById.get((r.constructionTypeId as string) ?? "");
            return ct ? (
              <span className="font-mono text-xs text-slate-600" title={ct.name}>
                {ct.code}
              </span>
            ) : (
              <Dash />
            );
          },
        },
        {
          key: "name",
          label: "Hạng mục",
          filter: "text",
          text: (r) => String(r.name ?? ""),
          cell: (r) => <strong className="font-medium text-slate-800">{String(r.name)}</strong>,
        },
        {
          key: "scale",
          label: "Quy mô (m² sàn)",
          thClass: "w-44",
          align: "right",
          filter: "text",
          text: (r) => String(r.scale ?? ""),
          cell: (r) =>
            r.scale ? (
              <span className="font-medium tabular-nums text-slate-700">{String(r.scale)}</span>
            ) : (
              <Dash />
            ),
        },
      ]}
    />
  );

  // ============== TAB 3 — Công việc (CatalogItem level 5) ==============
  const worksView = () => (
    <WorksPanel
      workGroups={workGroups}
      works={works}
      onBatchReorder={(ids) => reorder("catalogItem", ids)}
      onAdd={(workGroupId, value) => run(addCatalogValue(workGroupId, 5, value), "Đã thêm công việc")}
      onEdit={(r) => {
        const groupOptions = workGroups.map((w) => ({
          value: w.id,
          label: `${w.abbr ? `${w.abbr} · ` : ""}${w.name}`,
        }));
        setRecord({
          title: "Sửa công việc",
          fields: [
            { key: "workGroupId", label: "Nhóm công việc", type: "select", span: 3, required: true, options: groupOptions },
            { key: "value", label: "Tên công việc", required: true, span: 3, autoFocus: true },
          ],
          initial: { workGroupId: r.workGroupId, value: r.value },
          submit: async (v) => {
            if (v.workGroupId === r.workGroupId) return updateCatalogValue(r.id, v.value);
            const del = await deleteCatalogValue(r.id);
            if (!del.ok) return del;
            return addCatalogValue(v.workGroupId, 5, v.value);
          },
        });
      }}
      onDelete={(r) => setConfirm({ name: r.value, run: () => deleteCatalogValue(r.id) })}
    />
  );

  // ============== TAB 4/5/6 — danh mục đơn (Mã + Tên) ==============
  const simpleColumns: Col[] = [
    {
      key: "code",
      label: "Mã",
      thClass: "w-36",
      filter: "text",
      text: (r) => String(r.code ?? ""),
      cell: (r) => <Code>{String(r.code ?? "")}</Code>,
    },
    {
      key: "name",
      label: "Tên",
      filter: "text",
      text: (r) => String(r.name ?? ""),
      cell: (r) => <strong className="font-medium text-slate-800">{String(r.name)}</strong>,
    },
  ];
  const simpleFields: Field[] = [
    { key: "code", label: "Mã", required: true, mono: true, span: 1 },
    { key: "name", label: "Tên", required: true, span: 2, autoFocus: true },
  ];

  function simpleView(opts: {
    rows: SimpleRow[];
    title: string;
    addLabel: string;
    leadOrder?: boolean;
    infoBar?: { tone: "slate" | "blue"; text: string };
    reorderModel?: Parameters<typeof batchReorderItems>[0];
    save: (input: { id?: string; code: string; name: string; order?: number }) => Promise<Result<unknown>>;
    del: (id: string) => Promise<Result<unknown>>;
    usageMsg: string; // câu chặn xóa khi đang dùng
  }) {
    const fields = opts.leadOrder
      ? [...simpleFields, { key: "order", label: "Thứ tự hiển thị", type: "number" as const, span: 3 as const, hint: "số nhỏ hiện trước" }]
      : simpleFields;
    return (
      <FilterTable
        title={opts.title}
        rows={opts.rows as unknown as Row[]}
        addLabel={opts.addLabel}
        infoBar={opts.infoBar}
        onBatchReorder={opts.reorderModel ? (ids) => reorder(opts.reorderModel!, ids) : undefined}
        onAdd={() =>
          setRecord({
            title: opts.addLabel,
            fields,
            initial: { code: "", name: "", order: "0" },
            existingCodes: opts.rows.map((x) => x.code),
            submit: (v) => opts.save({ code: v.code, name: v.name, order: Number(v.order || 0) }),
          })
        }
        onEdit={(r) => {
          const s = r as unknown as SimpleRow;
          setRecord({
            title: `Sửa — ${opts.title.toLowerCase()}`,
            fields,
            initial: { code: s.code, name: s.name, order: String(s.order) },
            existingCodes: opts.rows.filter((x) => x.id !== s.id).map((x) => x.code),
            submit: (v) => opts.save({ id: s.id, code: v.code, name: v.name, order: Number(v.order || 0) }),
          });
        }}
        onDelete={(r) => {
          const s = r as unknown as SimpleRow;
          setConfirm({ name: s.name, run: () => opts.del(s.id) });
        }}
        columns={simpleColumns}
      />
    );
  }

  return (
    <div>
      {/* Header vùng */}
      <div className="border-b border-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Khai báo thông tin</h1>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                <Lock className="size-3" /> Chỉ Admin
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Danh mục nền (master data) — nguồn dữ liệu dùng chung cho Giao việc, Công việc và Báo cáo.
            </p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 sm:inline-flex">
            <Database className="size-3.5" /> 7 danh mục · 6 tab
          </span>
        </div>

        {/* Tab bar */}
        <div className="-mb-px mt-4 flex gap-0.5 overflow-x-auto">
          {TABS.map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-slate-800 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded text-[10px] font-bold",
                    active ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-500",
                  )}
                >
                  {i + 1}
                </span>
                <t.Icon className={cn("size-4", active ? "text-slate-700" : "text-slate-400")} />
                <span>{t.label}</span>
                <span
                  className={cn(
                    "rounded-full bg-slate-100 px-1.5 py-px text-[11px] font-medium",
                    active ? "text-slate-600" : "text-slate-400",
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel nội dung */}
      <div className="pt-6">
        <div>
          {tab === "groups" ? groupsView() : null}
          {tab === "projects" ? projectsView() : null}
          {tab === "works" ? worksView() : null}
          {tab === "phases"
            ? simpleView({
                rows: phases,
                title: "Giai đoạn",
                addLabel: "Thêm giai đoạn",
                leadOrder: true,
                reorderModel: "phase",
                infoBar: {
                  tone: "slate",
                  text: "Thứ tự các giai đoạn theo dòng đời dự án (Concept → Vận hành) — số Thứ tự quyết định trình tự hiển thị.",
                },
                save: savePhase,
                del: deletePhase,
                usageMsg: "Giai đoạn đang gắn công việc",
              })
            : null}
          {tab === "disciplines"
            ? simpleView({
                rows: disciplines,
                title: "Bộ môn",
                addLabel: "Thêm bộ môn",
                reorderModel: "discipline",
                save: saveDiscipline,
                del: deleteDiscipline,
                usageMsg: "Bộ môn đang được dùng",
              })
            : null}
          {tab === "ctypes"
            ? simpleView({
                rows: constructionTypes,
                title: "Loại hình công trình",
                addLabel: "Thêm loại hình",
                reorderModel: "constructionType",
                infoBar: {
                  tone: "blue",
                  text: "Danh mục này là nguồn cho cột Loại hình (droplist) khi khai báo Dự án ở tab Dự án.",
                },
                save: saveConstructionType,
                del: deleteConstructionType,
                usageMsg: "Loại hình đang được dùng cho dự án",
              })
            : null}
        </div>
      </div>

      {/* Modal thêm nhiều hạng mục */}
      {addItems ? (
        <AddMultipleItemsModal
          projectGroups={projectGroups}
          constructionTypes={constructionTypes}
          onClose={() => setAddItems(false)}
          onSubmit={async (groupId, constructionTypeId, items) => {
            const res = await batchSaveCatalogProjects({ groupId, constructionTypeId, items });
            if (res.ok) {
              toast.success(`Đã thêm ${items.length} hạng mục`);
              router.refresh();
              setAddItems(false);
            } else {
              toast.error(res.error);
            }
          }}
        />
      ) : null}

      {/* Modal thêm/sửa */}
      {record ? (
        <RecordModal
          {...record}
          onClose={() => setRecord(null)}
          onSubmit={async (values) => {
            const okMsg = record.title.startsWith("Sửa") ? "Đã lưu thay đổi" : "Đã thêm";
            const res = await run(record.submit(values), okMsg);
            if (res.ok) setRecord(null);
            return res;
          }}
        />
      ) : null}

      {/* Xác nhận xóa */}
      {confirm ? (
        <ConfirmDialog
          {...confirm}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const res = await run(confirm.run(), "Đã xóa");
            if (res.ok) setConfirm(null);
          }}
        />
      ) : null}

      {/* Quản lý dự án (cấp cha) */}
      {manageProjects ? (
        <ManageProjectsModal
          groups={projectGroups}
          onClose={() => setManageProjects(false)}
          onBatchReorder={(ids) => reorder("projectGroup", ids)}
          onAdd={() =>
            setRecord({
              title: "Thêm dự án",
              fields: GROUP_FIELDS_PROJECT,
              initial: { code: "", name: "", order: "0" },
              existingCodes: projectGroups.map((g) => g.code),
              submit: (v) => saveProjectGroup({ code: v.code, name: v.name, order: Number(v.order || 0) }),
            })
          }
          onEdit={(g) =>
            setRecord({
              title: "Sửa dự án",
              fields: GROUP_FIELDS_PROJECT,
              initial: { code: g.code, name: g.name, order: String(g.order) },
              existingCodes: projectGroups.filter((x) => x.id !== g.id).map((x) => x.code),
              submit: (v) =>
                saveProjectGroup({ id: g.id, code: v.code, name: v.name, order: Number(v.order || 0) }),
            })
          }
          onDelete={(g) =>
            setConfirm({
              name: g.name,
              blockMsg:
                g.itemCount > 0
                  ? `Dự án đang có ${g.itemCount} hạng mục. Hãy gỡ/chuyển hạng mục trước khi xóa.`
                  : undefined,
              run: () => deleteProjectGroup(g.id),
            })
          }
        />
      ) : null}
    </div>
  );
}

// ===================================================================
//  FilterTable — bảng phẳng có lọc theo cột + sort + DnD reorder
// ===================================================================
function FilterTable({
  title,
  rows,
  columns,
  addLabel,
  onAdd,
  onEdit,
  onDelete,
  onBatchReorder,
  rowExtra,
  headerExtra,
  infoBar,
  minWidth,
}: {
  title: string;
  rows: Row[];
  columns: Col[];
  addLabel: string;
  onAdd: () => void;
  onEdit: (r: Row) => void;
  onDelete: (r: Row) => void;
  onBatchReorder?: (ids: string[]) => Promise<void>;
  rowExtra?: (r: Row) => React.ReactNode;
  headerExtra?: React.ReactNode;
  infoBar?: { tone: "slate" | "blue"; text: string };
  minWidth?: number;
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [colFilters, setColFilters] = React.useState<Record<string, string | string[]>>({});
  const [openFilter, setOpenFilter] = React.useState<{ key: string; rect: DOMRect } | null>(null);
  // local ordering for optimistic DnD update
  const [localIds, setLocalIds] = React.useState<string[]>(() => rows.map((r) => r.id));
  React.useEffect(() => { setLocalIds(rows.map((r) => r.id)); }, [rows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colByKey = React.useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const setCF = (k: string, v: string | string[]) => setColFilters((s) => ({ ...s, [k]: v }));
  const clearCol = (k: string) =>
    setColFilters((s) => { const n = { ...s }; delete n[k]; return n; });
  const clearAll = () => setColFilters({});

  const colActive = (c: Col): boolean => {
    const v = colFilters[c.key];
    if (v == null) return false;
    return Array.isArray(v) ? v.length > 0 : !!v;
  };
  const activeCols = columns.filter(colActive);

  const multiOpts = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of columns) {
      if (c.filter === "multi") {
        m.set(c.key, [...new Set(rows.map((r) => c.text(r)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")));
      }
    }
    return m;
  }, [columns, rows]);

  // Khi không sort/filter + có DnD: dùng localIds để giữ thứ tự optimistic
  const filtered = React.useMemo(() => {
    const hasFilter = columns.some((c) => {
      const v = colFilters[c.key];
      return v != null && (Array.isArray(v) ? v.length > 0 : !!v);
    });
    let out = rows.filter((r) =>
      columns.every((c) => {
        const v = colFilters[c.key];
        if (v == null || (Array.isArray(v) && v.length === 0) || v === "") return true;
        if (c.filter === "multi") return (v as string[]).includes(c.text(r));
        return norm(c.text(r)).includes(norm(v as string));
      }),
    );
    if (sort) {
      const c = colByKey.get(sort.key);
      if (c) {
        out = [...out].sort((a, b) => {
          const va = c.sortVal ? c.sortVal(a) : norm(c.text(a));
          const vb = c.sortVal ? c.sortVal(b) : norm(c.text(b));
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "vi");
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    } else if (!hasFilter && onBatchReorder) {
      // Preserve DnD order from localIds
      const byId = new Map(out.map((r) => [r.id, r]));
      out = localIds.map((id) => byId.get(id)).filter(Boolean) as Row[];
    }
    return out;
  }, [rows, columns, colFilters, sort, colByKey, localIds, onBatchReorder]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localIds.indexOf(active.id as string);
      const newIndex = localIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(localIds, oldIndex, newIndex);
        setLocalIds(next);
        onBatchReorder?.(next);
      }
    }
  }

  const canDrag = !!onBatchReorder && !sort && activeCols.length === 0;

  const toggleSort = (k: string) =>
    setSort((s) => (s && s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  const chipText = (c: Col): string => {
    const v = colFilters[c.key];
    if (c.filter === "multi") { const arr = v as string[]; return arr.length === 1 ? arr[0] : `${arr.length} mục`; }
    return `"${v as string}"`;
  };

  const colCount = columns.length + (onBatchReorder ? 2 : 1);
  const openCol = openFilter ? colByKey.get(openFilter.key) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {filtered.length}
          {activeCols.length ? <span className="text-slate-400"> / {rows.length}</span> : null}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {headerExtra}
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
          >
            <Plus className="size-4" /> {addLabel}
          </button>
        </div>
      </div>

      {infoBar ? (
        <div className="px-4 pt-3">
          <div className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px]",
            infoBar.tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{infoBar.text}</span>
          </div>
        </div>
      ) : null}

      {/* Filter chips */}
      {activeCols.length ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
            <Filter className="size-3.5" /> Lọc:
          </span>
          {activeCols.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs shadow-sm">
              <span className="text-slate-400">{c.label}:</span>
              <span className="font-medium text-slate-700">{chipText(c)}</span>
              <button type="button" onClick={() => clearCol(c.key)}
                className="grid size-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll}
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-400 hover:text-red-600">
            <RotateCcw className="size-3" /> Xóa tất cả
          </button>
        </div>
      ) : null}

      {/* Bảng */}
      <div className="overflow-x-auto px-1.5 py-1.5">
        <table className="w-full border-collapse text-sm" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-400">
              {onBatchReorder ? <th className="w-8 px-2 py-2" /> : null}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const on = colActive(c);
                return (
                  <th key={c.key} className={cn("px-3 py-2", c.thClass, c.align === "right" && "text-right")}>
                    <div className={cn("flex items-center gap-1", c.align === "right" && "justify-end")}>
                      <button type="button" onClick={() => toggleSort(c.key)} className="flex items-center gap-1 hover:text-slate-700">
                        <span>{c.label}</span>
                        {active ? (sort?.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ChevronsUpDown className="size-3 opacity-25" />}
                      </button>
                      {c.filter ? (
                        <button type="button" title="Lọc cột này"
                          onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setOpenFilter((o) => (o && o.key === c.key ? null : { key: c.key, rect })); }}
                          className={cn("grid size-5 place-items-center rounded", on ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-200")}>
                          <Filter className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  </th>
                );
              })}
              <th className="w-24 px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {filtered.map((r) => (
                  <SortableTableRow key={r.id} id={r.id} showHandle={!!onBatchReorder} canDrag={canDrag}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2.5", c.align === "right" && "text-right")}>
                        {c.cell(r)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-0.5 opacity-60 transition group-hover:opacity-100">
                        {rowExtra ? rowExtra(r) : null}
                        <button type="button" title="Sửa" onClick={() => onEdit(r)}
                          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <Pencil className="size-4" />
                        </button>
                        <button type="button" title="Xóa" onClick={() => onDelete(r)}
                          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </SortableTableRow>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="py-10 text-center text-sm text-slate-400">
                      {activeCols.length ? "Không có dòng nào khớp bộ lọc" : "Chưa có mục nào"}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>

      {/* Popover lọc */}
      {openFilter && openCol ? (
        <FilterPopover rect={openFilter.rect} col={openCol} value={colFilters[openCol.key]}
          options={multiOpts.get(openCol.key) ?? []} onChange={(v) => setCF(openCol.key, v)}
          onClear={() => clearCol(openCol.key)} onClose={() => setOpenFilter(null)} />
      ) : null}
    </div>
  );
}

// ---------- Hàng kéo thả trong bảng ----------
function SortableTableRow({
  id, children, showHandle, canDrag,
}: {
  id: string; children: React.ReactNode; showHandle: boolean; canDrag: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group border-t border-slate-100 hover:bg-slate-50/70", isDragging && "opacity-40 bg-slate-50")}
      {...attributes}
    >
      {showHandle ? (
        <td className="w-8 px-2 py-2.5">
          <button
            {...listeners}
            tabIndex={-1}
            className={cn("grid size-6 place-items-center rounded text-slate-300 hover:text-slate-500 transition-colors",
              canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-30")}
            title={canDrag ? "Kéo để sắp xếp" : "Xóa bộ lọc / sort để kéo"}
          >
            <GripVertical className="size-4" />
          </button>
        </td>
      ) : null}
      {children}
    </tr>
  );
}

// ---------- Popover lọc (portal) ----------
function FilterPopover({
  rect,
  col,
  value,
  options,
  onChange,
  onClear,
  onClose,
}: {
  rect: DOMRect;
  col: Col;
  value: string | string[] | undefined;
  options: string[];
  onChange: (v: string | string[]) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onScroll(e: Event) {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const isMulti = col.filter === "multi";
  const width = isMulti ? 256 : 240;
  const left = Math.min(rect.left, window.innerWidth - width - 12);
  const top = Math.min(rect.bottom + 6, window.innerHeight - 80);
  const sel = (value as string[]) ?? [];
  const active = isMulti ? sel.length > 0 : !!value;
  const shownOpts = options.filter((o) => norm(o).includes(norm(q)));
  const toggle = (o: string) => onChange(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", left: Math.max(8, left), top, width }}
      className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-xs font-semibold text-slate-700">{col.label}</span>
        {active ? (
          <button type="button" onClick={onClear} className="text-[11px] font-medium text-slate-400 hover:text-red-600">
            Xóa
          </button>
        ) : null}
      </div>
      {isMulti ? (
        <div>
          {options.length >= 6 ? (
            <div className="relative border-b border-slate-100 p-2">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm…"
                className="h-7 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-xs outline-none focus:border-slate-400 focus:bg-white"
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400">
            <span>{sel.length ? `${sel.length} đã chọn` : "Chọn giá trị"}</span>
            {sel.length ? (
              <button type="button" onClick={() => onChange([])} className="hover:text-slate-600">
                Bỏ chọn
              </button>
            ) : null}
          </div>
          <ul className="max-h-60 overflow-auto pb-1">
            {shownOpts.map((o) => {
              const on = sel.includes(o);
              return (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => toggle(o)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border",
                        on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300",
                      )}
                    >
                      {on ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate">{o}</span>
                  </button>
                </li>
              );
            })}
            {shownOpts.length === 0 ? <li className="px-3 py-2 text-xs text-slate-400">Không có kết quả</li> : null}
          </ul>
        </div>
      ) : (
        <div className="p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`Lọc theo ${col.label.toLowerCase()}…`}
              className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[13px] outline-none focus:border-slate-400 focus:bg-white"
            />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ===================================================================
//  RecordModal — form thêm/sửa chung
// ===================================================================
type Field = {
  key: string;
  label: string;
  required?: boolean;
  mono?: boolean;
  uppercase?: boolean;
  type?: "text" | "number" | "select";
  placeholder?: string;
  hint?: string;
  span?: 1 | 2 | 3;
  options?: { value: string; label: string }[];
  maxLength?: number;
  autoFocus?: boolean;
};

function RecordModal({
  title,
  subtitle,
  fields,
  initial,
  existingCodes,
  onSubmit,
  onClose,
}: {
  title: string;
  subtitle?: string;
  fields: Field[];
  initial: Record<string, string>;
  existingCodes?: string[];
  onSubmit: (values: Record<string, string>) => Promise<Result<unknown>>;
  onClose: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setErr(`Vui lòng nhập ${f.label}.`);
        return;
      }
    }
    if (existingCodes && values.code) {
      const dup = existingCodes.some((c) => norm(c) === norm(values.code));
      if (dup) {
        setErr(`Mã "${values.code}" đã tồn tại.`);
        return;
      }
    }
    setErr(null);
    setPending(true);
    const res = await onSubmit(values);
    setPending(false);
    if (!res.ok) setErr(res.error);
  }

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  return (
    <Modal open onClose={onClose} title={title} className="max-w-lg">
      <form onSubmit={submit} className="space-y-3">
        {subtitle ? <p className="-mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        <div className="grid grid-cols-3 gap-3">
          {fields.map((f) => (
            <div
              key={f.key}
              className={cn("space-y-1.5", f.span === 3 ? "col-span-3" : f.span === 2 ? "col-span-2" : "col-span-1")}
            >
              <label className="text-xs font-medium text-slate-600">
                {f.label}
                {f.required ? <span className="text-red-500"> *</span> : null}
              </label>
              {f.type === "select" ? (
                <Select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="h-9">
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <input
                  className={cn(inputCls, f.mono && "font-mono", f.uppercase && "uppercase")}
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  autoFocus={f.autoFocus}
                  onChange={(e) => set(f.key, f.uppercase ? e.target.value.toUpperCase() : e.target.value)}
                />
              )}
              {f.hint ? <p className="text-[11px] text-slate-400">{f.hint}</p> : null}
            </div>
          ))}
        </div>
        {err ? (
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="size-3.5" /> {err}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            <Check className="size-4" /> {pending ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===================================================================
//  ConfirmDialog — xác nhận xóa
// ===================================================================
function ConfirmDialog({
  name,
  warnMsg,
  blockMsg,
  onConfirm,
  onClose,
}: {
  name: string;
  warnMsg?: string;
  blockMsg?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <Modal open onClose={onClose} title="Xác nhận xóa" className="max-w-md">
      <div className="space-y-3">
        <p className="text-sm text-slate-700">
          Bạn chắc chắn muốn xóa <strong className="font-medium">&quot;{name}&quot;</strong>? Hành động này không thể
          hoàn tác.
        </p>
        {blockMsg ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {blockMsg}
          </div>
        ) : warnMsg ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {warnMsg}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {blockMsg ? "Đóng" : "Hủy"}
          </Button>
          {blockMsg ? null : (
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                await onConfirm();
                setPending(false);
              }}
            >
              <Trash2 className="size-4" /> Xóa
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ===================================================================
//  ManageProjectsModal — quản lý danh sách Dự án (cấp cha) + DnD
// ===================================================================
function ManageProjectsModal({
  groups,
  onAdd,
  onEdit,
  onDelete,
  onBatchReorder,
  onClose,
}: {
  groups: ProjectGroupRow[];
  onAdd: () => void;
  onEdit: (g: ProjectGroupRow) => void;
  onDelete: (g: ProjectGroupRow) => void;
  onBatchReorder?: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  const [localIds, setLocalIds] = React.useState<string[]>(() => groups.map((g) => g.id));
  React.useEffect(() => { setLocalIds(groups.map((g) => g.id)); }, [groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = React.useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const orderedGroups = localIds.map((id) => byId.get(id)).filter(Boolean) as ProjectGroupRow[];
  const shown = q ? orderedGroups.filter((g) => norm(g.name).includes(norm(q)) || norm(g.code).includes(norm(q))) : orderedGroups;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localIds.indexOf(active.id as string);
      const newIndex = localIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(localIds, oldIndex, newIndex);
        setLocalIds(next);
        onBatchReorder?.(next);
      }
    }
  }

  return (
    <Modal open onClose={onClose} title="Quản lý dự án" className="max-w-xl">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm dự án…"
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-sm outline-none focus:border-slate-400 focus:bg-white" />
          </div>
          <button type="button" onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            <Plus className="size-4" /> Thêm dự án
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localIds} strategy={verticalListSortingStrategy}>
            <div className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {shown.map((g) => (
                <SortableProjectGroupItem key={g.id} group={g} onEdit={onEdit} onDelete={onDelete}
                  showHandle={!!onBatchReorder && !q} />
              ))}
              {shown.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {groups.length ? "Không có dự án khớp tìm kiếm" : "Chưa có dự án nào"}
                </p>
              ) : null}
            </div>
          </SortableContext>
        </DndContext>
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button onClick={onClose}>Xong</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Sortable item cho ManageProjectsModal ----------
function SortableProjectGroupItem({
  group, onEdit, onDelete, showHandle,
}: {
  group: ProjectGroupRow; onEdit: (g: ProjectGroupRow) => void; onDelete: (g: ProjectGroupRow) => void; showHandle: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group flex items-center gap-2 px-3 py-2", isDragging && "opacity-40 bg-slate-50")}
      {...attributes}
    >
      {showHandle ? (
        <button {...listeners} tabIndex={-1}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors shrink-0">
          <GripVertical className="size-4" />
        </button>
      ) : null}
      <Code>{group.code}</Code>
      <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{group.name}</span>
      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{group.itemCount} hạng mục</span>
      <div className="flex gap-0.5 opacity-60 transition group-hover:opacity-100">
        <button type="button" title="Sửa" onClick={() => onEdit(group)}
          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <Pencil className="size-4" />
        </button>
        <button type="button" title="Xóa" onClick={() => onDelete(group)}
          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600">
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ===================================================================
//  WorksPanel — Tab 3 Công việc: tabs nhóm ngang + list DnD + thêm inline
// ===================================================================
function WorksPanel({
  workGroups,
  works,
  onAdd,
  onEdit,
  onDelete,
  onBatchReorder,
}: {
  workGroups: WorkGroupRow[];
  works: WorkRow[];
  onAdd: (workGroupId: string, value: string) => void;
  onEdit: (r: WorkRow) => void;
  onDelete: (r: WorkRow) => void;
  onBatchReorder?: (ids: string[]) => Promise<void>;
}) {
  const [activeWg, setActiveWg] = React.useState<string>(workGroups[0]?.id ?? "");
  const [newValue, setNewValue] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [err, setErr] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = works.filter((w) => w.workGroupId === activeWg);
  const activeGroup = workGroups.find((w) => w.id === activeWg);

  // Local ids for optimistic DnD
  const [localIds, setLocalIds] = React.useState<string[]>(() => filtered.map((w) => w.id));
  React.useEffect(() => { setLocalIds(filtered.map((w) => w.id)); }, [activeWg, works]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const displayItems = React.useMemo(() => {
    const byId = new Map(filtered.map((w) => [w.id, w]));
    return localIds.map((id) => byId.get(id)).filter(Boolean) as WorkRow[];
  }, [localIds, filtered]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localIds.indexOf(active.id as string);
      const newIndex = localIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(localIds, oldIndex, newIndex);
        setLocalIds(next);
        onBatchReorder?.(next);
      }
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const val = newValue.trim();
    if (!val) { setErr("Vui lòng nhập tên công việc."); return; }
    if (filtered.some((w) => norm(w.value) === norm(val))) {
      setErr("Tên công việc đã tồn tại trong nhóm này."); return;
    }
    setErr("");
    setAdding(true);
    await onAdd(activeWg, val);
    setAdding(false);
    setNewValue("");
    inputRef.current?.focus();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-slate-800">Công việc</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{filtered.length}</span>
        <span className="ml-auto text-xs text-slate-400">Nguồn gợi ý khi tạo công việc ở màn Giao việc</span>
      </div>

      {/* Tabs nhóm công việc */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5">
        {workGroups.map((w) => {
          const count = works.filter((x) => x.workGroupId === w.id).length;
          const active = activeWg === w.id;
          return (
            <button key={w.id} type="button"
              onClick={() => { setActiveWg(w.id); setNewValue(""); setErr(""); }}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800")}>
              {w.abbr ? (
                <span className={cn("rounded px-1 font-mono text-[10px] font-bold", active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>{w.abbr}</span>
              ) : null}
              {w.name}
              <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400")}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Danh sách công việc của nhóm đang chọn */}
      <div className="px-4 py-3">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Chưa có công việc nào trong nhóm này</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localIds} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {displayItems.map((w) => (
                  <SortableWorkItem key={w.id} item={w} onEdit={onEdit} onDelete={onDelete} showHandle={!!onBatchReorder} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {/* Form thêm mới inline */}
        <form onSubmit={handleAdd} className="mt-3 flex items-start gap-2">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 focus-within:border-slate-500 focus-within:bg-white">
              <Plus className="size-4 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={newValue}
                onChange={(e) => { setNewValue(e.target.value); setErr(""); }}
                placeholder={`Thêm công việc mới vào "${activeGroup?.name ?? ""}"…`}
                className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              {newValue && (
                <button type="button" onClick={() => { setNewValue(""); setErr(""); }} className="text-slate-400 hover:text-slate-600">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {err ? <p className="flex items-center gap-1 text-[11px] text-red-600"><AlertCircle className="size-3" />{err}</p> : null}
          </div>
          <button
            type="submit"
            disabled={adding || !newValue.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Check className="size-4" />{adding ? "Đang lưu…" : "Thêm"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- Sortable list item cho WorksPanel ----------
function SortableWorkItem({
  item, onEdit, onDelete, showHandle,
}: {
  item: WorkRow; onEdit: (r: WorkRow) => void; onDelete: (r: WorkRow) => void; showHandle: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50", isDragging && "opacity-40 bg-slate-50")}
      {...attributes}
    >
      {showHandle ? (
        <button {...listeners} tabIndex={-1}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors shrink-0">
          <GripVertical className="size-4" />
        </button>
      ) : null}
      <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{item.value}</span>
      <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button type="button" title="Sửa" onClick={() => onEdit(item)}
          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <Pencil className="size-3.5" />
        </button>
        <button type="button" title="Xóa" onClick={() => onDelete(item)}
          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

// ---------- mảnh nhỏ ----------
function Code({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs text-slate-600">
      {children}
    </span>
  );
}
function Dash() {
  return <span className="text-slate-300">—</span>;
}

// ===================================================================
//  AddMultipleItemsModal — thêm nhiều hạng mục cho cùng Dự án + Loại hình
// ===================================================================
type ItemRow = { id: string; name: string; scale: string };

function AddMultipleItemsModal({
  projectGroups,
  constructionTypes,
  onClose,
  onSubmit,
}: {
  projectGroups: ProjectGroupRow[];
  constructionTypes: SimpleRow[];
  onClose: () => void;
  onSubmit: (
    groupId: string,
    constructionTypeId: string | null,
    items: { name: string; scale: string | null }[],
  ) => Promise<void>;
}) {
  const [groupId, setGroupId] = React.useState(projectGroups[0]?.id ?? "");
  const [ctId, setCtId] = React.useState("");
  const [rows, setRows] = React.useState<ItemRow[]>([{ id: crypto.randomUUID(), name: "", scale: "" }]);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  function addRow() {
    setRows((prev) => [...prev, { id: crypto.randomUUID(), name: "", scale: "" }]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function setRow(id: string, field: "name" | "scale", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setErr(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId) { setErr("Chọn dự án."); return; }
    const valid = rows.filter((r) => r.name.trim());
    if (!valid.length) { setErr("Nhập ít nhất 1 hạng mục."); return; }
    setErr(null);
    setPending(true);
    await onSubmit(groupId, ctId || null, valid.map((r) => ({ name: r.name.trim(), scale: r.scale.trim() || null })));
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title="Thêm hạng mục" className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dự án + Loại hình — dùng chung cho tất cả hạng mục */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              Dự án <span className="text-red-500">*</span>
            </label>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9">
              {projectGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
              ))}
            </Select>
            <p className="text-[11px] text-slate-400">tạo/đổi tên dự án ở nút "Quản lý dự án"</p>
          </div>
          <div className="col-span-3 space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Loại hình</label>
            <Select value={ctId} onChange={(e) => setCtId(e.target.value)} className="h-9">
              <option value="">— Không —</option>
              {constructionTypes.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </Select>
            <p className="text-[11px] text-slate-400">từ danh mục Loại hình công trình</p>
          </div>
        </div>

        {/* Danh sách hạng mục */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_160px_28px] gap-2 px-1">
            <span className="text-xs font-medium text-slate-500">Hạng mục <span className="text-red-500">*</span></span>
            <span className="text-xs font-medium text-slate-500">Quy mô (m² sàn)</span>
            <span />
          </div>
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {rows.map((row, idx) => (
              <div key={row.id} className="grid grid-cols-[1fr_160px_28px] items-center gap-2">
                <input
                  className={inputCls}
                  value={row.name}
                  placeholder={`Hạng mục ${idx + 1}`}
                  autoFocus={idx === 0}
                  onChange={(e) => setRow(row.id, "name", e.target.value)}
                />
                <input
                  className={inputCls}
                  value={row.scale}
                  placeholder="vd 12.000 m²"
                  onChange={(e) => setRow(row.id, "scale", e.target.value)}
                />
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="grid size-7 place-items-center rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500"
                    title="Xóa dòng này"
                  >
                    <X className="size-4" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>

          {/* Nút thêm dòng */}
          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-slate-500 hover:text-slate-700"
          >
            <Plus className="size-4" /> Thêm hạng mục
          </button>
        </div>

        {err ? (
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="size-3.5" /> {err}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={pending}>
            <Check className="size-4" /> {pending ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Cấu hình field cho Dự án (cấp cha) — thêm/sửa trong "Quản lý dự án".
const GROUP_FIELDS_PROJECT: Field[] = [
  { key: "code", label: "Mã dự án", required: true, mono: true, span: 1 },
  { key: "name", label: "Tên dự án", required: true, span: 2, autoFocus: true },
  { key: "order", label: "Thứ tự hiển thị", type: "number", span: 3, hint: "số nhỏ hiện trước" },
];

// Cấu hình field cho Nhóm công việc (dùng ở 2 nơi: thêm & sửa).
const GROUP_FIELDS: Field[] = [
  { key: "code", label: "Mã", required: true, mono: true, span: 1 },
  { key: "name", label: "Tên nhóm", required: true, span: 2, autoFocus: true },
  { key: "abbr", label: "Viết tắt", mono: true, uppercase: true, span: 1, maxLength: 6, hint: "→ XD-001" },
  { key: "order", label: "Thứ tự hiển thị", type: "number", span: 2, hint: "số nhỏ hiện trước" },
];
