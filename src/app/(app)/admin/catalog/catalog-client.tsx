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
  Copy,
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
import { SearchableCombobox } from "@/components/searchable-combobox";
import { cn, removeVietnameseTones } from "@/lib/utils";
import {
  addCatalogValue,
  batchReorderItems,
  batchSaveCatalogItems,
  batchUpdateSimpleCatalog,
  batchUpdateCatalogItems,
  createCatalogItemReturnId,
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
  batchUpdateCatalogProjects,
  createProjectGroupReturnId,
  deleteProject,
  deleteProjectGroup,
  saveCatalogProject,
  saveProjectGroup,
} from "@/server/actions/projects";
import { LevelColumn } from "./[workGroupId]/catalog-detail";
import type { Result } from "@/server/actions/_helpers";

const norm = removeVietnameseTones;

// ---------- Kiểu dữ liệu hàng ----------
type WorkGroupRow = { id: string; code: string; abbr: string | null; name: string; order: number; taskCount: number };
type ProjectGroupRow = { id: string; code: string; name: string; order: number; itemCount: number; workGroupId: string | null };
type ProjectRow = {
  id: string;
  groupId: string | null;
  code: string;
  name: string;
  blockSystem: string | null;
  scale: string | null;
  constructionTypeId: string | null;
  taskCount: number;
};
type WorkRow = { id: string; workGroupId: string; value: string; order: number };
type SimpleRow = { id: string; code: string; name: string; order: number };
type Row = { id: string; order: number } & Record<string, unknown>;

type TabId = "groups" | "projects" | "bimtools" | "works" | "phases" | "disciplines" | "ctypes";
type ProjectsScope = "general" | "bimtools";
type SimpleCatalogModel = "workGroup" | "phase" | "discipline" | "constructionType";

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
  ptItems,
}: {
  workGroups: WorkGroupRow[];
  phases: SimpleRow[];
  disciplines: SimpleRow[];
  constructionTypes: SimpleRow[];
  projectGroups: ProjectGroupRow[];
  projects: ProjectRow[];
  works: WorkRow[];
  ptItems: { id: string; level: number; value: string; parentId: string | null; projectGroupId: string | null; order: number }[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>("groups");
  const [manageProjectsScope, setManageProjectsScope] = React.useState<string | null>(null);

  const ptWorkGroupId = workGroups.find((w) => w.abbr === "PT")?.id ?? null;
  const generalProjectGroups = projectGroups.filter((g) => !g.workGroupId);
  const generalProjects = projects.filter((p) => generalProjectGroups.some((g) => g.id === p.groupId));
  const ptLevel2 = ptItems.filter((i) => i.level === 2).map((i) => ({ id: i.id, value: i.value, order: i.order }));
  const ptLevel3 = ptItems.filter((i) => i.level === 3).map((i) => ({ id: i.id, value: i.value, parentId: i.parentId, projectGroupId: i.projectGroupId, order: i.order }));
  const ptLevel5 = works.filter((w) => w.workGroupId === ptWorkGroupId).map((w) => ({ id: w.id, value: w.value }));
  const ptL2ById = React.useMemo(() => new Map(ptLevel2.map((l) => [l.id, l])), [ptLevel2]);
  const ptProjectGroups = React.useMemo(
    () => projectGroups.filter((g) => g.workGroupId === ptWorkGroupId),
    [projectGroups, ptWorkGroupId],
  );
  const ptPgById = React.useMemo(() => new Map(ptProjectGroups.map((g) => [g.id, g])), [ptProjectGroups]);
  const generalProjectGroupLabels = React.useMemo(
    () => generalProjectGroups.map((g) => `${g.code} — ${g.name}`),
    [generalProjectGroups],
  );
  const projectGroupLabelById = React.useMemo(
    () => new Map(generalProjectGroups.map((g) => [g.id, `${g.code} — ${g.name}`])),
    [generalProjectGroups],
  );
  const projectGroupIdByLabel = React.useMemo(
    () => new Map(generalProjectGroups.map((g) => [`${g.code} — ${g.name}`, g.id])),
    [generalProjectGroups],
  );
  const ctLabels = React.useMemo(
    () => constructionTypes.map((c) => `${c.code} — ${c.name}`),
    [constructionTypes],
  );
  const ctLabelById = React.useMemo(
    () => new Map(constructionTypes.map((c) => [c.id, `${c.code} — ${c.name}`])),
    [constructionTypes],
  );
  const ctIdByLabel = React.useMemo(
    () => new Map(constructionTypes.map((c) => [`${c.code} — ${c.name}`, c.id])),
    [constructionTypes],
  );

  // Bulk edit state
  const [bulkProjectEdit, setBulkProjectEdit] = React.useState<{
    ids: string[];
    field: "groupId" | "constructionTypeId" | "name" | "blockSystem";
  } | null>(null);
  const [bulkBimtoolsEdit, setBulkBimtoolsEdit] = React.useState<{
    ids: string[];
    field: "projectGroupId" | "parentId" | "value";
  } | null>(null);
  const [bulkSimpleEdit, setBulkSimpleEdit] = React.useState<{
    model: SimpleCatalogModel;
    ids: string[];
    title: string;
    field: "code" | "name" | "abbr" | "order";
  } | null>(null);
  const [bulkWorksEdit, setBulkWorksEdit] = React.useState<{
    ids: string[];
    field: "workGroupId" | "value";
  } | null>(null);

  // Modal thêm/sửa + xác nhận xóa (dùng chung).
  const [addItemsScope, setAddItemsScope] = React.useState<string | null>(null);
  const [addBimtoolsItems, setAddBimtoolsItems] = React.useState(false);
  const [manageBimtoolsL2, setManageBimtoolsL2] = React.useState(false);
  const [managePtProjects, setManagePtProjects] = React.useState(false);

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
    { id: "projects", label: "Dự án", Icon: Building2, count: generalProjectGroups.length },
    { id: "bimtools", label: "Dự án BIM Tools", Icon: SlidersHorizontal, count: ptLevel3.length },
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
      selectable
      bulkBar={(ids, clear) => (
        <CatalogBulkBar
          count={ids.length}
          onClear={clear}
          actions={[
            { label: "Đổi mã", onClick: () => setBulkSimpleEdit({ model: "workGroup", ids, title: "nhóm công việc", field: "code" }) },
            { label: "Đổi tên", onClick: () => setBulkSimpleEdit({ model: "workGroup", ids, title: "nhóm công việc", field: "name" }) },
            { label: "Đổi viết tắt", onClick: () => setBulkSimpleEdit({ model: "workGroup", ids, title: "nhóm công việc", field: "abbr" }) },
            { label: "Đổi thứ tự", onClick: () => setBulkSimpleEdit({ model: "workGroup", ids, title: "nhóm công việc", field: "order" }) },
          ]}
        />
      )}
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
      rowExtra={(r) => {
        const wg = r as unknown as WorkGroupRow;
        if (wg.abbr === "QL" || wg.abbr === "TT")
          return (
            <button type="button" title="Xem Dự án" onClick={() => setTab("projects")}
              className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <SlidersHorizontal className="size-4" />
            </button>
          );
        if (wg.abbr === "PT")
          return (
            <button type="button" title="Xem Dự án BIM Tools" onClick={() => setTab("bimtools")}
              className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <SlidersHorizontal className="size-4" />
            </button>
          );
        return (
          <Link href={`/admin/catalog/${r.id}`} title="Khai báo Loại hình / Hạng mục / Đầu việc của nhóm này"
            className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <SlidersHorizontal className="size-4" />
          </Link>
        );
      }}
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

  // ============== TAB 2 — Dự án · Hạng mục (Quản lý BIM / Thanh tra BIM) ==============
  const ctOptions = constructionTypes.map((c) => ({ value: c.id, label: c.code }));
  const generalGroupSelectOptions = generalProjectGroups.map((g) => ({ value: g.id, label: g.code }));
  const generalItemFields: Field[] = [
    {
      key: "groupId",
      label: "Dự án",
      type: "combobox",
      span: 3,
      required: true,
      hint: 'tạo/đổi tên dự án ở nút "Quản lý dự án"',
      options: generalGroupSelectOptions,
    },
    {
      key: "constructionTypeId",
      label: "Loại hình",
      type: "combobox",
      span: 3,
      hint: "từ danh mục Loại hình công trình",
      options: [{ value: "", label: "— Không —" }, ...ctOptions],
    },
    { key: "name", label: "Hạng mục", required: true, span: 2, autoFocus: true },
    { key: "blockSystem", label: "Khối/Hệ thống", span: 1 },
    { key: "scale", label: "Quy mô (m² sàn)", span: 1, placeholder: "vd 12.000 m²" },
  ];
  const projectsView = () => (
    <FilterTable
      title="Dự án · Hạng mục"
      rows={generalProjects as unknown as Row[]}
      addLabel="Thêm hạng mục"
      minWidth={720}
      selectable
      bulkBar={(ids, clear) => (
        <CatalogBulkBar
          count={ids.length}
          onClear={clear}
          actions={[
            { label: "Đổi Dự án", onClick: () => setBulkProjectEdit({ ids, field: "groupId" }) },
            { label: "Đổi Loại hình", onClick: () => setBulkProjectEdit({ ids, field: "constructionTypeId" }) },
            { label: "Đổi Hạng mục", onClick: () => setBulkProjectEdit({ ids, field: "name" }) },
            { label: "Đổi Khối/Hệ thống", onClick: () => setBulkProjectEdit({ ids, field: "blockSystem" }) },
            {
              label: "Xóa dòng đã chọn",
              tone: "danger",
              onClick: () => {
                const selected = generalProjects.filter((p) => ids.includes(p.id));
                const blocked = selected.filter((p) => p.taskCount > 0);
                setConfirm({
                  name: `${ids.length} hạng mục đã chọn`,
                  blockMsg: blocked.length
                    ? `${blocked.length} hạng mục đang có công việc. Hãy gỡ/chuyển các công việc trước khi xóa.`
                    : undefined,
                  warnMsg: `Sẽ xóa ${ids.length} hạng mục đã chọn.`,
                  run: async () => {
                    for (const id of ids) {
                      const res = await deleteProject(id);
                      if (!res.ok) return res;
                    }
                    clear();
                    return { ok: true, data: null } satisfies Result<null>;
                  },
                });
              },
            },
          ]}
        />
      )}
      infoBar={{ tone: "slate", text: 'Dự án của nhóm Quản lý BIM & Thanh tra BIM — mỗi dòng là một Hạng mục. Quản lý danh sách Dự án ở nút "Quản lý dự án".' }}
      headerExtra={
        <button type="button" onClick={() => setManageProjectsScope("general")}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Building2 className="size-4 text-slate-400" /> Quản lý dự án
          <span className="rounded-full bg-slate-100 px-1.5 text-xs">{generalProjectGroups.length}</span>
        </button>
      }
      onAdd={() => {
        if (generalProjectGroups.length === 0) { toast.error('Chưa có dự án nào — hãy tạo dự án ở "Quản lý dự án" trước.'); return; }
        setAddItemsScope("general");
      }}
      onEdit={(r) => {
        const p = r as unknown as ProjectRow;
        setRecord({ title: "Sửa hạng mục", fields: generalItemFields, initial: { groupId: p.groupId ?? "", constructionTypeId: p.constructionTypeId ?? "", name: p.name, blockSystem: p.blockSystem ?? "", scale: p.scale ?? "" },
          submit: (v) => saveCatalogProject({ id: p.id, groupId: v.groupId, name: v.name, blockSystem: v.blockSystem || null, constructionTypeId: v.constructionTypeId || null, scale: v.scale || null }) });
      }}
      onDuplicate={(r) => {
        const p = r as unknown as ProjectRow;
        setRecord({ title: "Nhân bản hạng mục", fields: generalItemFields, initial: { groupId: p.groupId ?? "", constructionTypeId: p.constructionTypeId ?? "", name: p.name, blockSystem: p.blockSystem ?? "", scale: p.scale ?? "" },
          submit: (v) => saveCatalogProject({ groupId: v.groupId, name: v.name, blockSystem: v.blockSystem || null, constructionTypeId: v.constructionTypeId || null, scale: v.scale || null }) });
      }}
      onDelete={(r) => {
        const p = r as unknown as ProjectRow;
        setConfirm({ name: p.name, blockMsg: p.taskCount > 0 ? `Hạng mục đang có ${p.taskCount} công việc. Hãy gỡ/chuyển các công việc trước khi xóa.` : undefined, run: () => deleteProject(p.id) });
      }}
      columns={[
        { key: "group", label: "Dự án", thClass: "w-60", filter: "multi",
          text: (r) => pgById.get((r.groupId as string) ?? "")?.code ?? "",
          cell: (r) => { const g = pgById.get((r.groupId as string) ?? ""); return g ? <span className="font-mono text-xs text-slate-600" title={g.name}>{g.code}</span> : <Dash />; } },
        { key: "ct", label: "Loại hình", thClass: "w-52", filter: "multi",
          text: (r) => ctById.get((r.constructionTypeId as string) ?? "")?.name ?? "",
          cell: (r) => { const ct = ctById.get((r.constructionTypeId as string) ?? ""); return ct ? <span className="font-mono text-xs text-slate-600" title={ct.name}>{ct.code}</span> : <Dash />; } },
        { key: "name", label: "Hạng mục", filter: "text", text: (r) => String(r.name ?? ""), cell: (r) => <strong className="font-medium text-slate-800">{String(r.name)}</strong> },
        { key: "blockSystem", label: "Khối/Hệ thống", thClass: "w-44", filter: "text", text: (r) => String(r.blockSystem ?? ""),
          cell: (r) => r.blockSystem ? <span className="text-slate-700">{String(r.blockSystem)}</span> : <Dash /> },
        { key: "scale", label: "Quy mô (m² sàn)", thClass: "w-44", align: "right", filter: "text", text: (r) => String(r.scale ?? ""),
          cell: (r) => r.scale ? <span className="font-medium tabular-nums text-slate-700">{String(r.scale)}</span> : <Dash /> },
      ]}
    />
  );

  // ============== TAB bimtools — Phát triển BIM Tools (Level 2 Loại hình / Level 3 Hạng mục) ==============
  const bimtoolsView = () => {
    const bimtoolsItemFields: Field[] = [
      {
        key: "projectGroupId",
        label: "Dự án",
        type: "select",
        span: 3,
        options: [{ value: "", label: "— Không gắn dự án —" }, ...ptProjectGroups.map((g) => ({ value: g.id, label: `${g.code} — ${g.name}` }))],
      },
      {
        key: "parentId",
        label: "Loại hình",
        type: "select",
        span: 3,
        required: true,
        options: ptLevel2.map((l) => ({ value: l.id, label: l.value })),
      },
      { key: "value", label: "Hạng mục", required: true, span: 3, autoFocus: true },
    ];

    return (
      <FilterTable
        title="Dự án BIM Tools · Hạng mục"
        rows={ptLevel3 as unknown as Row[]}
        addLabel="Thêm hạng mục"
        minWidth={720}
        selectable
        bulkBar={(ids, clear) => (
          <CatalogBulkBar
            count={ids.length}
            onClear={clear}
            actions={[
              { label: "Đổi Dự án", onClick: () => setBulkBimtoolsEdit({ ids, field: "projectGroupId" }) },
              { label: "Đổi Loại hình", onClick: () => setBulkBimtoolsEdit({ ids, field: "parentId" }) },
              { label: "Đổi Hạng mục", onClick: () => setBulkBimtoolsEdit({ ids, field: "value" }) },
            ]}
          />
        )}
        infoBar={{ tone: "slate", text: 'Danh mục Hạng mục của nhóm Phát triển BIM Tools — nguồn gợi ý khi tạo công việc. Quản lý Loại hình ở nút "Quản lý loại hình".' }}
        onBatchReorder={(ids) => reorder("catalogItem", ids)}
        headerExtra={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setManagePtProjects(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Building2 className="size-4 text-slate-400" /> Quản lý dự án
              <span className="rounded-full bg-slate-100 px-1.5 text-xs">{ptProjectGroups.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setManageBimtoolsL2(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <SlidersHorizontal className="size-4 text-slate-400" /> Quản lý loại hình
              <span className="rounded-full bg-slate-100 px-1.5 text-xs">{ptLevel2.length}</span>
            </button>
          </div>
        }
        onAdd={() => {
          if (ptLevel2.length === 0) {
            toast.error('Chưa có Loại hình nào — hãy tạo ở "Quản lý loại hình" trước.');
            return;
          }
          setAddBimtoolsItems(true);
        }}
        onEdit={(r) => {
          const item = r as unknown as { id: string; value: string; parentId: string | null; projectGroupId: string | null; order: number };
          setRecord({
            title: "Sửa hạng mục BIM Tools",
            fields: bimtoolsItemFields,
            initial: { projectGroupId: item.projectGroupId ?? "", parentId: item.parentId ?? "", value: item.value },
            submit: (v) => updateCatalogValue(item.id, v.value, v.parentId || null, v.projectGroupId || null),
          });
        }}
        onDelete={(r) => {
          const item = r as unknown as { id: string; value: string };
          setConfirm({ name: item.value, run: () => deleteCatalogValue(item.id) });
        }}
        columns={[
          {
            key: "duAn",
            label: "Dự án",
            thClass: "w-40",
            filter: "multi",
            text: (r) => {
              const pg = ptPgById.get((r as unknown as { projectGroupId: string | null }).projectGroupId ?? "");
              return pg ? `${pg.code}` : "";
            },
            cell: (r) => {
              const pg = ptPgById.get((r as unknown as { projectGroupId: string | null }).projectGroupId ?? "");
              return pg ? (
                <span className="font-mono text-xs text-slate-600" title={pg.name}>{pg.code}</span>
              ) : <Dash />;
            },
          },
          {
            key: "loaiHinh",
            label: "Loại hình",
            thClass: "w-52",
            filter: "multi",
            text: (r) => ptL2ById.get((r as unknown as { parentId: string | null }).parentId ?? "")?.value ?? "",
            cell: (r) => {
              const l2 = ptL2ById.get((r as unknown as { parentId: string | null }).parentId ?? "");
              return l2 ? <span className="font-mono text-xs text-slate-600">{l2.value}</span> : <Dash />;
            },
          },
          {
            key: "value",
            label: "Hạng mục",
            filter: "text",
            text: (r) => String(r.value ?? ""),
            cell: (r) => <strong className="font-medium text-slate-800">{String(r.value)}</strong>,
          },
          {
            key: "quyMo",
            label: "Quy mô",
            thClass: "w-32",
            text: () => "",
            cell: () => <Dash />,
          },
        ]}
      />
    );
  };

  // ============== TAB 3 — Công việc (CatalogItem level 5) ==============
  const worksView = () => (
    <WorksPanel
      workGroups={workGroups}
      works={works}
      onBatchReorder={(ids) => reorder("catalogItem", ids)}
      onAdd={(workGroupId, value) => run(addCatalogValue(workGroupId, 5, value), "Đã thêm công việc")}
      onBulkEdit={(ids, field) => setBulkWorksEdit({ ids, field })}
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
        selectable
        bulkBar={(ids, clear) => (
          <CatalogBulkBar
            count={ids.length}
            onClear={clear}
            actions={[
              { label: "Đổi mã", onClick: () => setBulkSimpleEdit({ model: opts.reorderModel as SimpleCatalogModel, ids, title: opts.title.toLowerCase(), field: "code" }) },
              { label: "Đổi tên", onClick: () => setBulkSimpleEdit({ model: opts.reorderModel as SimpleCatalogModel, ids, title: opts.title.toLowerCase(), field: "name" }) },
              ...(opts.leadOrder
                ? [{ label: "Đổi thứ tự", onClick: () => setBulkSimpleEdit({ model: opts.reorderModel as SimpleCatalogModel, ids, title: opts.title.toLowerCase(), field: "order" as const }) }]
                : []),
            ]}
          />
        )}
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
            <Database className="size-3.5" /> 7 danh mục · 7 tab
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
          {tab === "bimtools" ? bimtoolsView() : null}
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
      {addItemsScope ? (
        <AddMultipleItemsModal
          projectGroups={generalProjectGroups}
          constructionTypes={constructionTypes}
          onClose={() => setAddItemsScope(null)}
          onSubmit={async (groupId, constructionTypeId, items) => {
            const res = await batchSaveCatalogProjects({ groupId, constructionTypeId, items });
            if (res.ok) {
              toast.success(`Đã thêm ${items.length} hạng mục`);
              router.refresh();
              setAddItemsScope(null);
            } else {
              toast.error(res.error);
            }
          }}
        />
      ) : null}

      {/* Modal thêm nhiều hạng mục BIM Tools */}
      {addBimtoolsItems ? (
        <AddMultipleBimtoolsModal
          workGroupId={ptWorkGroupId ?? ""}
          level2Items={ptLevel2}
          projectGroups={ptProjectGroups}
          onClose={() => setAddBimtoolsItems(false)}
          onSubmit={async (parentId, values, projectGroupId) => {
            const res = await batchSaveCatalogItems(ptWorkGroupId ?? "", 3, parentId, values, projectGroupId || null);
            if (res.ok) {
              toast.success(`Đã thêm ${values.length} hạng mục`);
              router.refresh();
              setAddBimtoolsItems(false);
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

      {/* Quản lý Dự án BIM Tools (PT ProjectGroups) */}
      {managePtProjects ? (
        <ManagePtProjectsModal
          projects={ptProjectGroups}
          workGroupId={ptWorkGroupId ?? ""}
          onClose={() => setManagePtProjects(false)}
          onEdit={(g) =>
            setRecord({
              title: "Sửa dự án BIM Tools",
              fields: [
                { key: "code", label: "Mã dự án", required: true, span: 2, autoFocus: true },
                { key: "name", label: "Tên dự án", required: true, span: 3 },
              ],
              initial: { code: g.code, name: g.name },
              submit: (v) => saveProjectGroup({ id: g.id, code: v.code, name: v.name }),
            })
          }
          onDelete={(g) =>
            setConfirm({
              name: `${g.code} — ${g.name}`,
              warnMsg: g.itemCount > 0 ? `Dự án này có ${g.itemCount} hạng mục.` : undefined,
              blockMsg: g.itemCount > 0 ? "Xóa hạng mục trước khi xóa dự án." : undefined,
              run: () => deleteProjectGroup(g.id),
            })
          }
        />
      ) : null}

      {/* Quản lý Loại hình BIM Tools (Level 2) */}
      {manageBimtoolsL2 ? (
        <ManageBimtoolsL2Modal
          workGroupId={ptWorkGroupId ?? ""}
          items={ptLevel2}
          onClose={() => setManageBimtoolsL2(false)}
          onEdit={(item) => {
            setRecord({
              title: "Sửa loại hình",
              fields: [{ key: "value", label: "Loại hình", required: true, span: 3, autoFocus: true }],
              initial: { value: item.value },
              submit: (v) => updateCatalogValue(item.id, v.value),
            });
          }}
          onDelete={(item) =>
            setConfirm({ name: item.value, run: () => deleteCatalogValue(item.id) })
          }
          onAdd={(value) => run(addCatalogValue(ptWorkGroupId ?? "", 2, value), "Đã thêm loại hình")}
        />
      ) : null}

      {/* Bulk edit danh mục đơn */}
      {bulkSimpleEdit ? (
        <BulkEditSimpleModal
          ids={bulkSimpleEdit.ids}
          title={bulkSimpleEdit.title}
          field={bulkSimpleEdit.field}
          allowAbbr={bulkSimpleEdit.model === "workGroup"}
          allowOrder={bulkSimpleEdit.model === "workGroup" || bulkSimpleEdit.model === "phase"}
          onClose={() => setBulkSimpleEdit(null)}
          onSubmit={async (patch) => {
            const res = await batchUpdateSimpleCatalog(bulkSimpleEdit.model, bulkSimpleEdit.ids, patch);
            if (res.ok) {
              toast.success("Đã cập nhật");
              router.refresh();
              setBulkSimpleEdit(null);
            } else {
              toast.error(res.error);
            }
          }}
        />
      ) : null}

      {/* Bulk edit Tab Công việc */}
      {bulkWorksEdit ? (
        <BulkEditWorksModal
          ids={bulkWorksEdit.ids}
          field={bulkWorksEdit.field}
          workGroups={workGroups}
          onClose={() => setBulkWorksEdit(null)}
          onSubmit={async (patch) => {
            const res = await batchUpdateCatalogItems(bulkWorksEdit.ids, patch);
            if (res.ok) {
              toast.success("Đã cập nhật");
              router.refresh();
              setBulkWorksEdit(null);
            } else {
              toast.error(res.error);
            }
          }}
        />
      ) : null}

      {/* Bulk edit Tab Dự án */}
      {bulkProjectEdit ? (
        <BulkEditProjectsModal
          ids={bulkProjectEdit.ids}
          field={bulkProjectEdit.field}
          projectGroups={generalProjectGroups}
          constructionTypes={constructionTypes}
          onClose={() => setBulkProjectEdit(null)}
          onSubmit={async (patch) => {
            const res = await batchUpdateCatalogProjects(bulkProjectEdit.ids, patch);
            if (res.ok) {
              toast.success("Đã cập nhật");
              router.refresh();
              setBulkProjectEdit(null);
            } else {
              toast.error(res.error);
            }
          }}
        />
      ) : null}

      {/* Bulk edit Tab BIM Tools */}
      {bulkBimtoolsEdit ? (
        <BulkEditBimtoolsModal
          ids={bulkBimtoolsEdit.ids}
          field={bulkBimtoolsEdit.field}
          ptProjectGroups={ptProjectGroups}
          ptLevel2={ptLevel2}
          ptWorkGroupId={ptWorkGroupId ?? ""}
          onClose={() => setBulkBimtoolsEdit(null)}
          onSubmit={async (patch) => {
            const res = await batchUpdateCatalogItems(bulkBimtoolsEdit.ids, patch);
            if (res.ok) {
              toast.success("Đã cập nhật");
              router.refresh();
              setBulkBimtoolsEdit(null);
            } else {
              toast.error(res.error);
            }
          }}
        />
      ) : null}

      {/* Quản lý dự án (cấp cha) */}
      {manageProjectsScope ? (
        <ManageProjectsModal
          groups={generalProjectGroups}
          onClose={() => setManageProjectsScope(null)}
          onBatchReorder={(ids) => reorder("projectGroup", ids)}
          onAdd={() =>
            setRecord({
              title: "Thêm dự án",
              fields: GROUP_FIELDS_PROJECT,
              initial: { code: "", name: "", order: "0" },
              existingCodes: projectGroups.map((g) => g.code),
              submit: (v) =>
                saveProjectGroup({ code: v.code, name: v.name, order: Number(v.order || 0), workGroupId: null }),
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
  onDuplicate,
  onDelete,
  onBatchReorder,
  rowExtra,
  headerExtra,
  infoBar,
  minWidth,
  selectable,
  bulkBar,
}: {
  title: string;
  rows: Row[];
  columns: Col[];
  addLabel: string;
  onAdd: () => void;
  onEdit: (r: Row) => void;
  onDuplicate?: (r: Row) => void;
  onDelete: (r: Row) => void;
  onBatchReorder?: (ids: string[]) => Promise<void>;
  rowExtra?: (r: Row) => React.ReactNode;
  headerExtra?: React.ReactNode;
  infoBar?: { tone: "slate" | "blue"; text: string };
  minWidth?: number;
  selectable?: boolean;
  bulkBar?: (selectedIds: string[], clearSel: () => void) => React.ReactNode;
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [colFilters, setColFilters] = React.useState<Record<string, string | string[]>>({});
  const [openFilter, setOpenFilter] = React.useState<{ key: string; rect: DOMRect } | null>(null);
  // local ordering for optimistic DnD update
  const [localIds, setLocalIds] = React.useState<string[]>(() => rows.map((r) => r.id));
  React.useEffect(() => { setLocalIds(rows.map((r) => r.id)); }, [rows]);
  // selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [lastCheckedId, setLastCheckedId] = React.useState<string | null>(null);
  const clearSel = React.useCallback(() => setSelectedIds(new Set()), []);
  const toggleRow = (id: string, shiftKey = false) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (shiftKey && lastCheckedId) {
        const start = filtered.findIndex((r) => r.id === lastCheckedId);
        const end = filtered.findIndex((r) => r.id === id);
        if (start !== -1 && end !== -1) {
          const [from, to] = start < end ? [start, end] : [end, start];
          const shouldSelect = !n.has(id);
          filtered.slice(from, to + 1).forEach((r) => {
            if (shouldSelect) n.add(r.id);
            else n.delete(r.id);
          });
          return n;
        }
      }
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setLastCheckedId(id);
  };
  const rowIdSet = React.useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const selArr = React.useMemo(() => [...selectedIds].filter((id) => rowIdSet.has(id)), [selectedIds, rowIdSet]);

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

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someFilteredSelected = !allFilteredSelected && filtered.some((r) => selectedIds.has(r.id));
  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => { const n = new Set(prev); filtered.forEach((r) => n.delete(r.id)); return n; });
    } else {
      setSelectedIds((prev) => { const n = new Set(prev); filtered.forEach((r) => n.add(r.id)); return n; });
    }
  };

  const colCount = columns.length + (onBatchReorder ? 2 : 1) + (selectable ? 1 : 0);
  const openCol = openFilter ? colByKey.get(openFilter.key) : null;
  const hasStickyBulk = !!(selectable && bulkBar && selArr.length > 0);
  const stickyHeadTop = hasStickyBulk ? "top-[52px]" : "top-0";
  const stickyHeadClass = cn("sticky z-20 bg-slate-50 shadow-[0_1px_0_0_theme(colors.slate.200)]", stickyHeadTop);

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

      {/* Bulk action bar */}
      {selectable && bulkBar && selArr.length > 0 ? (
        <div className="sticky top-0 z-30 bg-card px-4 pt-3">{bulkBar(selArr, clearSel)}</div>
      ) : null}

      {/* Bảng */}
      <div className="overflow-x-auto px-1.5 py-1.5">
        <table className="w-full border-collapse text-sm" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-400">
              {onBatchReorder ? <th className={cn("w-8 px-2 py-2", stickyHeadClass)} /> : null}
              {selectable ? (
                <th className={cn("w-9 px-2 py-2", stickyHeadClass)}>
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer rounded border-slate-300 accent-slate-800"
                    checked={allFilteredSelected}
                    ref={(el) => { if (el) el.indeterminate = someFilteredSelected; }}
                    onChange={toggleAll}
                    title={allFilteredSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                  />
                </th>
              ) : null}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const on = colActive(c);
                return (
                  <th key={c.key} className={cn("px-3 py-2", stickyHeadClass, c.thClass, c.align === "right" && "text-right")}>
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
              <th className={cn("w-24 px-3 py-2 text-right", stickyHeadClass)}>Thao tác</th>
            </tr>
          </thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {filtered.map((r) => (
                  <SortableTableRow
                    key={r.id} id={r.id} showHandle={!!onBatchReorder} canDrag={canDrag}
                    checked={selectable ? selectedIds.has(r.id) : undefined}
                    onCheck={selectable ? (shiftKey) => toggleRow(r.id, shiftKey) : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2.5", c.align === "right" && "text-right")}>
                        {c.cell(r)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-0.5 opacity-60 transition group-hover:opacity-100">
                        {rowExtra ? rowExtra(r) : null}
                        {onDuplicate ? (
                          <button type="button" title="Nhân bản" onClick={() => onDuplicate(r)}
                            className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <Copy className="size-4" />
                          </button>
                        ) : null}
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
  id, children, showHandle, canDrag, checked, onCheck,
}: {
  id: string; children: React.ReactNode; showHandle: boolean; canDrag: boolean;
  checked?: boolean; onCheck?: (shiftKey: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group border-t border-slate-100 hover:bg-slate-50/70", isDragging && "opacity-40 bg-slate-50", checked && "bg-slate-50")}
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
      {onCheck !== undefined ? (
        <td className="w-9 px-2 py-2.5">
          <input
            type="checkbox"
            className="size-4 cursor-pointer rounded border-slate-300 accent-slate-800"
            checked={checked ?? false}
            onChange={() => undefined}
            onClick={(e) => {
              e.stopPropagation();
              onCheck(e.shiftKey);
            }}
          />
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
  type?: "text" | "number" | "select" | "combobox";
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
              ) : f.type === "combobox" ? (
                <SearchableCombobox
                  value={(f.options ?? []).find((o) => o.value === (values[f.key] ?? ""))?.label ?? ""}
                  options={(f.options ?? []).map((o) => o.label)}
                  creatable={false}
                  className="h-9"
                  autoFocus={f.autoFocus}
                  placeholder="Tìm..."
                  onChange={(label) => set(f.key, (f.options ?? []).find((o) => o.label === label)?.value ?? "")}
                />
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
  onBulkEdit,
  onEdit,
  onDelete,
  onBatchReorder,
}: {
  workGroups: WorkGroupRow[];
  works: WorkRow[];
  onAdd: (workGroupId: string, value: string) => void;
  onBulkEdit: (ids: string[], field: "workGroupId" | "value") => void;
  onEdit: (r: WorkRow) => void;
  onDelete: (r: WorkRow) => void;
  onBatchReorder?: (ids: string[]) => Promise<void>;
}) {
  const [activeWg, setActiveWg] = React.useState<string>(workGroups[0]?.id ?? "");
  const [newValue, setNewValue] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [lastCheckedId, setLastCheckedId] = React.useState<string | null>(null);
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
  const displayIdSet = React.useMemo(() => new Set(displayItems.map((w) => w.id)), [displayItems]);
  const selectedArr = React.useMemo(() => [...selectedIds].filter((id) => displayIdSet.has(id)), [selectedIds, displayIdSet]);
  const allSelected = displayItems.length > 0 && displayItems.every((w) => selectedIds.has(w.id));
  const someSelected = !allSelected && displayItems.some((w) => selectedIds.has(w.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) displayItems.forEach((w) => next.delete(w.id));
      else displayItems.forEach((w) => next.add(w.id));
      return next;
    });
  };
  const toggleItem = (id: string, shiftKey = false) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastCheckedId) {
        const start = displayItems.findIndex((w) => w.id === lastCheckedId);
        const end = displayItems.findIndex((w) => w.id === id);
        if (start !== -1 && end !== -1) {
          const [from, to] = start < end ? [start, end] : [end, start];
          const shouldSelect = !next.has(id);
          displayItems.slice(from, to + 1).forEach((w) => {
            if (shouldSelect) next.add(w.id);
            else next.delete(w.id);
          });
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastCheckedId(id);
  };

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
        {selectedArr.length > 0 ? (
          <CatalogBulkBar
            count={selectedArr.length}
            onClear={() => setSelectedIds(new Set())}
            actions={[
              { label: "Đổi nhóm", onClick: () => onBulkEdit(selectedArr, "workGroupId") },
              { label: "Đổi tên", onClick: () => onBulkEdit(selectedArr, "value") },
            ]}
          />
        ) : null}

        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Chưa có công việc nào trong nhóm này</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localIds} strategy={verticalListSortingStrategy}>
              <div className={cn("mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200", selectedArr.length === 0 && "mt-0")}>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer rounded border-slate-300 accent-slate-800"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll}
                    title={allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                  />
                  <span>Chọn dòng</span>
                </div>
                {displayItems.map((w) => (
                  <SortableWorkItem
                    key={w.id}
                    item={w}
                    checked={selectedIds.has(w.id)}
                    onCheck={(shiftKey) => toggleItem(w.id, shiftKey)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    showHandle={!!onBatchReorder}
                  />
                ))}
              </div>
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
  item, checked, onCheck, onEdit, onDelete, showHandle,
}: {
  item: WorkRow; checked: boolean; onCheck: (shiftKey: boolean) => void; onEdit: (r: WorkRow) => void; onDelete: (r: WorkRow) => void; showHandle: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50", checked && "bg-slate-50", isDragging && "opacity-40 bg-slate-50")}
      {...attributes}
    >
      {showHandle ? (
        <button {...listeners} tabIndex={-1}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors shrink-0">
          <GripVertical className="size-4" />
        </button>
      ) : null}
      <input
        type="checkbox"
        className="size-4 cursor-pointer rounded border-slate-300 accent-slate-800"
        checked={checked}
        onChange={() => undefined}
        onClick={(e) => {
          e.stopPropagation();
          onCheck(e.shiftKey);
        }}
      />
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
type ItemRow = { id: string; name: string; blockSystem: string; scale: string };

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
    items: { name: string; blockSystem: string | null; scale: string | null }[],
  ) => Promise<void>;
}) {
  const [groupId, setGroupId] = React.useState(projectGroups[0]?.id ?? "");
  const [ctId, setCtId] = React.useState("");
  const [rows, setRows] = React.useState<ItemRow[]>([{ id: crypto.randomUUID(), name: "", blockSystem: "", scale: "" }]);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";
  const projectLabels = React.useMemo(() => projectGroups.map((g) => `${g.code} — ${g.name}`), [projectGroups]);
  const projectLabelById = React.useMemo(() => new Map(projectGroups.map((g) => [g.id, `${g.code} — ${g.name}`])), [projectGroups]);
  const projectIdByLabel = React.useMemo(() => new Map(projectGroups.map((g) => [`${g.code} — ${g.name}`, g.id])), [projectGroups]);
  const ctLabels = React.useMemo(() => constructionTypes.map((c) => `${c.code} — ${c.name}`), [constructionTypes]);
  const ctLabelById = React.useMemo(() => new Map(constructionTypes.map((c) => [c.id, `${c.code} — ${c.name}`])), [constructionTypes]);
  const ctIdByLabel = React.useMemo(() => new Map(constructionTypes.map((c) => [`${c.code} — ${c.name}`, c.id])), [constructionTypes]);

  function addRow() {
    setRows((prev) => [...prev, { id: crypto.randomUUID(), name: "", blockSystem: "", scale: "" }]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function setRow(id: string, field: "name" | "blockSystem" | "scale", value: string) {
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
    await onSubmit(groupId, ctId || null, valid.map((r) => ({ name: r.name.trim(), blockSystem: r.blockSystem.trim() || null, scale: r.scale.trim() || null })));
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title="Thêm hạng mục" className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dự án + Loại hình — dùng chung cho tất cả hạng mục */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              Dự án <span className="text-red-500">*</span>
            </label>
            <SearchableCombobox
              value={projectLabelById.get(groupId) ?? ""}
              options={projectLabels}
              creatable={false}
              className="h-9"
              placeholder="Tìm dự án..."
              onChange={(label) => setGroupId(projectIdByLabel.get(label) ?? "")}
            />
            <p className="text-[11px] text-slate-400">tạo/đổi tên dự án ở nút "Quản lý dự án"</p>
          </div>
          <div className="col-span-3 space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Loại hình</label>
            <SearchableCombobox
              value={ctId ? ctLabelById.get(ctId) ?? "" : "— Không —"}
              options={["— Không —", ...ctLabels]}
              creatable={false}
              className="h-9"
              placeholder="Tìm loại hình..."
              onChange={(label) => setCtId(label === "— Không —" ? "" : ctIdByLabel.get(label) ?? "")}
            />
            <p className="text-[11px] text-slate-400">từ danh mục Loại hình công trình</p>
          </div>
        </div>

        {/* Danh sách hạng mục */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_150px_150px_28px] gap-2 px-1">
            <span className="text-xs font-medium text-slate-500">Hạng mục <span className="text-red-500">*</span></span>
            <span className="text-xs font-medium text-slate-500">Khối/Hệ thống</span>
            <span className="text-xs font-medium text-slate-500">Quy mô (m² sàn)</span>
            <span />
          </div>
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {rows.map((row, idx) => (
              <div key={row.id} className="grid grid-cols-[1fr_150px_150px_28px] items-center gap-2">
                <input
                  className={inputCls}
                  value={row.name}
                  placeholder={`Hạng mục ${idx + 1}`}
                  autoFocus={idx === 0}
                  onChange={(e) => setRow(row.id, "name", e.target.value)}
                />
                <input
                  className={inputCls}
                  value={row.blockSystem}
                  placeholder="Khối / hệ"
                  onChange={(e) => setRow(row.id, "blockSystem", e.target.value)}
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

// ===================================================================
//  ManageBimtoolsL2Modal — quản lý Loại hình (Level 2) BIM Tools
// ===================================================================
function ManageBimtoolsL2Modal({
  workGroupId,
  items,
  onClose,
  onAdd,
  onEdit,
  onDelete,
}: {
  workGroupId: string;
  items: { id: string; value: string; order: number }[];
  onClose: () => void;
  onAdd: (value: string) => Promise<unknown>;
  onEdit: (item: { id: string; value: string }) => void;
  onDelete: (item: { id: string; value: string }) => void;
}) {
  const [newValue, setNewValue] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [err, setErr] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const val = newValue.trim();
    if (!val) { setErr("Vui lòng nhập tên loại hình."); return; }
    setErr("");
    setAdding(true);
    await onAdd(val);
    setAdding(false);
    setNewValue("");
    inputRef.current?.focus();
  }

  return (
    <Modal open onClose={onClose} title="Quản lý loại hình" className="max-w-lg">
      <div className="space-y-3">
        <div className="max-h-[45vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {items.map((item) => (
            <div key={item.id} className="group flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{item.value}</span>
              <div className="flex gap-0.5 opacity-60 transition group-hover:opacity-100">
                <button
                  type="button"
                  title="Sửa"
                  onClick={() => onEdit(item)}
                  className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  title="Xóa"
                  onClick={() => onDelete(item)}
                  className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Chưa có loại hình nào</p>
          ) : null}
        </div>

        <form onSubmit={handleAdd} className="flex items-start gap-2">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 focus-within:border-slate-500 focus-within:bg-white">
              <Plus className="size-4 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={newValue}
                onChange={(e) => { setNewValue(e.target.value); setErr(""); }}
                placeholder="Thêm loại hình mới…"
                className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              {newValue ? (
                <button type="button" onClick={() => { setNewValue(""); setErr(""); }} className="text-slate-400 hover:text-slate-600">
                  <X className="size-3.5" />
                </button>
              ) : null}
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

        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button onClick={onClose}>Xong</Button>
        </div>
      </div>
    </Modal>
  );
}

// ===================================================================
//  AddMultipleBimtoolsModal — thêm nhiều Hạng mục cùng Loại hình (Tab BIM Tools)
// ===================================================================
type BimtoolsItemRow = { id: string; name: string };

function AddMultipleBimtoolsModal({
  workGroupId,
  level2Items,
  projectGroups,
  onClose,
  onSubmit,
}: {
  workGroupId: string;
  level2Items: { id: string; value: string }[];
  projectGroups: { id: string; code: string; name: string }[];
  onClose: () => void;
  onSubmit: (parentId: string, values: string[], projectGroupId: string) => Promise<void>;
}) {
  const [parentId, setParentId] = React.useState(level2Items[0]?.id ?? "");
  const [projectGroupId, setProjectGroupId] = React.useState("");
  const [rows, setRows] = React.useState<BimtoolsItemRow[]>([{ id: crypto.randomUUID(), name: "" }]);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  function addRow() {
    setRows((prev) => [...prev, { id: crypto.randomUUID(), name: "" }]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function setRowName(id: string, name: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    setErr(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parentId) { setErr("Chọn Loại hình."); return; }
    const valid = rows.map((r) => r.name.trim()).filter(Boolean);
    if (!valid.length) { setErr("Nhập ít nhất 1 hạng mục."); return; }
    setErr(null);
    setPending(true);
    await onSubmit(parentId, valid, projectGroupId);
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title="Thêm hạng mục BIM Tools" className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Dự án</label>
          <Select value={projectGroupId} onChange={(e) => setProjectGroupId(e.target.value)} className="h-9">
            <option value="">— Không gắn dự án —</option>
            {projectGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
            ))}
          </Select>
          <p className="text-[11px] text-slate-400">tạo/đổi dự án ở nút "Quản lý dự án"</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">
            Loại hình <span className="text-red-500">*</span>
          </label>
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)} className="h-9">
            {level2Items.map((l) => (
              <option key={l.id} value={l.id}>{l.value}</option>
            ))}
          </Select>
          <p className="text-[11px] text-slate-400">tạo/đổi tên loại hình ở nút "Quản lý loại hình"</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-medium text-slate-500">Hạng mục <span className="text-red-500">*</span></span>
          </div>
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {rows.map((row, idx) => (
              <div key={row.id} className="flex items-center gap-2">
                <input
                  className={inputCls}
                  value={row.name}
                  placeholder={`Hạng mục ${idx + 1}`}
                  autoFocus={idx === 0}
                  onChange={(e) => setRowName(row.id, e.target.value)}
                />
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500"
                    title="Xóa dòng này"
                  >
                    <X className="size-4" />
                  </button>
                ) : (
                  <span className="size-7 shrink-0" />
                )}
              </div>
            ))}
          </div>

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

// ===================================================================
//  ManagePtProjectsModal — quản lý Dự án BIM Tools (PT ProjectGroups)
// ===================================================================
function ManagePtProjectsModal({
  projects,
  workGroupId,
  onClose,
  onEdit,
  onDelete,
}: {
  projects: { id: string; code: string; name: string; order: number; itemCount: number }[];
  workGroupId: string;
  onClose: () => void;
  onEdit: (g: { id: string; code: string; name: string }) => void;
  onDelete: (g: { id: string; code: string; name: string; itemCount: number }) => void;
}) {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [err, setErr] = React.useState("");
  const codeRef = React.useRef<HTMLInputElement>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    const n = name.trim();
    if (!c) { setErr("Nhập mã dự án"); return; }
    if (!n) { setErr("Nhập tên dự án"); return; }
    setErr("");
    setAdding(true);
    const res = await saveProjectGroup({ code: c, name: n, workGroupId });
    setAdding(false);
    if (res.ok) {
      setCode(""); setName("");
      toast.success("Đã thêm dự án");
      router.refresh();
      codeRef.current?.focus();
    } else {
      setErr(res.error ?? "Lỗi không xác định");
    }
  }

  return (
    <Modal open onClose={onClose} title="Quản lý dự án BIM Tools" className="max-w-lg">
      <div className="space-y-3">
        {/* Danh sách */}
        <div className="max-h-[45vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {projects.map((g) => (
            <div key={g.id} className="group flex items-center gap-3 px-3 py-2">
              <span className="w-20 shrink-0 font-mono text-xs font-medium text-slate-500">{g.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{g.name}</span>
              <div className="flex gap-0.5 opacity-60 transition group-hover:opacity-100">
                <button
                  type="button"
                  title="Sửa"
                  onClick={() => onEdit(g)}
                  className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  title="Xóa"
                  onClick={() => onDelete(g)}
                  className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
          {projects.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Chưa có dự án nào</p>
          ) : null}
        </div>

        {/* Form thêm */}
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }}
              placeholder="Mã dự án"
              className="h-9 w-28 shrink-0 rounded-md border border-slate-200 bg-white px-2.5 font-mono text-sm uppercase outline-none focus:border-slate-400"
            />
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setErr(""); }}
              placeholder="Tên dự án…"
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400"
            />
            <button
              type="submit"
              disabled={adding}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-800 px-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              <Plus className="size-4" /> Thêm
            </button>
          </div>
          {err ? <p className="text-xs text-red-500">{err}</p> : null}
        </form>
      </div>
    </Modal>
  );
}

// ===================================================================
//  CatalogBulkBar — bar hiển thị khi chọn nhiều dòng
// ===================================================================
function CatalogBulkBar({
  count,
  onClear,
  actions,
}: {
  count: number;
  onClear: () => void;
  actions: { label: string; onClick: () => void; tone?: "default" | "danger" }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-800 px-3 py-2 text-sm text-white">
      <Check className="size-4 shrink-0 text-slate-400" />
      <span className="font-medium">{count} dòng đã chọn</span>
      <span className="text-slate-500">·</span>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium",
            a.tone === "danger"
              ? "bg-red-500/20 text-red-100 hover:bg-red-500/30"
              : "bg-white/15 hover:bg-white/25",
          )}
        >
          {a.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto grid size-6 place-items-center rounded text-slate-400 hover:text-white"
        title="Bỏ chọn"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

type SimpleCatalogPatch = { code?: string; name?: string; abbr?: string | null; order?: number };

function BulkEditSimpleModal({
  ids,
  title,
  field,
  allowAbbr,
  allowOrder,
  onClose,
  onSubmit,
}: {
  ids: string[];
  title: string;
  field: "code" | "name" | "abbr" | "order";
  allowAbbr: boolean;
  allowOrder: boolean;
  onClose: () => void;
  onSubmit: (patch: SimpleCatalogPatch) => Promise<void>;
}) {
  const fields = [
    { key: "code" as const, label: "Mã" },
    { key: "name" as const, label: "Tên" },
    ...(allowAbbr ? [{ key: "abbr" as const, label: "Viết tắt" }] : []),
    ...(allowOrder ? [{ key: "order" as const, label: "Thứ tự" }] : []),
  ];
  const initial = fields.some((f) => f.key === field) ? field : fields[0].key;
  const [activeField, setActiveField] = React.useState(initial);
  const [value, setValue] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const patch: SimpleCatalogPatch = {};
    if (activeField === "order") {
      const order = Number(value);
      if (!Number.isFinite(order)) { setErr("Nhập thứ tự hợp lệ"); return; }
      patch.order = order;
    } else {
      const v = value.trim();
      if (activeField !== "abbr" && !v) { setErr("Nhập giá trị"); return; }
      if (activeField === "code") patch.code = v;
      if (activeField === "name") patch.name = v;
      if (activeField === "abbr") patch.abbr = v || null;
    }
    setPending(true);
    await onSubmit(patch);
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title={`Sửa ${ids.length} dòng ${title}`} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setActiveField(f.key); setValue(""); setErr(null); }}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                activeField === f.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">
            {fields.find((f) => f.key === activeField)?.label} mới
            {activeField === "abbr" ? null : <span className="text-red-500"> *</span>}
          </label>
          <input
            autoFocus
            className={cn(inputCls, (activeField === "code" || activeField === "abbr") && "font-mono uppercase")}
            type={activeField === "order" ? "number" : "text"}
            value={value}
            onChange={(e) => { setValue(e.target.value); setErr(null); }}
          />
          <p className="text-[11px] text-amber-500">Giá trị này sẽ áp dụng cho tất cả {ids.length} dòng đã chọn.</p>
        </div>
        {err ? <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="size-3.5" /> {err}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={pending}>
            <Check className="size-4" /> {pending ? "Đang lưu…" : `Áp dụng cho ${ids.length} dòng`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type WorksPatch = { workGroupId?: string; value?: string };

function BulkEditWorksModal({
  ids,
  field,
  workGroups,
  onClose,
  onSubmit,
}: {
  ids: string[];
  field: "workGroupId" | "value";
  workGroups: WorkGroupRow[];
  onClose: () => void;
  onSubmit: (patch: WorksPatch) => Promise<void>;
}) {
  const [activeField, setActiveField] = React.useState(field);
  const [workGroupId, setWorkGroupId] = React.useState(workGroups[0]?.id ?? "");
  const [value, setValue] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";
  const fields = [
    { key: "workGroupId" as const, label: "Nhóm" },
    { key: "value" as const, label: "Tên" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const patch: WorksPatch = {};
    if (activeField === "workGroupId") {
      if (!workGroupId) { setErr("Chọn nhóm công việc"); return; }
      patch.workGroupId = workGroupId;
    } else {
      if (!value.trim()) { setErr("Nhập tên công việc"); return; }
      patch.value = value.trim();
    }
    setPending(true);
    await onSubmit(patch);
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title={`Sửa ${ids.length} công việc`} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setActiveField(f.key); setErr(null); }}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                activeField === f.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {activeField === "workGroupId" ? (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Nhóm công việc</label>
            <Select value={workGroupId} onChange={(e) => setWorkGroupId(e.target.value)} className="h-9">
              {workGroups.map((w) => (
                <option key={w.id} value={w.id}>{w.abbr ? `${w.abbr} — ` : ""}{w.name}</option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              Tên công việc mới <span className="text-red-500">*</span>
            </label>
            <input autoFocus className={inputCls} value={value} onChange={(e) => { setValue(e.target.value); setErr(null); }} />
            <p className="text-[11px] text-amber-500">Sẽ đổi tên tất cả {ids.length} dòng đã chọn thành tên này.</p>
          </div>
        )}
        {err ? <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="size-3.5" /> {err}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={pending}>
            <Check className="size-4" /> {pending ? "Đang lưu…" : `Áp dụng cho ${ids.length} dòng`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===================================================================
//  BulkEditProjectsModal — Tab 2 Dự án · Hạng mục
// ===================================================================
type ProjectsPatch = { groupId?: string; constructionTypeId?: string | null; name?: string; blockSystem?: string | null };

function BulkEditProjectsModal({
  ids,
  field,
  projectGroups,
  constructionTypes,
  onClose,
  onSubmit,
}: {
  ids: string[];
  field: "groupId" | "constructionTypeId" | "name" | "blockSystem";
  projectGroups: ProjectGroupRow[];
  constructionTypes: SimpleRow[];
  onClose: () => void;
  onSubmit: (patch: ProjectsPatch) => Promise<void>;
}) {
  const router = useRouter();
  const [activeField, setActiveField] = React.useState(field);
  const [groupId, setGroupId] = React.useState(projectGroups[0]?.id ?? "");
  const [ctId, setCtId] = React.useState("");
  const [name, setName] = React.useState("");
  const [blockSystem, setBlockSystem] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // "Tạo mới dự án" inline
  const [creatingGroup, setCreatingGroup] = React.useState(false);
  const [newGroupCode, setNewGroupCode] = React.useState("");
  const [newGroupName, setNewGroupName] = React.useState("");
  const [creatingGroupPending, setCreatingGroupPending] = React.useState(false);

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  const FIELDS = [
    { key: "groupId" as const, label: "Dự án" },
    { key: "constructionTypeId" as const, label: "Loại hình" },
    { key: "name" as const, label: "Hạng mục" },
    { key: "blockSystem" as const, label: "Khối/Hệ thống" },
  ];

  async function handleCreateGroup() {
    const c = newGroupCode.trim().toUpperCase();
    const n = newGroupName.trim();
    if (!c || !n) { setErr("Nhập đủ mã và tên dự án"); return; }
    setErr(null);
    setCreatingGroupPending(true);
    const res = await createProjectGroupReturnId({ code: c, name: n, workGroupId: null });
    setCreatingGroupPending(false);
    if (res.ok && res.data) {
      toast.success(`Đã tạo dự án ${c}`);
      router.refresh();
      setGroupId(res.data.id);
      setCreatingGroup(false);
      setNewGroupCode(""); setNewGroupName("");
    } else {
      setErr(res.ok ? "Lỗi không xác định" : res.error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const patch: ProjectsPatch = {};
    if (activeField === "groupId") {
      if (!groupId) { setErr("Chọn dự án"); return; }
      patch.groupId = groupId;
    } else if (activeField === "constructionTypeId") {
      patch.constructionTypeId = ctId || null;
    } else if (activeField === "name") {
      if (!name.trim()) { setErr("Nhập tên hạng mục"); return; }
      patch.name = name.trim();
    } else {
      patch.blockSystem = blockSystem.trim() || null;
    }
    setPending(true);
    await onSubmit(patch);
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title={`Sửa ${ids.length} hạng mục`} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tab chọn trường */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {FIELDS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setActiveField(f.key); setErr(null); }}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                activeField === f.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Nội dung theo trường */}
        {activeField === "groupId" && (
          <div className="space-y-2">
            {!creatingGroup ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Dự án <span className="text-red-500">*</span>
                  </label>
                  <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9">
                    {projectGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
                    ))}
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={() => setCreatingGroup(true)}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                >
                  <Plus className="size-3.5" /> Tạo dự án mới
                </button>
              </>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Tạo dự án mới</p>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    className={cn(inputCls, "w-28 shrink-0 font-mono uppercase")}
                    placeholder="Mã"
                    value={newGroupCode}
                    onChange={(e) => { setNewGroupCode(e.target.value.toUpperCase()); setErr(null); }}
                  />
                  <input
                    className={cn(inputCls, "flex-1")}
                    placeholder="Tên dự án…"
                    value={newGroupName}
                    onChange={(e) => { setNewGroupName(e.target.value); setErr(null); }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={creatingGroupPending}
                    onClick={handleCreateGroup}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Check className="size-3.5" /> {creatingGroupPending ? "Đang lưu…" : "Tạo"}
                  </button>
                  <button type="button" onClick={() => { setCreatingGroup(false); setErr(null); }}
                    className="text-xs text-slate-400 hover:text-slate-600">Hủy</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeField === "constructionTypeId" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Loại hình</label>
            <Select value={ctId} onChange={(e) => setCtId(e.target.value)} className="h-9">
              <option value="">— Không (xóa loại hình) —</option>
              {constructionTypes.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </Select>
            <p className="text-[11px] text-slate-400">Thêm/sửa loại hình ở tab "Loại hình công trình"</p>
          </div>
        )}

        {activeField === "name" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              Tên hạng mục mới <span className="text-red-500">*</span>
            </label>
            <input autoFocus className={inputCls} placeholder="Nhập tên mới…" value={name}
              onChange={(e) => { setName(e.target.value); setErr(null); }} />
            <p className="text-[11px] text-amber-500">Sẽ đổi hạng mục cho tất cả {ids.length} dòng đã chọn thành tên này.</p>
          </div>
        )}

        {activeField === "blockSystem" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Khối/Hệ thống</label>
            <input autoFocus className={inputCls} placeholder="Nhập Khối/Hệ thống, để trống để xóa" value={blockSystem}
              onChange={(e) => { setBlockSystem(e.target.value); setErr(null); }} />
            <p className="text-[11px] text-amber-500">Sẽ đổi Khối/Hệ thống cho tất cả {ids.length} dòng đã chọn.</p>
          </div>
        )}

        {err ? (
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="size-3.5" /> {err}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={pending || creatingGroup}>
            <Check className="size-4" /> {pending ? "Đang lưu…" : `Áp dụng cho ${ids.length} dòng`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===================================================================
//  BulkEditBimtoolsModal — Tab 3 Dự án BIM Tools
// ===================================================================
type BimtoolsPatch = { parentId?: string | null; projectGroupId?: string | null; value?: string };

function BulkEditBimtoolsModal({
  ids,
  field,
  ptProjectGroups,
  ptLevel2,
  ptWorkGroupId,
  onClose,
  onSubmit,
}: {
  ids: string[];
  field: "projectGroupId" | "parentId" | "value";
  ptProjectGroups: { id: string; code: string; name: string }[];
  ptLevel2: { id: string; value: string }[];
  ptWorkGroupId: string;
  onClose: () => void;
  onSubmit: (patch: BimtoolsPatch) => Promise<void>;
}) {
  const router = useRouter();
  const [activeField, setActiveField] = React.useState(field);
  const [pgId, setPgId] = React.useState("");
  const [parentId, setParentId] = React.useState(ptLevel2[0]?.id ?? "");
  const [value, setValue] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Tạo mới Dự án BIM Tools
  const [creatingPg, setCreatingPg] = React.useState(false);
  const [newPgCode, setNewPgCode] = React.useState("");
  const [newPgName, setNewPgName] = React.useState("");
  const [creatingPgPending, setCreatingPgPending] = React.useState(false);

  // Tạo mới Loại hình (Level 2)
  const [creatingL2, setCreatingL2] = React.useState(false);
  const [newL2Value, setNewL2Value] = React.useState("");
  const [creatingL2Pending, setCreatingL2Pending] = React.useState(false);

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  const FIELDS = [
    { key: "projectGroupId" as const, label: "Dự án" },
    { key: "parentId" as const, label: "Loại hình" },
    { key: "value" as const, label: "Hạng mục" },
  ];

  async function handleCreatePg() {
    const c = newPgCode.trim().toUpperCase();
    const n = newPgName.trim();
    if (!c || !n) { setErr("Nhập đủ mã và tên dự án"); return; }
    setErr(null);
    setCreatingPgPending(true);
    const res = await createProjectGroupReturnId({ code: c, name: n, workGroupId: ptWorkGroupId });
    setCreatingPgPending(false);
    if (res.ok && res.data) {
      toast.success(`Đã tạo dự án ${c}`);
      router.refresh();
      setPgId(res.data.id);
      setCreatingPg(false);
      setNewPgCode(""); setNewPgName("");
    } else {
      setErr(res.ok ? "Lỗi không xác định" : res.error);
    }
  }

  async function handleCreateL2() {
    const v = newL2Value.trim();
    if (!v) { setErr("Nhập tên loại hình"); return; }
    setErr(null);
    setCreatingL2Pending(true);
    const res = await createCatalogItemReturnId(ptWorkGroupId, 2, v);
    setCreatingL2Pending(false);
    if (res.ok && res.data) {
      toast.success(`Đã tạo loại hình ${v}`);
      router.refresh();
      setParentId(res.data.id);
      setCreatingL2(false);
      setNewL2Value("");
    } else {
      setErr(res.ok ? "Lỗi không xác định" : res.error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const patch: BimtoolsPatch = {};
    if (activeField === "projectGroupId") {
      patch.projectGroupId = pgId || null;
    } else if (activeField === "parentId") {
      if (!parentId) { setErr("Chọn loại hình"); return; }
      patch.parentId = parentId;
    } else {
      if (!value.trim()) { setErr("Nhập hạng mục mới"); return; }
      patch.value = value.trim();
    }
    setPending(true);
    await onSubmit(patch);
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title={`Sửa ${ids.length} hạng mục BIM Tools`} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tab chọn trường */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {FIELDS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setActiveField(f.key); setErr(null); }}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                activeField === f.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Dự án */}
        {activeField === "projectGroupId" && (
          <div className="space-y-2">
            {!creatingPg ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Dự án</label>
                  <Select value={pgId} onChange={(e) => setPgId(e.target.value)} className="h-9">
                    <option value="">— Không gắn dự án —</option>
                    {ptProjectGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
                    ))}
                  </Select>
                </div>
                <button type="button" onClick={() => setCreatingPg(true)}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                  <Plus className="size-3.5" /> Tạo dự án mới
                </button>
              </>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Tạo dự án BIM Tools mới</p>
                <div className="flex gap-2">
                  <input autoFocus className={cn(inputCls, "w-28 shrink-0 font-mono uppercase")}
                    placeholder="Mã" value={newPgCode}
                    onChange={(e) => { setNewPgCode(e.target.value.toUpperCase()); setErr(null); }} />
                  <input className={cn(inputCls, "flex-1")} placeholder="Tên dự án…" value={newPgName}
                    onChange={(e) => { setNewPgName(e.target.value); setErr(null); }} />
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={creatingPgPending} onClick={handleCreatePg}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                    <Check className="size-3.5" /> {creatingPgPending ? "Đang lưu…" : "Tạo"}
                  </button>
                  <button type="button" onClick={() => { setCreatingPg(false); setErr(null); }}
                    className="text-xs text-slate-400 hover:text-slate-600">Hủy</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loại hình */}
        {activeField === "parentId" && (
          <div className="space-y-2">
            {!creatingL2 ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Loại hình <span className="text-red-500">*</span>
                  </label>
                  <Select value={parentId} onChange={(e) => setParentId(e.target.value)} className="h-9">
                    {ptLevel2.map((l) => (
                      <option key={l.id} value={l.id}>{l.value}</option>
                    ))}
                  </Select>
                </div>
                <button type="button" onClick={() => setCreatingL2(true)}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                  <Plus className="size-3.5" /> Tạo loại hình mới
                </button>
              </>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Tạo loại hình mới</p>
                <input autoFocus className={inputCls} placeholder="Tên loại hình…" value={newL2Value}
                  onChange={(e) => { setNewL2Value(e.target.value); setErr(null); }} />
                <div className="flex gap-2">
                  <button type="button" disabled={creatingL2Pending} onClick={handleCreateL2}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                    <Check className="size-3.5" /> {creatingL2Pending ? "Đang lưu…" : "Tạo"}
                  </button>
                  <button type="button" onClick={() => { setCreatingL2(false); setErr(null); }}
                    className="text-xs text-slate-400 hover:text-slate-600">Hủy</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hạng mục */}
        {activeField === "value" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              Tên hạng mục mới <span className="text-red-500">*</span>
            </label>
            <input autoFocus className={inputCls} placeholder="Nhập tên mới…" value={value}
              onChange={(e) => { setValue(e.target.value); setErr(null); }} />
            <p className="text-[11px] text-amber-500">Sẽ đổi hạng mục cho tất cả {ids.length} dòng đã chọn thành tên này.</p>
          </div>
        )}

        {err ? (
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="size-3.5" /> {err}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={pending || creatingPg || creatingL2}>
            <Check className="size-4" /> {pending ? "Đang lưu…" : `Áp dụng cho ${ids.length} dòng`}
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
