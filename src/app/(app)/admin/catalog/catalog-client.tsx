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
  ChevronDown,
  ChevronRight,
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
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
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
import { deleteConstructionType, saveConstructionType, upsertConstructionTypeReturnId } from "@/server/actions/construction-types";
import { deleteDepartment, saveDepartment } from "@/server/actions/departments";
import { deleteDiscipline, saveDiscipline } from "@/server/actions/disciplines";
import {
  batchDuplicateCatalogProjects,
  batchSaveCatalogProjects,
  batchUpdateCatalogProjects,
  createProjectGroupReturnId,
  deleteProject,
  deleteProjectGroup,
  saveCatalogProject,
  saveProjectGroup,
} from "@/server/actions/projects";
import {
  grantCatalogColumnPermission,
  listCatalogColumnPermissions,
  revokeCatalogColumnPermission,
} from "@/server/actions/catalog-permissions";
import {
  CATALOG_PERMISSION_COLUMNS,
  CATALOG_PERMISSION_COLUMN_LABEL,
  type CatalogPermissionColumn,
} from "@/lib/catalog-permission-columns";
import { LevelColumn } from "./[workGroupId]/catalog-detail";
import { CatalogG6Graph } from "@/components/catalog-g6-graph";
import type { Result } from "@/server/actions/_helpers";

const norm = removeVietnameseTones;
function fmtProjectDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

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
  startDate: string | null;
  packagingDate: string | null;
  description: string | null;
  taskCount: number;
};
type WorkRow = { id: string; workGroupId: string; value: string; order: number };
type SimpleRow = { id: string; code: string; name: string; order: number };
type Row = { id: string; order: number } & Record<string, unknown>;

type TabId = "groups" | "projects" | "bimtools" | "works" | "phases" | "disciplines" | "departments" | "ctypes";
type ProjectsScope = "general" | "bimtools";
type SimpleCatalogModel = "workGroup" | "phase" | "discipline" | "department" | "constructionType";

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
  departments,
  constructionTypes,
  projectGroups,
  projects,
  works,
  ptItems,
  isAdmin,
  editableColumns,
  users,
}: {
  workGroups: WorkGroupRow[];
  phases: SimpleRow[];
  disciplines: SimpleRow[];
  departments: SimpleRow[];
  constructionTypes: SimpleRow[];
  projectGroups: ProjectGroupRow[];
  projects: ProjectRow[];
  works: WorkRow[];
  ptItems: { id: string; level: number; value: string; parentId: string | null; projectGroupId: string | null; order: number }[];
  /** ADMIN sửa toàn quyền; member chỉ xem, trừ các cột trong editableColumns được cấp quyền sửa. */
  isAdmin: boolean;
  editableColumns: CatalogPermissionColumn[];
  users: { id: string; fullName: string; departmentId: string | null }[];
}) {
  // Chỉ ADMIN mới thấy/dùng được các control tạo/sửa/xóa; các cột trong editableColumns
  // (Bắt đầu/Đóng gói/Quy mô/Mô tả của Hạng mục) member được cấp quyền vẫn bấm sửa được riêng.
  const readOnly = !isAdmin;
  const canEditCol = React.useCallback(
    (col: CatalogPermissionColumn) => isAdmin || editableColumns.includes(col),
    [isAdmin, editableColumns],
  );
  const router = useRouter();
  const [showColumnPermissions, setShowColumnPermissions] = React.useState(false);
  const [tab, setTab] = React.useState<TabId>("groups");
  const [projectsViewMode, setProjectsViewMode] = React.useState<"table" | "grouped" | "g6">("table");
  const [groupedCollapsed, setGroupedCollapsed] = React.useState<Set<string>>(new Set());
  const [groupedCtCollapsed, setGroupedCtCollapsed] = React.useState<Set<string>>(new Set());
  const [groupedHmCollapsed, setGroupedHmCollapsed] = React.useState<Set<string>>(new Set());
  const [groupedBlockCollapsed, setGroupedBlockCollapsed] = React.useState<Set<string>>(new Set());
  const [groupedSelectedIds, setGroupedSelectedIds] = React.useState<Set<string>>(new Set());
  const [groupedFilter, setGroupedFilter] = React.useState("");
  const [groupedColFilters, setGroupedColFilters] = React.useState<Record<string, string[]>>({});
  const [groupedOpenFilter, setGroupedOpenFilter] = React.useState<{ key: string; label: string; opts: string[]; rect: DOMRect } | null>(null);

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
    field: "groupId" | "constructionTypeId" | "name" | "blockSystem" | "startDate" | "packagingDate" | "scale" | "description";
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
  const [bulkDuplicateIds, setBulkDuplicateIds] = React.useState<string[] | null>(null);
  const [addLoaiHinhCtx, setAddLoaiHinhCtx] = React.useState<ProjectGroupRow | null>(null);
  const [addHangMucCtx, setAddHangMucCtx] = React.useState<{
    title: string;
    defaultHangMuc?: string;
    groupId: string;
    constructionTypeId: string | null;
    hmDateSource?: { startDate?: Date | string | null; packagingDate?: Date | string | null };
  } | null>(null);

  // Modal thêm/sửa + xác nhận xóa (dùng chung).
  const [addItemsScope, setAddItemsScope] = React.useState<string | null>(null);
  const [addBimtoolsItemsCtx, setAddBimtoolsItemsCtx] = React.useState<{ id: string; code: string; name: string } | null>(null);
  const [manageBimtoolsL2, setManageBimtoolsL2] = React.useState(false);

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
    { id: "departments", label: "Bộ phận", Icon: Users, count: departments.length },
    { id: "ctypes", label: "Loại hình công trình", Icon: Building, count: constructionTypes.length },
  ];

  // ============== TAB 1 — Nhóm công việc ==============
  const groupsView = () => (
    <FilterTable
      title="Nhóm công việc"
      rows={workGroups as unknown as Row[]}
      addLabel="Thêm nhóm"
      minWidth={620}
      readOnly={readOnly}
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
    { key: "startDate", label: "Bắt đầu", type: "date" as const, span: 1 },
    { key: "packagingDate", label: "Đóng gói", type: "date" as const, span: 1 },
    { key: "description", label: "Mô tả", type: "textarea" as const, span: 3, hint: "hiện khi hover vào tên hạng mục ở /manage và /tasks" },
  ];
  // ---- View gom nhóm theo Dự án → Loại hình → Hạng mục → Khối/Hệ thống ----
  const groupedProjectsView = () => {
    const byGroup = new Map<string, { group: ProjectGroupRow; items: ProjectRow[] }>();
    for (const g of generalProjectGroups) byGroup.set(g.id, { group: g, items: [] });
    for (const p of generalProjects) {
      const gid = p.groupId ?? "__none__";
      if (!byGroup.has(gid)) byGroup.set(gid, { group: { id: gid, code: "—", name: "(Không nhóm)", order: 9999, workGroupId: null, itemCount: 0 }, items: [] });
      byGroup.get(gid)!.items.push(p);
    }
    const toggleGrouped = (id: string) => setGroupedCollapsed(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleCt = (key: string) => setGroupedCtCollapsed(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const toggleHm = (key: string) => setGroupedHmCollapsed(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const q = groupedFilter.trim().toLowerCase();
    // Column filter helpers
    const gcfGroup = groupedColFilters["group"] ?? [];
    const gcfCt = groupedColFilters["ct"] ?? [];
    const gcfName = groupedColFilters["name"] ?? [];
    const gcfBlock = groupedColFilters["block"] ?? [];
    const hasColFilter = gcfGroup.length > 0 || gcfCt.length > 0 || gcfName.length > 0 || gcfBlock.length > 0;
    const gcfClearCol = (k: string) => setGroupedColFilters(s => { const n = { ...s }; delete n[k]; return n; });
    const gcfClearAll = () => setGroupedColFilters({});
    // Filter projects by active column filters
    const filteredProjects = hasColFilter
      ? generalProjects.filter(p => {
          const pgCode = pgById.get(p.groupId ?? "")?.code ?? "";
          const ctCode = ctById.get(p.constructionTypeId ?? "")?.code ?? "";
          if (gcfGroup.length && !gcfGroup.includes(pgCode)) return false;
          if (gcfCt.length && !gcfCt.includes(ctCode)) return false;
          if (gcfName.length && !gcfName.includes(p.name)) return false;
          if (gcfBlock.length && !gcfBlock.includes(p.blockSystem ?? "")) return false;
          return true;
        })
      : generalProjects;
    // Rebuild byGroup from filtered projects
    const byGroupF = new Map<string, { group: ProjectGroupRow; items: ProjectRow[] }>();
    for (const g of generalProjectGroups) byGroupF.set(g.id, { group: g, items: [] });
    for (const p of filteredProjects) {
      const gid = p.groupId ?? "__none__";
      if (!byGroupF.has(gid)) byGroupF.set(gid, { group: { id: gid, code: "—", name: "(Không nhóm)", order: 9999, workGroupId: null, itemCount: 0 }, items: [] });
      byGroupF.get(gid)!.items.push(p);
    }
    // Filter options (computed from original list for full choices)
    const optCt = [...new Set(generalProjects.map(p => ctById.get(p.constructionTypeId ?? "")?.code ?? "").filter(Boolean))].sort((a,b) => a.localeCompare(b,"vi"));
    const optName = [...new Set(generalProjects.map(p => p.name).filter(Boolean))].sort((a,b) => a.localeCompare(b,"vi"));
    const optBlock = [...new Set(generalProjects.map(p => p.blockSystem ?? "").filter(Boolean))].sort((a,b) => a.localeCompare(b,"vi"));
    const openGcf = (key: string, label: string, opts: string[], e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setGroupedOpenFilter(o => o?.key === key ? null : { key, label, opts, rect });
    };
    const groupsWithItems = [...byGroupF.values()].filter(e => {
      if (q && !(e.group.code.toLowerCase().includes(q) || e.group.name.toLowerCase().includes(q))) return false;
      if (!hasColFilter) return true;
      // Lọc đích danh cột "Dự án" → vẫn hiện dự án đó dù chưa có hạng mục nào (để còn thêm mới).
      if (gcfGroup.length && gcfGroup.includes(e.group.code)) return true;
      // Lọc theo cột khác (Loại hình/Hạng mục/Khối-Hệ thống) → chỉ hiện dự án có hạng mục khớp.
      return e.items.length > 0;
    });
    const toggleBlock = (key: string) => setGroupedBlockCollapsed(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const expandSelectedPaths = (ids: string[]) => {
      const targets = new Set(ids);
      if (targets.size === 0) return;
      const projectKeys: string[] = [];
      const ctKeys: string[] = [];
      const hmKeys: string[] = [];
      const blockKeys: string[] = [];

      for (const { group, items } of groupsWithItems) {
        if (!items.some((p) => targets.has(p.id))) continue;
        projectKeys.push(group.id);
        const ctMap = new Map<string, ProjectRow[]>();
        for (const p of items) {
          const ctId = p.constructionTypeId ?? "__none__";
          if (!ctMap.has(ctId)) ctMap.set(ctId, []);
          ctMap.get(ctId)!.push(p);
        }
        for (const [ctId, ctItems] of ctMap.entries()) {
          if (!ctItems.some((p) => targets.has(p.id))) continue;
          const ctKey = `${group.id}|ct|${ctId}`;
          ctKeys.push(ctKey);
          const hmMap = new Map<string, ProjectRow[]>();
          for (const p of ctItems) {
            if (!hmMap.has(p.name)) hmMap.set(p.name, []);
            hmMap.get(p.name)!.push(p);
          }
          for (const [hmName, hmItems] of hmMap.entries()) {
            if (!hmItems.some((p) => targets.has(p.id))) continue;
            const hmKey = `${ctKey}|hm|${hmName}`;
            hmKeys.push(hmKey);
            for (const p of hmItems) {
              if (targets.has(p.id)) blockKeys.push(`${hmKey}|block|${p.id}`);
            }
          }
        }
      }

      setGroupedCollapsed((s) => {
        const n = new Set(s);
        projectKeys.forEach((k) => n.delete(k));
        return n;
      });
      setGroupedCtCollapsed((s) => {
        const n = new Set(s);
        ctKeys.forEach((k) => n.delete(k));
        return n;
      });
      setGroupedHmCollapsed((s) => {
        const n = new Set(s);
        hmKeys.forEach((k) => n.delete(k));
        return n;
      });
      setGroupedBlockCollapsed((s) => {
        const n = new Set(s);
        blockKeys.forEach((k) => n.delete(k));
        return n;
      });
    };
    const toggleSel = (id: string) => {
      if (!groupedSelectedIds.has(id)) expandSelectedPaths([id]);
      setGroupedSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };
    const selectIds = (ids: string[], selected: boolean) => {
      if (!selected) expandSelectedPaths(ids);
      setGroupedSelectedIds(s => {
      const n = new Set(s);
      if (selected) ids.forEach(id => n.delete(id));
      else ids.forEach(id => n.add(id));
      return n;
      });
    };
    const rowActions = (p: ProjectRow) => !isAdmin ? null : (
      <div className="flex justify-end gap-0.5 opacity-60 transition group-hover:opacity-100">
        <button type="button" title="Sửa" onClick={() => {
          setRecord({ title: "Sửa hạng mục", fields: generalItemFields, initial: { groupId: p.groupId ?? "", constructionTypeId: p.constructionTypeId ?? "", name: p.name, blockSystem: p.blockSystem ?? "", scale: p.scale ?? "", startDate: p.startDate ?? "", packagingDate: p.packagingDate ?? "", description: p.description ?? "" },
            submit: (v) => saveCatalogProject({ id: p.id, groupId: v.groupId, name: v.name, blockSystem: v.blockSystem || null, constructionTypeId: v.constructionTypeId || null, scale: v.scale || null, startDate: v.startDate || null, packagingDate: v.packagingDate || null, description: v.description || null }) });
        }} className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <Pencil className="size-4" />
        </button>
        <button type="button" title="Xóa" onClick={() => setConfirm({ name: p.name, warnMsg: p.taskCount > 0 ? `Hạng mục đang có ${p.taskCount} công việc — các công việc sẽ mất liên kết dự án.` : undefined, run: () => deleteProject(p.id) })}
          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500">
          <Trash2 className="size-4" />
        </button>
      </div>
    );
    const allVisibleIds = groupsWithItems.flatMap(({ items }) => items.map((p) => p.id));
    const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => groupedSelectedIds.has(id));
    const someVisibleSelected = !allVisibleSelected && allVisibleIds.some((id) => groupedSelectedIds.has(id));

    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
        {/* Header với filter */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
          <span className="text-sm font-medium text-slate-700">Dự án · Hạng mục</span>
          <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{filteredProjects.length}{hasColFilter ? <span className="text-slate-400"> / {generalProjects.length}</span> : null}</span>
          {hasColFilter && (
            <div className="flex flex-wrap items-center gap-1.5">
              {gcfGroup.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-xs">
                  <span className="text-slate-400">Dự án:</span>
                  <span className="font-medium text-slate-700">{gcfGroup.length === 1 ? gcfGroup[0] : `${gcfGroup.length} mục`}</span>
                  <button type="button" onClick={() => gcfClearCol("group")} className="grid size-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X className="size-3" /></button>
                </span>
              )}
              {gcfCt.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-xs">
                  <span className="text-slate-400">Loại hình:</span>
                  <span className="font-medium text-slate-700">{gcfCt.length === 1 ? gcfCt[0] : `${gcfCt.length} mục`}</span>
                  <button type="button" onClick={() => gcfClearCol("ct")} className="grid size-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X className="size-3" /></button>
                </span>
              )}
              {gcfName.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-xs">
                  <span className="text-slate-400">Hạng mục:</span>
                  <span className="font-medium text-slate-700">{gcfName.length === 1 ? gcfName[0] : `${gcfName.length} mục`}</span>
                  <button type="button" onClick={() => gcfClearCol("name")} className="grid size-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X className="size-3" /></button>
                </span>
              )}
              {gcfBlock.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-xs">
                  <span className="text-slate-400">Khối/HT:</span>
                  <span className="font-medium text-slate-700">{gcfBlock.length === 1 ? gcfBlock[0] : `${gcfBlock.length} mục`}</span>
                  <button type="button" onClick={() => gcfClearCol("block")} className="grid size-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X className="size-3" /></button>
                </span>
              )}
              <button type="button" onClick={gcfClearAll} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-slate-400 hover:text-red-600"><RotateCcw className="size-3" /> Xóa lọc</button>
            </div>
          )}
          <div className="relative ml-auto w-52">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-background pl-8 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Tìm dự án..."
              value={groupedFilter}
              onChange={(e) => setGroupedFilter(e.target.value)}
            />
          </div>
        </div>
        {/* Bulk bar khi có chọn */}
        {isAdmin && groupedSelectedIds.size > 0 && (
          <CatalogBulkBar
            count={groupedSelectedIds.size}
            onClear={() => setGroupedSelectedIds(new Set())}
            actions={[
              { label: "Đổi Dự án", onClick: () => setBulkProjectEdit({ ids: [...groupedSelectedIds], field: "groupId" }) },
              { label: "Đổi Loại hình", onClick: () => setBulkProjectEdit({ ids: [...groupedSelectedIds], field: "constructionTypeId" }) },
              { label: "Đổi Hạng mục", onClick: () => setBulkProjectEdit({ ids: [...groupedSelectedIds], field: "name" }) },
              { label: "Đổi mô tả hạng mục", onClick: () => setBulkProjectEdit({ ids: [...groupedSelectedIds], field: "description" }) },
              { label: "Đổi Khối/Hệ thống", onClick: () => setBulkProjectEdit({ ids: [...groupedSelectedIds], field: "blockSystem" }) },
              { label: "Đổi Bắt đầu", onClick: () => setBulkProjectEdit({ ids: [...groupedSelectedIds], field: "startDate" }) },
              { label: "Đổi Đóng gói", onClick: () => setBulkProjectEdit({ ids: [...groupedSelectedIds], field: "packagingDate" }) },
              { label: "Nhân bản", onClick: () => setBulkDuplicateIds([...groupedSelectedIds]) },
              {
                label: "Xóa dòng đã chọn",
                tone: "danger",
                onClick: () => {
                  const selected = generalProjects.filter((p) => groupedSelectedIds.has(p.id));
                  const blocked = selected.filter((p) => p.taskCount > 0);
                  setConfirm({
                    name: `${groupedSelectedIds.size} hạng mục đã chọn`,
                    warnMsg: [
                      `Sẽ xóa ${groupedSelectedIds.size} hạng mục đã chọn.`,
                      blocked.length ? `${blocked.length} hạng mục đang có công việc — các công việc đó sẽ mất liên kết dự án.` : "",
                    ].filter(Boolean).join(" "),
                    run: async () => {
                      for (const id of [...groupedSelectedIds]) {
                        const res = await deleteProject(id);
                        if (!res.ok) return res;
                      }
                      setGroupedSelectedIds(new Set());
                      return { ok: true, data: null } satisfies Result<null>;
                    },
                  });
                },
              },
            ]}
          />
        )}
        <div className="max-h-[calc(100vh-240px)] overflow-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-card">
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                <th className="w-9 px-3 py-2">
                  {isAdmin ? (
                    <input
                      type="checkbox"
                      className="size-3.5 accent-slate-700"
                      checked={allVisibleSelected}
                      ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                      onChange={() => selectIds(allVisibleIds, allVisibleSelected)}
                      title={allVisibleSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                      aria-label={allVisibleSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                    />
                  ) : null}
                </th>
                <th className="w-[12%] px-3 py-2">
                  <div className="flex items-center gap-1">Dự án
                    <button type="button" onClick={(e) => openGcf("group", "Dự án", generalProjectGroups.map(g => g.code), e)} className={cn("grid size-5 place-items-center rounded", (groupedColFilters["group"] ?? []).length ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-200")}><Filter className="size-3" /></button>
                  </div>
                </th>
                <th className="w-[7%] px-3 py-2">
                  <div className="flex items-center gap-1">Loại hình
                    <button type="button" onClick={(e) => openGcf("ct", "Loại hình", optCt, e)} className={cn("grid size-5 place-items-center rounded", gcfCt.length ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-200")}><Filter className="size-3" /></button>
                  </div>
                </th>
                <th className="w-[12%] px-3 py-2">
                  <div className="flex items-center gap-1">Hạng mục
                    <button type="button" onClick={(e) => openGcf("name", "Hạng mục", optName, e)} className={cn("grid size-5 place-items-center rounded", gcfName.length ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-200")}><Filter className="size-3" /></button>
                  </div>
                </th>
                <th className="w-[30%] px-3 py-2">
                  <div className="flex items-center gap-1">Khối/Hệ thống
                    <button type="button" onClick={(e) => openGcf("block", "Khối/Hệ thống", optBlock, e)} className={cn("grid size-5 place-items-center rounded", gcfBlock.length ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-200")}><Filter className="size-3" /></button>
                  </div>
                </th>
                <th className="w-28 px-3 py-2">Bắt đầu</th>
                <th className="w-28 px-3 py-2">Đóng gói</th>
                <th className="w-32 px-3 py-2 text-right">Quy mô</th>
                <th className="w-24 px-3 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {groupsWithItems.map(({ group, items }) => {
                const projectKey = group.id;
                const collapsed = groupedCollapsed.has(projectKey);
                const allGroupIds = items.map(p => p.id);
                const allGroupSel = allGroupIds.length > 0 && allGroupIds.every(id => groupedSelectedIds.has(id));
                const someGroupSel = !allGroupSel && allGroupIds.some(id => groupedSelectedIds.has(id));

                const ctMap = new Map<string, ProjectRow[]>();
                for (const p of items) {
                  const key = p.constructionTypeId ?? "__none__";
                  if (!ctMap.has(key)) ctMap.set(key, []);
                  ctMap.get(key)!.push(p);
                }

                return (
                  <React.Fragment key={projectKey}>
                    <tr className="border-b border-slate-200 bg-slate-100">
                      <td className="px-3 py-2 align-middle">
                        {isAdmin ? (
                          <input
                            type="checkbox"
                            className="size-3.5 accent-slate-700"
                            checked={allGroupSel}
                            ref={(el) => { if (el) el.indeterminate = someGroupSel; }}
                            onChange={() => selectIds(allGroupIds, allGroupSel)}
                          />
                        ) : null}
                      </td>
                      <td className="px-3 py-2" colSpan={8}>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => toggleGrouped(projectKey)} className="inline-flex items-center gap-2 text-left">
                            {collapsed ? <ChevronRight className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
                            <span className="font-mono text-[13px] font-semibold text-slate-700" title={group.name}>{group.code}</span>
                            <span className="text-xs font-normal text-slate-400">({ctMap.size} loại hình)</span>
                          </button>
                          {isAdmin ? (
                          <button type="button" title="Thêm loại hình / hạng mục" onClick={() => setAddLoaiHinhCtx(group)} className="grid size-5 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                            <Plus className="size-3" />
                          </button>
                          ) : null}
                          {isAdmin && group.code !== "—" && (
                            <>
                              <button
                                type="button"
                                title="Sửa dự án"
                                onClick={() =>
                                  setRecord({
                                    title: "Sửa dự án",
                                    fields: GROUP_FIELDS_PROJECT,
                                    initial: { code: group.code, name: group.name, order: String(group.order) },
                                    existingCodes: projectGroups.filter((x) => x.id !== group.id).map((x) => x.code),
                                    submit: (v) => saveProjectGroup({ id: group.id, code: v.code, name: v.name, order: Number(v.order || 0) }),
                                  })
                                }
                                className="grid size-5 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                type="button"
                                title="Xóa dự án"
                                onClick={() =>
                                  setConfirm({
                                    name: group.name,
                                    blockMsg: group.itemCount > 0 ? `Dự án đang có ${group.itemCount} hạng mục. Hãy gỡ/chuyển hạng mục trước khi xóa.` : undefined,
                                    run: () => deleteProjectGroup(group.id),
                                  })
                                }
                                className="grid size-5 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!collapsed && [...ctMap.entries()].map(([ctId, ctItems]) => {
                      const ct = ctId !== "__none__" ? ctById.get(ctId) : null;
                      const ctKey = `${projectKey}|ct|${ctId}`;
                      const ctCollapsed = groupedCtCollapsed.has(ctKey);
                      const ctIds = ctItems.map(p => p.id);
                      const allCtSel = ctIds.every(id => groupedSelectedIds.has(id));
                      const someCtSel = !allCtSel && ctIds.some(id => groupedSelectedIds.has(id));

                      const hmMap = new Map<string, ProjectRow[]>();
                      for (const p of ctItems) {
                        if (!hmMap.has(p.name)) hmMap.set(p.name, []);
                        hmMap.get(p.name)!.push(p);
                      }

                      return (
                        <React.Fragment key={ctKey}>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <td className="px-3 py-2 align-middle">
                              {isAdmin ? (
                                <input
                                  type="checkbox"
                                  className="size-3.5 accent-slate-700"
                                  checked={allCtSel}
                                  ref={(el) => { if (el) el.indeterminate = someCtSel; }}
                                  onChange={() => selectIds(ctIds, allCtSel)}
                                />
                              ) : null}
                            </td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" colSpan={7}>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => toggleCt(ctKey)} className="inline-flex items-center gap-1.5 text-left">
                                  {ctCollapsed ? <ChevronRight className="size-3.5 text-slate-400" /> : <ChevronDown className="size-3.5 text-slate-400" />}
                                  {ct ? (
                                    <span className="font-mono text-xs font-semibold text-slate-700" title={ct.name}>{ct.code}</span>
                                  ) : (
                                    <span className="text-xs font-medium text-slate-400">Chưa có loại hình</span>
                                  )}
                                  <span className="text-xs font-normal text-slate-400">({hmMap.size} hạng mục)</span>
                                </button>
                                {isAdmin ? (
                                <button type="button" title="Thêm hạng mục" onClick={() => setAddHangMucCtx({ title: `Thêm hạng mục — ${ct?.code ?? "Chưa có loại hình"}`, groupId: group.id, constructionTypeId: ctId !== "__none__" ? ctId : null })} className="grid size-5 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                  <Plus className="size-3" />
                                </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {!ctCollapsed && [...hmMap.entries()].map(([hmName, hmItems]) => {
                            const hmKey = `${ctKey}|hm|${hmName}`;
                            const hmCollapsed = groupedHmCollapsed.has(hmKey);
                            const hmDateSource = hmItems[0];
                            const hasBlockRows = hmItems.some((p) => p.blockSystem);
                            const singleNoBlockItem = hmItems.length === 1 && !hmItems[0].blockSystem ? hmItems[0] : null;
                            const hmIds = hmItems.map(p => p.id);
                            const allHmSel = hmIds.every(id => groupedSelectedIds.has(id));
                            const someHmSel = !allHmSel && hmIds.some(id => groupedSelectedIds.has(id));

                            return (
                              <React.Fragment key={hmKey}>
                                <tr className="border-b border-slate-100 bg-white">
                                  <td className="px-3 py-2 align-middle">
                                    {isAdmin ? (
                                      <input
                                        type="checkbox"
                                        className="size-3.5 accent-slate-700"
                                        checked={allHmSel}
                                        ref={(el) => { if (el) el.indeterminate = someHmSel; }}
                                        onChange={() => selectIds(hmIds, allHmSel)}
                                      />
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2" />
                                  <td className="px-3 py-2" />
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <button type="button" onClick={() => toggleHm(hmKey)} className="grid size-5 shrink-0 place-items-center">
                                        {hmCollapsed ? <ChevronRight className="size-3.5 text-slate-400" /> : <ChevronDown className="size-3.5 text-slate-400" />}
                                      </button>
                                      {canEditCol("description") ? (
                                        <InlineEditProjectCell
                                          ids={hmIds}
                                          field="description"
                                          value={hmDateSource.description ?? ""}
                                          type="text"
                                          placeholder="Nhập mô tả hạng mục…"
                                          display={<span className="text-xs font-medium text-slate-700">{hmName}</span>}
                                        />
                                      ) : (
                                        <span className="text-xs font-medium text-slate-700" title={hmDateSource.description || undefined}>{hmName}</span>
                                      )}
                                      <button type="button" onClick={() => toggleHm(hmKey)} className="text-xs font-normal text-slate-400">({hmItems.length} khối)</button>
                                      {isAdmin ? (
                                        <button type="button" title="Thêm hạng mục / khối" onClick={() => setAddHangMucCtx({ title: `Thêm hạng mục / khối — ${hmName}`, defaultHangMuc: hmName, groupId: group.id, constructionTypeId: ctId !== "__none__" ? ctId : null, hmDateSource })} className="grid size-5 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                          <Plus className="size-3" />
                                        </button>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2" />
                                  <td className="px-3 py-2 tabular-nums text-xs font-medium text-slate-600">
                                    {canEditCol("startDate") ? (
                                      <InlineEditProjectCell
                                        ids={hmIds}
                                        field="startDate"
                                        value={hmDateSource.startDate ?? ""}
                                        type="date"
                                        display={hmDateSource.startDate ? fmtProjectDate(hmDateSource.startDate) : <span className="text-slate-300">—</span>}
                                      />
                                    ) : (
                                      hmDateSource.startDate ? fmtProjectDate(hmDateSource.startDate) : <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 tabular-nums text-xs font-medium text-slate-600">
                                    {canEditCol("packagingDate") ? (
                                      <InlineEditProjectCell
                                        ids={hmIds}
                                        field="packagingDate"
                                        value={hmDateSource.packagingDate ?? ""}
                                        type="date"
                                        display={hmDateSource.packagingDate ? fmtProjectDate(hmDateSource.packagingDate) : <span className="text-slate-300">—</span>}
                                      />
                                    ) : (
                                      hmDateSource.packagingDate ? fmtProjectDate(hmDateSource.packagingDate) : <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                    {singleNoBlockItem && canEditCol("scale") ? (
                                      <InlineEditProjectCell
                                        ids={[singleNoBlockItem.id]}
                                        field="scale"
                                        value={singleNoBlockItem.scale ?? ""}
                                        type="text"
                                        placeholder="vd 12.000 m²"
                                        display={singleNoBlockItem?.scale ?? <span className="text-slate-300">—</span>}
                                      />
                                    ) : (
                                      singleNoBlockItem?.scale ?? <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">{singleNoBlockItem ? rowActions(singleNoBlockItem) : null}</td>
                                </tr>
                                {!hmCollapsed && hasBlockRows && hmItems.map((p) => {
                                  const blockKey = `${hmKey}|block|${p.id}`;
                                  const blockCollapsed = groupedBlockCollapsed.has(blockKey);
                                  const isSel = groupedSelectedIds.has(p.id);
                                  return (
                                    <tr key={blockKey} className={cn("group border-b border-slate-100 hover:bg-slate-50", isSel && "bg-slate-50")}>
                                      <td className="px-3 py-2 align-middle">
                                        {isAdmin ? (
                                          <input
                                            type="checkbox"
                                            className="size-3.5 accent-slate-700"
                                            checked={isSel}
                                            onChange={() => toggleSel(p.id)}
                                          />
                                        ) : null}
                                      </td>
                                      <td className="px-3 py-2" />
                                      <td className="px-3 py-2" />
                                      <td className="px-3 py-2" />
                                      <td className="px-3 py-2">
                                        <button type="button" onClick={() => toggleBlock(blockKey)} className="inline-flex items-center gap-1.5 text-left">
                                          {blockCollapsed ? <ChevronRight className="size-3.5 text-slate-400" /> : <ChevronDown className="size-3.5 text-slate-400" />}
                                          {p.blockSystem ? <span className="text-xs font-medium text-slate-700">{p.blockSystem}</span> : <span className="text-xs text-slate-300">—</span>}
                                        </button>
                                      </td>
                                      <td className="px-3 py-2" />
                                      <td className="px-3 py-2" />
                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                        {canEditCol("scale") ? (
                                          <InlineEditProjectCell
                                            ids={[p.id]}
                                            field="scale"
                                            value={p.scale ?? ""}
                                            type="text"
                                            placeholder="vd 12.000 m²"
                                            display={p.scale ?? <span className="text-slate-300">—</span>}
                                          />
                                        ) : (
                                          p.scale ?? <span className="text-slate-300">—</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        {rowActions(p)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const collectGroupedCollapseKeys = () => {
    const projectKeys: string[] = [];
    const ctKeys: string[] = [];
    const hmKeys: string[] = [];
    const blockKeys: string[] = [];
    const targets = groupedSelectedIds.size > 0 ? groupedSelectedIds : null;
    const byGroup = new Map<string, ProjectRow[]>();
    for (const g of generalProjectGroups) byGroup.set(g.id, []);
    for (const p of generalProjects) {
      const gid = p.groupId ?? "__none__";
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid)!.push(p);
    }
    for (const [projectKey, items] of byGroup.entries()) {
      if (items.length === 0) continue;
      if (targets && !items.some((p) => targets.has(p.id))) continue;
      projectKeys.push(projectKey);
      const ctMap = new Map<string, ProjectRow[]>();
      for (const p of items) {
        const ctId = p.constructionTypeId ?? "__none__";
        if (!ctMap.has(ctId)) ctMap.set(ctId, []);
        ctMap.get(ctId)!.push(p);
      }
      for (const [ctId, ctItems] of ctMap.entries()) {
        if (targets && !ctItems.some((p) => targets.has(p.id))) continue;
        const ctKey = `${projectKey}|ct|${ctId}`;
        ctKeys.push(ctKey);
        const hmMap = new Map<string, ProjectRow[]>();
        for (const p of ctItems) {
          if (!hmMap.has(p.name)) hmMap.set(p.name, []);
          hmMap.get(p.name)!.push(p);
        }
        for (const [hmName, hmItems] of hmMap.entries()) {
          if (targets && !hmItems.some((p) => targets.has(p.id))) continue;
          const hmKey = `${ctKey}|hm|${hmName}`;
          hmKeys.push(hmKey);
          for (const p of hmItems) {
            if (!targets || targets.has(p.id)) blockKeys.push(`${hmKey}|block|${p.id}`);
          }
        }
      }
    }
    return { projectKeys, ctKeys, hmKeys, blockKeys };
  };

  const projectsView = () => (
    <>
      {/* Toggle Bảng / Dự án / AntV G6 + Collapse/Expand All */}
      <div className="sticky top-[6.5rem] z-[25] -mx-4 mb-3 flex items-center gap-2 bg-background px-4 pb-2 pt-1 lg:-mx-6 lg:px-6">
        {(["table", "grouped", "g6"] as const).map(m => (
          <button key={m} type="button" onClick={() => setProjectsViewMode(m)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition",
              projectsViewMode === m ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            )}>
            {m === "table" ? "Bảng" : m === "grouped" ? "Dự án" : "AntV G6"}
          </button>
        ))}
        {projectsViewMode === "grouped" && (
          <>
            <div className="h-4 w-px bg-slate-200" />
            <button type="button" onClick={() => {
              const keys = collectGroupedCollapseKeys();
              setGroupedCollapsed(new Set(keys.projectKeys));
              setGroupedCtCollapsed(new Set(keys.ctKeys));
              setGroupedHmCollapsed(new Set(keys.hmKeys));
              setGroupedBlockCollapsed(new Set(keys.blockKeys));
            }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
              <X className="size-3" /> Thu gọn
            </button>
            <button type="button" onClick={() => {
              setGroupedCollapsed(new Set());
              setGroupedCtCollapsed(new Set());
              setGroupedHmCollapsed(new Set());
              setGroupedBlockCollapsed(new Set());
            }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
              <ChevronsUpDown className="size-3" /> Mở rộng
            </button>
          </>
        )}
        {isAdmin ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setRecord({
                  title: "Thêm dự án",
                  fields: GROUP_FIELDS_PROJECT,
                  initial: { code: "", name: "", order: "0" },
                  existingCodes: projectGroups.map((g) => g.code),
                  submit: async (v) => {
                    const res = await createProjectGroupReturnId({ code: v.code, name: v.name, workGroupId: null });
                    // Tạo xong → mở luôn modal thêm Loại hình/Hạng mục cho dự án vừa tạo (bỏ qua được nếu chưa muốn thêm ngay).
                    if (res.ok && res.data) {
                      setAddLoaiHinhCtx({
                        id: res.data.id,
                        code: v.code.trim().toUpperCase(),
                        name: v.name.trim(),
                        order: Number(v.order || 0),
                        workGroupId: null,
                        itemCount: 0,
                      });
                    }
                    return res;
                  },
                })
              }
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              <Plus className="size-4" /> Thêm dự án
            </button>
          </div>
        ) : null}
      </div>
      {projectsViewMode === "g6" ? (
        <CatalogG6Graph
          projectGroups={generalProjectGroups}
          projects={generalProjects}
          constructionTypes={constructionTypes}
        />
      ) : projectsViewMode === "grouped" ? groupedProjectsView() :
    <FilterTable
      title="Dự án · Hạng mục"
      rows={(groupedFilter.trim() ? generalProjects.filter(p => { const g = pgById.get(p.groupId ?? ""); const q2 = groupedFilter.trim().toLowerCase(); return g ? g.code.toLowerCase().includes(q2) || g.name.toLowerCase().includes(q2) : false; }) : generalProjects) as unknown as Row[]}
      minWidth={720}
      readOnly={readOnly}
      selectable
      bulkBar={(ids, clear) => (
        <CatalogBulkBar
          count={ids.length}
          onClear={clear}
          actions={[
            { label: "Đổi Dự án", onClick: () => setBulkProjectEdit({ ids, field: "groupId" }) },
            { label: "Đổi Loại hình", onClick: () => setBulkProjectEdit({ ids, field: "constructionTypeId" }) },
            { label: "Đổi Hạng mục", onClick: () => setBulkProjectEdit({ ids, field: "name" }) },
            { label: "Đổi mô tả hạng mục", onClick: () => setBulkProjectEdit({ ids, field: "description" }) },
            { label: "Đổi Khối/Hệ thống", onClick: () => setBulkProjectEdit({ ids, field: "blockSystem" }) },
            { label: "Đổi Bắt đầu", onClick: () => setBulkProjectEdit({ ids, field: "startDate" }) },
            { label: "Đổi Đóng gói", onClick: () => setBulkProjectEdit({ ids, field: "packagingDate" }) },
            { label: "Nhân bản", onClick: () => setBulkDuplicateIds(ids) },
            {
              label: "Xóa dòng đã chọn",
              tone: "danger",
              onClick: () => {
                const selected = generalProjects.filter((p) => ids.includes(p.id));
                const blocked = selected.filter((p) => p.taskCount > 0);
                setConfirm({
                  name: `${ids.length} hạng mục đã chọn`,
                  warnMsg: [
                    `Sẽ xóa ${ids.length} hạng mục đã chọn.`,
                    blocked.length ? `${blocked.length} hạng mục đang có công việc — các công việc đó sẽ mất liên kết dự án.` : "",
                  ].filter(Boolean).join(" "),
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
      infoBar={{ tone: "slate", text: "Dự án của nhóm Quản lý BIM & Thanh tra BIM — mỗi dòng là một Hạng mục." }}
      headerExtra={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            className="h-8 w-48 rounded-md border border-slate-200 bg-background pl-8 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Tìm dự án..."
            value={groupedFilter}
            onChange={(e) => setGroupedFilter(e.target.value)}
          />
        </div>
      }
      onEdit={(r) => {
        const p = r as unknown as ProjectRow;
        setRecord({ title: "Sửa hạng mục", fields: generalItemFields, initial: { groupId: p.groupId ?? "", constructionTypeId: p.constructionTypeId ?? "", name: p.name, blockSystem: p.blockSystem ?? "", scale: p.scale ?? "", startDate: p.startDate ?? "", packagingDate: p.packagingDate ?? "", description: p.description ?? "" },
          submit: (v) => saveCatalogProject({ id: p.id, groupId: v.groupId, name: v.name, blockSystem: v.blockSystem || null, constructionTypeId: v.constructionTypeId || null, scale: v.scale || null, startDate: v.startDate || null, packagingDate: v.packagingDate || null, description: v.description || null }) });
      }}
      onDuplicate={(r) => {
        const p = r as unknown as ProjectRow;
        setRecord({ title: "Nhân bản hạng mục", fields: generalItemFields, initial: { groupId: p.groupId ?? "", constructionTypeId: p.constructionTypeId ?? "", name: p.name, blockSystem: p.blockSystem ?? "", scale: p.scale ?? "", startDate: p.startDate ?? "", packagingDate: p.packagingDate ?? "", description: p.description ?? "" },
          submit: (v) => saveCatalogProject({ groupId: v.groupId, name: v.name, blockSystem: v.blockSystem || null, constructionTypeId: v.constructionTypeId || null, scale: v.scale || null, startDate: v.startDate || null, packagingDate: v.packagingDate || null, description: v.description || null }) });
      }}
      onDelete={(r) => {
        const p = r as unknown as ProjectRow;
        setConfirm({ name: p.name, warnMsg: p.taskCount > 0 ? `Hạng mục đang có ${p.taskCount} công việc — các công việc sẽ mất liên kết dự án.` : undefined, run: () => deleteProject(p.id) });
      }}
      columns={[
        { key: "group", label: "Dự án", thClass: "w-60", filter: "multi",
          text: (r) => pgById.get((r.groupId as string) ?? "")?.code ?? "",
          cell: (r) => { const g = pgById.get((r.groupId as string) ?? ""); return g ? <span className="font-mono text-xs text-slate-600" title={g.name}>{g.code}</span> : <Dash />; } },
        { key: "ct", label: "Loại hình", thClass: "w-52", filter: "multi",
          text: (r) => ctById.get((r.constructionTypeId as string) ?? "")?.name ?? "",
          cell: (r) => { const ct = ctById.get((r.constructionTypeId as string) ?? ""); return ct ? <span className="font-mono text-xs text-slate-600" title={ct.name}>{ct.code}</span> : <Dash />; } },
        { key: "name", label: "Hạng mục", thClass: "w-72", filter: "text", text: (r) => String(r.name ?? ""),
          cell: (r) => canEditCol("description") ? (
            <InlineEditProjectCell
              ids={[r.id]}
              field="description"
              value={(r.description as string | null) ?? ""}
              type="text"
              placeholder="Nhập mô tả hạng mục…"
              display={<span className="font-medium text-slate-800">{String(r.name)}</span>}
              className="font-medium text-slate-800"
            />
          ) : (
            <span className="font-medium text-slate-800" title={(r.description as string | null) || undefined}>{String(r.name)}</span>
          ) },
        { key: "blockSystem", label: "Khối/Hệ thống", thClass: "w-44", filter: "text", text: (r) => String(r.blockSystem ?? ""),
          cell: (r) => r.blockSystem ? <span className="text-slate-700">{String(r.blockSystem)}</span> : <Dash /> },
        { key: "startDate", label: "Bắt đầu", thClass: "w-32", filter: "text", text: (r) => fmtProjectDate(r.startDate as string | null),
          cell: (r) => canEditCol("startDate") ? (
            <InlineEditProjectCell
              ids={[r.id]}
              field="startDate"
              value={(r.startDate as string | null) ?? ""}
              type="date"
              display={r.startDate ? <span className="tabular-nums text-slate-600">{fmtProjectDate(r.startDate as string)}</span> : <Dash />}
            />
          ) : r.startDate ? <span className="tabular-nums text-slate-600">{fmtProjectDate(r.startDate as string)}</span> : <Dash /> },
        { key: "packagingDate", label: "Đóng gói", thClass: "w-32", filter: "text", text: (r) => fmtProjectDate(r.packagingDate as string | null),
          cell: (r) => canEditCol("packagingDate") ? (
            <InlineEditProjectCell
              ids={[r.id]}
              field="packagingDate"
              value={(r.packagingDate as string | null) ?? ""}
              type="date"
              display={r.packagingDate ? <span className="tabular-nums text-slate-600">{fmtProjectDate(r.packagingDate as string)}</span> : <Dash />}
            />
          ) : r.packagingDate ? <span className="tabular-nums text-slate-600">{fmtProjectDate(r.packagingDate as string)}</span> : <Dash /> },
        { key: "scale", label: "Quy mô (m² sàn)", thClass: "w-44", align: "right", filter: "text", text: (r) => String(r.scale ?? ""),
          cell: (r) => canEditCol("scale") ? (
            <InlineEditProjectCell
              ids={[r.id]}
              field="scale"
              value={(r.scale as string | null) ?? ""}
              type="text"
              placeholder="vd 12.000 m²"
              display={r.scale ? <span className="font-medium tabular-nums text-slate-700">{String(r.scale)}</span> : <Dash />}
            />
          ) : r.scale ? <span className="font-medium tabular-nums text-slate-700">{String(r.scale)}</span> : <Dash /> },
      ]}
    />}
    </>
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
        addLabel="Thêm dự án"
        minWidth={720}
        readOnly={readOnly}
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
        onBatchReorder={readOnly ? undefined : (ids) => reorder("catalogItem", ids)}
        headerExtra={
          !readOnly ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setManageBimtoolsL2(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <SlidersHorizontal className="size-4 text-slate-400" /> Quản lý loại hình
                <span className="rounded-full bg-slate-100 px-1.5 text-xs">{ptLevel2.length}</span>
              </button>
            </div>
          ) : null
        }
        onAdd={() => {
          if (ptLevel2.length === 0) {
            toast.error('Chưa có Loại hình nào — hãy tạo ở "Quản lý loại hình" trước.');
            return;
          }
          setRecord({
            title: "Thêm dự án",
            fields: [
              { key: "code", label: "Mã dự án", required: true, span: 2, autoFocus: true },
              { key: "name", label: "Tên dự án", required: true, span: 3 },
            ],
            initial: { code: "", name: "" },
            existingCodes: projectGroups.map((g) => g.code),
            submit: async (v) => {
              const res = await createProjectGroupReturnId({ code: v.code, name: v.name, workGroupId: ptWorkGroupId ?? null });
              // Tạo xong → mở luôn modal thêm Loại hình/Hạng mục cho dự án BIM Tools vừa tạo.
              if (res.ok && res.data) {
                setAddBimtoolsItemsCtx({ id: res.data.id, code: v.code.trim().toUpperCase(), name: v.name.trim() });
              }
              return res;
            },
          });
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
              if (!pg) return <Dash />;
              return (
                <span className="group/pg inline-flex items-center gap-1">
                  <span className="font-mono text-xs text-slate-600" title={pg.name}>{pg.code}</span>
                  <button
                    type="button"
                    title="Sửa dự án"
                    onClick={() =>
                      setRecord({
                        title: "Sửa dự án",
                        fields: [
                          { key: "code", label: "Mã dự án", required: true, span: 2, autoFocus: true },
                          { key: "name", label: "Tên dự án", required: true, span: 3 },
                        ],
                        initial: { code: pg.code, name: pg.name },
                        existingCodes: projectGroups.filter((x) => x.id !== pg.id).map((x) => x.code),
                        submit: (v) => saveProjectGroup({ id: pg.id, code: v.code, name: v.name }),
                      })
                    }
                    className="grid size-4 shrink-0 place-items-center rounded text-slate-300 opacity-0 transition group-hover/pg:opacity-100 hover:bg-slate-200 hover:text-slate-700"
                  >
                    <Pencil className="size-2.5" />
                  </button>
                  <button
                    type="button"
                    title="Xóa dự án"
                    onClick={() =>
                      setConfirm({
                        name: `${pg.code} — ${pg.name}`,
                        blockMsg: pg.itemCount > 0 ? `Dự án này có ${pg.itemCount} hạng mục. Xóa hạng mục trước khi xóa dự án.` : undefined,
                        run: () => deleteProjectGroup(pg.id),
                      })
                    }
                    className="grid size-4 shrink-0 place-items-center rounded text-slate-300 opacity-0 transition group-hover/pg:opacity-100 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </span>
              );
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
      readOnly={readOnly}
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
        readOnly={readOnly}
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
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Khai báo thông tin</h1>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  <Lock className="size-3" /> Admin — toàn quyền
                </span>
              ) : editableColumns.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                  <Pencil className="size-3" /> Chỉ xem — sửa được {editableColumns.length} cột ở tab Dự án
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  <Lock className="size-3" /> Chỉ xem
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Danh mục nền (master data) — nguồn dữ liệu dùng chung cho Giao việc, Công việc và Báo cáo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowColumnPermissions(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <ShieldCheck className="size-4 text-slate-400" /> Phân quyền cột
              </button>
            ) : null}
            <span className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 sm:inline-flex">
              <Database className="size-3.5" /> 8 danh mục · 8 tab
            </span>
          </div>
        </div>

        {/* Tab bar — sticky bên dưới app header */}
        <div className="sticky top-14 z-30 -mx-4 border-b border-slate-200 bg-background px-4 lg:-mx-6 lg:px-6">
        <div className="-mb-px mt-1 flex gap-0.5 overflow-x-auto">
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
        </div>{/* /sticky tab bar */}
      </div>

      {/* Panel nội dung */}
      <div className="pt-4">
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
          {tab === "departments"
            ? simpleView({
                rows: departments,
                title: "Bộ phận",
                addLabel: "Thêm bộ phận",
                reorderModel: "department",
                infoBar: {
                  tone: "slate",
                  text: "Dùng để nhóm nhân sự theo bộ phận trong tab Báo cáo (khác với Bộ môn).",
                },
                save: saveDepartment,
                del: deleteDepartment,
                usageMsg: "Bộ phận đang được dùng",
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

      {/* Modal thêm nhiều hạng mục BIM Tools cho dự án vừa tạo */}
      {addBimtoolsItemsCtx ? (
        <AddMultipleBimtoolsModal
          workGroupId={ptWorkGroupId ?? ""}
          level2Items={ptLevel2}
          group={addBimtoolsItemsCtx}
          onClose={() => setAddBimtoolsItemsCtx(null)}
          onSubmit={async (parentId, values, projectGroupId) => {
            const res = await batchSaveCatalogItems(ptWorkGroupId ?? "", 3, parentId, values, projectGroupId || null);
            if (res.ok) {
              toast.success(`Đã thêm ${values.length} hạng mục`);
              router.refresh();
              setAddBimtoolsItemsCtx(null);
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

      {/* Phân quyền cột (chỉ ADMIN) */}
      {showColumnPermissions ? (
        <CatalogColumnPermissionsModal
          users={users}
          departments={departments}
          onClose={() => setShowColumnPermissions(false)}
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
          projects={generalProjects}
          isAdmin={isAdmin}
          editableColumns={editableColumns}
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

      {/* Bulk duplicate Tab Dự án */}
      {bulkDuplicateIds ? (
        <BulkDuplicateProjectsModal
          ids={bulkDuplicateIds}
          onClose={() => setBulkDuplicateIds(null)}
          onSubmit={async (blockSystem) => {
            const res = await batchDuplicateCatalogProjects(bulkDuplicateIds, blockSystem);
            if (res.ok) {
              toast.success(`Đã nhân bản ${bulkDuplicateIds.length} hạng mục`);
              router.refresh();
              setBulkDuplicateIds(null);
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

      {/* Filter popover cho grouped view */}
      {groupedOpenFilter && (
        <FilterPopover
          rect={groupedOpenFilter.rect}
          col={{ key: groupedOpenFilter.key, label: groupedOpenFilter.label, filter: "multi", text: () => "", cell: () => null }}
          value={groupedColFilters[groupedOpenFilter.key]}
          options={groupedOpenFilter.opts}
          onChange={(v) => setGroupedColFilters(s => ({ ...s, [groupedOpenFilter.key]: v as string[] }))}
          onClear={() => setGroupedColFilters(s => { const n = { ...s }; delete n[groupedOpenFilter.key]; return n; })}
          onClose={() => setGroupedOpenFilter(null)}
        />
      )}

      {/* Modal thêm nhiều loại hình vào 1 dự án */}
      {addLoaiHinhCtx ? (
        <AddLoaiHinhToGroupModal
          group={addLoaiHinhCtx}
          constructionTypes={constructionTypes}
          onClose={() => setAddLoaiHinhCtx(null)}
          onSuccess={() => { setAddLoaiHinhCtx(null); router.refresh(); }}
        />
      ) : null}

      {/* Modal thêm nhiều hạng mục / khối vào loại hình hoặc hạng mục */}
      {addHangMucCtx ? (
        <AddHangMucToCtModal
          {...addHangMucCtx}
          onClose={() => setAddHangMucCtx(null)}
          onSuccess={() => { setAddHangMucCtx(null); router.refresh(); }}
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
  readOnly,
}: {
  title: string;
  rows: Row[];
  columns: Col[];
  addLabel?: string;
  onAdd?: () => void;
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
  /** Chỉ xem — ẩn Thêm/Sửa/Xóa/Nhân bản/kéo sắp xếp/checkbox chọn hàng loạt (dùng cho member không có quyền). */
  readOnly?: boolean;
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

  const canDrag = !readOnly && !!onBatchReorder && !sort && activeCols.length === 0;
  const showReorderCol = !readOnly && !!onBatchReorder;
  const showSelectCol = !readOnly && !!selectable;

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

  const colCount = columns.length + (showReorderCol ? 1 : 0) + (showSelectCol ? 1 : 0) + (readOnly ? 0 : 1);
  const openCol = openFilter ? colByKey.get(openFilter.key) : null;
  const stickyHeadClass = "sticky top-0 z-20 bg-slate-50 shadow-[0_1px_0_0_theme(colors.slate.200)]";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm" style={{ maxHeight: "calc(100vh - 240px)", minHeight: 320 }}>
      {/* Fixed header block (outside scroll area) */}
      <div className="shrink-0 rounded-t-xl bg-card pb-2 shadow-[0_1px_0_0_theme(colors.slate.100)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {filtered.length}
          {activeCols.length ? <span className="text-slate-400"> / {rows.length}</span> : null}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {headerExtra}
          {!readOnly && addLabel && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
            >
              <Plus className="size-4" /> {addLabel}
            </button>
          )}
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
      {showSelectCol && bulkBar && selArr.length > 0 ? (
        <div className="bg-card px-4 pt-3">{bulkBar(selArr, clearSel)}</div>
      ) : null}
      </div>{/* /sticky header block */}

      {/* Bảng */}
      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1.5">
        <table className="w-full border-collapse text-sm" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-400">
              {showReorderCol ? <th className={cn("w-8 px-2 py-2", stickyHeadClass)} /> : null}
              {showSelectCol ? (
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
              {!readOnly ? <th className={cn("w-24 px-3 py-2 text-right", stickyHeadClass)}>Thao tác</th> : null}
            </tr>
          </thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {filtered.map((r) => (
                  <SortableTableRow
                    key={r.id} id={r.id} showHandle={showReorderCol} canDrag={canDrag}
                    checked={showSelectCol ? selectedIds.has(r.id) : undefined}
                    onCheck={showSelectCol ? (shiftKey) => toggleRow(r.id, shiftKey) : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2.5", c.align === "right" && "text-right")}>
                        {c.cell(r)}
                      </td>
                    ))}
                    {!readOnly ? (
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
                    ) : null}
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
  type?: "text" | "number" | "select" | "combobox" | "date" | "textarea";
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
              ) : f.type === "date" ? (
                <DateInput
                  className={cn(inputCls, "tabular-nums")}
                  value={values[f.key] ?? ""}
                  autoFocus={f.autoFocus}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : f.type === "textarea" ? (
                <textarea
                  className={cn(inputCls, "h-20 resize-none py-2")}
                  value={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  autoFocus={f.autoFocus}
                  onChange={(e) => set(f.key, e.target.value)}
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
  readOnly,
}: {
  workGroups: WorkGroupRow[];
  works: WorkRow[];
  onAdd: (workGroupId: string, value: string) => void;
  onBulkEdit: (ids: string[], field: "workGroupId" | "value") => void;
  onEdit: (r: WorkRow) => void;
  onDelete: (r: WorkRow) => void;
  onBatchReorder?: (ids: string[]) => Promise<void>;
  readOnly?: boolean;
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
        {!readOnly && selectedArr.length > 0 ? (
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
              <div className={cn("mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200", (readOnly || selectedArr.length === 0) && "mt-0")}>
                {!readOnly ? (
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
                ) : null}
                {displayItems.map((w) => (
                  <SortableWorkItem
                    key={w.id}
                    item={w}
                    checked={selectedIds.has(w.id)}
                    onCheck={(shiftKey) => toggleItem(w.id, shiftKey)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    showHandle={!readOnly && !!onBatchReorder}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Form thêm mới inline */}
        {!readOnly ? (
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
        ) : null}
      </div>
    </div>
  );
}

// ---------- Sortable list item cho WorksPanel ----------
function SortableWorkItem({
  item, checked, onCheck, onEdit, onDelete, showHandle, readOnly,
}: {
  item: WorkRow; checked: boolean; onCheck: (shiftKey: boolean) => void; onEdit: (r: WorkRow) => void; onDelete: (r: WorkRow) => void; showHandle: boolean; readOnly?: boolean;
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
      {!readOnly ? (
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
      ) : null}
      <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{item.value}</span>
      {!readOnly ? (
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
      ) : null}
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
  group,
  onClose,
  onSubmit,
}: {
  workGroupId: string;
  level2Items: { id: string; value: string }[];
  group: { id: string; code: string; name: string };
  onClose: () => void;
  onSubmit: (parentId: string, values: string[], projectGroupId: string) => Promise<void>;
}) {
  const [parentId, setParentId] = React.useState(level2Items[0]?.id ?? "");
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
    await onSubmit(parentId, valid, group.id);
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title={`Thêm loại hình — ${group.code} · ${group.name}`} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
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
    <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 shadow-lg">
      <Check className="size-4 shrink-0 text-emerald-500" />
      <span className="font-medium">{count} dòng đã chọn</span>
      <span className="text-slate-300 dark:text-slate-600">·</span>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium",
            a.tone === "danger"
              ? "border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900"
              : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800",
          )}
        >
          {a.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto grid size-6 place-items-center rounded text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
        title="Bỏ chọn"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ===================================================================
//  CatalogColumnPermissionsModal — cấp/thu quyền sửa cột "vận hành" của
//  Hạng mục (Bắt đầu/Đóng gói/Quy mô/Mô tả) cho user hoặc cả Bộ phận.
// ===================================================================
type ColumnGrant = {
  id: string;
  column: string;
  userId: string | null;
  userName: string | null;
  departmentId: string | null;
  departmentName: string | null;
};

function CatalogColumnPermissionsModal({
  users,
  departments,
  onClose,
}: {
  users: { id: string; fullName: string; departmentId: string | null }[];
  departments: SimpleRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [grants, setGrants] = React.useState<ColumnGrant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [column, setColumn] = React.useState<CatalogPermissionColumn>(CATALOG_PERMISSION_COLUMNS[0]);
  const [targetType, setTargetType] = React.useState<"user" | "department">("user");
  const [targetId, setTargetId] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await listCatalogColumnPermissions();
    if (res.ok && res.data) setGrants(res.data);
    setLoading(false);
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) { setErr(targetType === "user" ? "Chọn người dùng" : "Chọn bộ phận"); return; }
    setErr(null);
    setPending(true);
    const res = await grantCatalogColumnPermission({
      column,
      userId: targetType === "user" ? targetId : null,
      departmentId: targetType === "department" ? targetId : null,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Đã cấp quyền");
      setTargetId("");
      await load();
      router.refresh();
    } else {
      setErr(res.error);
    }
  }

  async function handleRevoke(id: string) {
    const res = await revokeCatalogColumnPermission(id);
    if (res.ok) {
      toast.success("Đã thu quyền");
      await load();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  return (
    <Modal open onClose={onClose} title="Phân quyền cột" className="max-w-2xl">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Cấp quyền sửa riêng từng cột "vận hành" của Hạng mục (không đụng cấu trúc Dự án/Loại hình/Hạng mục/Khối)
          cho user đích danh hoặc cả một Bộ phận. Người được cấp sẽ bấm trực tiếp vào ô ở tab Dự án để sửa.
        </p>

        <form onSubmit={handleGrant} className="grid grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Cột</label>
            <Select value={column} onChange={(e) => setColumn(e.target.value as CatalogPermissionColumn)} className="h-9">
              {CATALOG_PERMISSION_COLUMNS.map((c) => (
                <option key={c} value={c}>{CATALOG_PERMISSION_COLUMN_LABEL[c]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Cấp cho</label>
            <Select value={targetType} onChange={(e) => { setTargetType(e.target.value as "user" | "department"); setTargetId(""); }} className="h-9">
              <option value="user">Người dùng</option>
              <option value="department">Bộ phận</option>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-600">{targetType === "user" ? "Người dùng" : "Bộ phận"}</label>
            <div className="flex gap-1.5">
              <Select value={targetId} onChange={(e) => { setTargetId(e.target.value); setErr(null); }} className="h-9 flex-1">
                <option value="">— Chọn —</option>
                {(targetType === "user" ? users : departments).map((o) => (
                  <option key={o.id} value={o.id}>{"fullName" in o ? o.fullName : o.name}</option>
                ))}
              </Select>
              <button type="submit" disabled={pending} className={cn(inputCls, "w-auto shrink-0 bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50")}>
                {pending ? "Đang cấp…" : "Cấp quyền"}
              </button>
            </div>
          </div>
          {err ? <p className="col-span-4 text-xs text-red-600">{err}</p> : null}
        </form>

        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
          {loading ? (
            <p className="p-4 text-center text-sm text-slate-400">Đang tải…</p>
          ) : grants.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">Chưa cấp quyền cột nào.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cột</th>
                  <th className="px-3 py-2">Cấp cho</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grants.map((g) => (
                  <tr key={g.id}>
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {CATALOG_PERMISSION_COLUMN_LABEL[g.column as CatalogPermissionColumn] ?? g.column}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {g.userName ? (
                        <span>{g.userName}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Users className="size-3.5" /> {g.departmentName} <span className="text-[11px] text-slate-400">(cả bộ phận)</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" title="Thu quyền" onClick={() => handleRevoke(g.id)}
                        className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </Modal>
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
//  BulkDuplicateProjectsModal — Nhân bản hạng mục với Khối/Hệ thống mới
// ===================================================================
function BulkDuplicateProjectsModal({
  ids,
  onClose,
  onSubmit,
}: {
  ids: string[];
  onClose: () => void;
  onSubmit: (blockSystem: string | null) => Promise<void>;
}) {
  const [blockSystem, setBlockSystem] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    await onSubmit(blockSystem.trim() || null);
    setPending(false);
  }

  return (
    <Modal open onClose={onClose} title={`Nhân bản ${ids.length} hạng mục`} className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Sẽ tạo <strong>{ids.length} bản sao</strong> mới — giữ nguyên Dự án, Loại hình, Hạng mục, Ngày, Quy mô — chỉ thay Khối/Hệ thống.
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">
            Khối/Hệ thống mới <span className="text-slate-400">(để trống nếu không có)</span>
          </label>
          <input
            autoFocus
            className={inputCls}
            placeholder="VD: GIR, HA, I9A…"
            value={blockSystem}
            onChange={(e) => { setBlockSystem(e.target.value); setErr(null); }}
          />
        </div>
        {err ? (
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="size-3.5" /> {err}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={pending}>
            <Check className="size-4" /> {pending ? "Đang nhân bản…" : `Nhân bản ${ids.length} hạng mục`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===================================================================
//  InlineEditProjectCell — sửa 1 cột "vận hành" (Bắt đầu/Đóng gói/Quy mô/Mô tả)
//  trực tiếp trên dòng (không mở modal). Bấm vào ô → hiện input tại chỗ,
//  Enter/rời ô để lưu, Esc để hủy.
// ===================================================================
function InlineEditProjectCell({
  ids,
  field,
  value,
  type,
  placeholder,
  display,
  className,
}: {
  ids: string[];
  field: "startDate" | "packagingDate" | "scale" | "description";
  value: string;
  type: "text" | "date";
  placeholder?: string;
  /** Nội dung hiển thị khi KHÔNG sửa (mặc định = value, hoặc "—" nếu rỗng) */
  display?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(value);
  const [pending, setPending] = React.useState(false);
  const savedRef = React.useRef(false);

  async function save() {
    if (savedRef.current) return;
    savedRef.current = true;
    if (val === value) { setEditing(false); return; }
    setPending(true);
    const patch: ProjectsPatch = { [field]: val.trim() || null };
    const res = await batchUpdateCatalogProjects(ids, patch);
    setPending(false);
    setEditing(false);
    if (res.ok) router.refresh();
    else toast.error(res.error);
  }

  if (editing) {
    const inputCls = cn(
      "h-7 w-full rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-800 outline-none focus:border-slate-500",
      pending && "opacity-50",
    );
    const commonProps = {
      autoFocus: true,
      disabled: pending,
      onBlur: () => void save(),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); void save(); }
        else if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
      },
    };
    return type === "date" ? (
      <DateInput className={cn(inputCls, "tabular-nums")} value={val} onChange={(e) => setVal(e.target.value)} {...commonProps} />
    ) : (
      <input className={inputCls} value={val} placeholder={placeholder} onChange={(e) => setVal(e.target.value)} {...commonProps} />
    );
  }

  return (
    <button
      type="button"
      title={value || placeholder}
      onClick={(e) => { e.stopPropagation(); savedRef.current = false; setVal(value); setEditing(true); }}
      className={cn("text-left hover:underline decoration-dotted underline-offset-2", className)}
    >
      {display ?? (value || <Dash />)}
    </button>
  );
}

// ===================================================================
//  BulkEditProjectsModal — Tab 2 Dự án · Hạng mục (sửa hàng loạt nhiều dòng)
// ===================================================================
type ProjectsPatch = { groupId?: string; constructionTypeId?: string | null; name?: string; blockSystem?: string | null; startDate?: string | null; packagingDate?: string | null; scale?: string | null; description?: string | null };

function BulkEditProjectsModal({
  ids,
  field,
  projectGroups,
  constructionTypes,
  projects,
  isAdmin,
  editableColumns,
  onClose,
  onSubmit,
}: {
  ids: string[];
  field: "groupId" | "constructionTypeId" | "name" | "blockSystem" | "startDate" | "packagingDate" | "scale" | "description";
  projectGroups: ProjectGroupRow[];
  constructionTypes: SimpleRow[];
  projects: ProjectRow[];
  /** ADMIN thấy đủ mọi tab; member chỉ thấy tab của các cột mình được cấp quyền. */
  isAdmin: boolean;
  editableColumns: CatalogPermissionColumn[];
  onClose: () => void;
  onSubmit: (patch: ProjectsPatch) => Promise<void>;
}) {
  const router = useRouter();
  const [activeField, setActiveField] = React.useState(field);
  const [groupId, setGroupId] = React.useState(projectGroups[0]?.id ?? "");
  const [ctCode, setCtCode] = React.useState("");
  // Nạp sẵn giá trị hiện tại của dòng đầu tiên (click sửa 1 ô, hoặc nhóm ô đồng bộ cùng giá trị).
  const singleProject = projects.find((p) => p.id === ids[0]) ?? null;
  const [name, setName] = React.useState(singleProject?.name ?? "");
  const [blockSystem, setBlockSystem] = React.useState(singleProject?.blockSystem ?? "");
  const [startDate, setStartDate] = React.useState(singleProject?.startDate ?? "");
  const [packagingDate, setPackagingDate] = React.useState(singleProject?.packagingDate ?? "");
  const [scale, setScale] = React.useState(singleProject?.scale ?? "");
  const [description, setDescription] = React.useState(singleProject?.description ?? "");
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // "Tạo mới dự án" inline
  const [creatingGroup, setCreatingGroup] = React.useState(false);
  const [newGroupCode, setNewGroupCode] = React.useState("");
  const [newGroupName, setNewGroupName] = React.useState("");
  const [creatingGroupPending, setCreatingGroupPending] = React.useState(false);

  // Sửa tên Dự án đang chọn (rename ProjectGroup)
  const [editingGroupName, setEditingGroupName] = React.useState(false);
  const [editGroupCode, setEditGroupCode] = React.useState("");
  const [editGroupName, setEditGroupName] = React.useState("");
  const [editingGroupPending, setEditingGroupPending] = React.useState(false);

  const nameOpts = React.useMemo(() => [...new Set(projects.map((p) => p.name).filter(Boolean))].sort(), [projects]);
  const blockSystemOpts = React.useMemo(
    () => [...new Set(projects.map((p) => p.blockSystem).filter(Boolean) as string[])].sort(),
    [projects],
  );
  const ctCodeOpts = React.useMemo(() => constructionTypes.map((c) => c.code), [constructionTypes]);

  const inputCls =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

  const ALL_FIELDS = [
    { key: "groupId" as const, label: "Dự án", structural: true },
    { key: "constructionTypeId" as const, label: "Loại hình", structural: true },
    { key: "name" as const, label: "Hạng mục", structural: true },
    { key: "description" as const, label: "Mô tả", structural: false },
    { key: "blockSystem" as const, label: "Khối/Hệ thống", structural: true },
    { key: "startDate" as const, label: "Bắt đầu", structural: false },
    { key: "packagingDate" as const, label: "Đóng gói", structural: false },
    { key: "scale" as const, label: "Quy mô", structural: false },
  ];
  // Member: chỉ thấy tab của cột mình được cấp quyền (không có cột cấu trúc).
  const FIELDS = isAdmin ? ALL_FIELDS : ALL_FIELDS.filter((f) => !f.structural && editableColumns.includes(f.key as CatalogPermissionColumn));

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

  async function handleSaveGroupName() {
    const c = editGroupCode.trim().toUpperCase();
    const n = editGroupName.trim();
    if (!c || !n) { setErr("Nhập đủ mã và tên dự án"); return; }
    setErr(null);
    setEditingGroupPending(true);
    const res = await saveProjectGroup({ id: groupId, code: c, name: n });
    setEditingGroupPending(false);
    if (res.ok) {
      toast.success("Đã đổi tên dự án");
      router.refresh();
      setEditingGroupName(false);
    } else {
      setErr(res.error);
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
      if (!ctCode.trim()) {
        patch.constructionTypeId = null;
      } else {
        const res = await upsertConstructionTypeReturnId(ctCode.trim(), ctCode.trim());
        if (!res.ok || !res.data) { setErr(res.ok ? "Lỗi không xác định" : res.error); return; }
        patch.constructionTypeId = res.data.id;
      }
    } else if (activeField === "name") {
      if (!name.trim()) { setErr("Nhập tên hạng mục"); return; }
      patch.name = name.trim();
    } else if (activeField === "blockSystem") {
      patch.blockSystem = blockSystem.trim() || null;
    } else if (activeField === "startDate") {
      patch.startDate = startDate || null;
    } else if (activeField === "packagingDate") {
      patch.packagingDate = packagingDate || null;
    } else if (activeField === "scale") {
      patch.scale = scale.trim() || null;
    } else {
      patch.description = description.trim() || null;
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
            {!creatingGroup && !editingGroupName ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Dự án <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-1.5">
                    <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 flex-1">
                      {projectGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      title="Sửa tên dự án đang chọn"
                      disabled={!groupId}
                      onClick={() => {
                        const g = projectGroups.find((pg) => pg.id === groupId);
                        setEditGroupCode(g?.code ?? "");
                        setEditGroupName(g?.name ?? "");
                        setEditingGroupName(true);
                      }}
                      className="grid size-9 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Pencil className="size-4" />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreatingGroup(true)}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                >
                  <Plus className="size-3.5" /> Tạo dự án mới
                </button>
              </>
            ) : editingGroupName ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Sửa tên dự án</p>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    className={cn(inputCls, "w-28 shrink-0 font-mono uppercase")}
                    placeholder="Mã"
                    value={editGroupCode}
                    onChange={(e) => { setEditGroupCode(e.target.value.toUpperCase()); setErr(null); }}
                  />
                  <input
                    className={cn(inputCls, "flex-1")}
                    placeholder="Tên dự án…"
                    value={editGroupName}
                    onChange={(e) => { setEditGroupName(e.target.value); setErr(null); }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={editingGroupPending}
                    onClick={handleSaveGroupName}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Check className="size-3.5" /> {editingGroupPending ? "Đang lưu…" : "Lưu tên"}
                  </button>
                  <button type="button" onClick={() => { setEditingGroupName(false); setErr(null); }}
                    className="text-xs text-slate-400 hover:text-slate-600">Hủy</button>
                </div>
              </div>
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
            <SearchableCombobox
              creatable
              placeholder="— Không (xóa loại hình) —"
              value={ctCode}
              options={ctCodeOpts}
              className="h-9"
              onChange={(v) => { setCtCode(v); setErr(null); }}
            />
            <p className="text-[11px] text-slate-400">Gõ mã có sẵn hoặc nhập mã mới để tạo loại hình.</p>
          </div>
        )}

        {activeField === "name" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">
              Tên hạng mục mới <span className="text-red-500">*</span>
            </label>
            <SearchableCombobox
              creatable
              placeholder="Chọn hoặc nhập tên mới…"
              value={name}
              options={nameOpts}
              className="h-9"
              onChange={(v) => { setName(v); setErr(null); }}
            />
            <p className="text-[11px] text-amber-500">Sẽ đổi hạng mục cho tất cả {ids.length} dòng đã chọn thành tên này.</p>
          </div>
        )}

        {activeField === "description" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Mô tả</label>
            <textarea
              autoFocus
              className={cn(inputCls, "h-24 resize-none py-2")}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setErr(null); }}
              placeholder="Ghi chú / mô tả hạng mục…"
            />
            <p className="text-[11px] text-slate-400">Hiện khi hover vào tên hạng mục ở /manage và /tasks.</p>
            <p className="text-[11px] text-amber-500">Sẽ đổi mô tả cho tất cả {ids.length} dòng đã chọn. Để trống để xóa mô tả.</p>
          </div>
        )}

        {activeField === "blockSystem" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Khối/Hệ thống</label>
            <SearchableCombobox
              creatable
              placeholder="Chọn hoặc nhập Khối/Hệ thống, để trống để xóa"
              value={blockSystem}
              options={blockSystemOpts}
              className="h-9"
              onChange={(v) => { setBlockSystem(v); setErr(null); }}
            />
            <p className="text-[11px] text-amber-500">Sẽ đổi Khối/Hệ thống cho tất cả {ids.length} dòng đã chọn.</p>
          </div>
        )}

        {activeField === "startDate" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Ngày bắt đầu</label>
            <DateInput autoFocus className={inputCls} value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setErr(null); }} />
            <p className="text-[11px] text-amber-500">Sẽ đặt ngày bắt đầu cho {ids.length} hạng mục đã chọn. Để trống để xóa ngày.</p>
          </div>
        )}

        {activeField === "packagingDate" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Ngày đóng gói / bàn giao</label>
            <DateInput autoFocus className={inputCls} value={packagingDate}
              onChange={(e) => { setPackagingDate(e.target.value); setErr(null); }} />
            <p className="text-[11px] text-amber-500">Sẽ đặt ngày đóng gói cho {ids.length} hạng mục đã chọn. Để trống để xóa ngày.</p>
          </div>
        )}

        {activeField === "scale" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Quy mô (m² sàn)</label>
            <input
              autoFocus
              className={inputCls}
              value={scale}
              placeholder="vd 12.000 m²"
              onChange={(e) => { setScale(e.target.value); setErr(null); }}
            />
            <p className="text-[11px] text-amber-500">Sẽ đổi quy mô cho tất cả {ids.length} dòng đã chọn. Để trống để xóa.</p>
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

// ---- Modal thêm nhiều hạng mục (+ khối) vào 1 loại hình hoặc hạng mục ----
type HangMucRow = { id: number; hangMuc: string; blockSystem: string };
let _hangMucRowId = 0;
function makeHangMucRow(hangMuc = ""): HangMucRow { return { id: ++_hangMucRowId, hangMuc, blockSystem: "" }; }

function AddHangMucToCtModal({
  title,
  defaultHangMuc,
  groupId,
  constructionTypeId,
  hmDateSource,
  onClose,
  onSuccess,
}: {
  title: string;
  defaultHangMuc?: string;
  groupId: string;
  constructionTypeId: string | null;
  hmDateSource?: { startDate?: Date | string | null; packagingDate?: Date | string | null };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rows, setRows] = React.useState<HangMucRow[]>([makeHangMucRow(defaultHangMuc ?? "")]);
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function setRow(id: number, patch: Partial<HangMucRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = rows.filter((r) => r.hangMuc.trim());
    if (valid.length === 0) { setErr("Nhập ít nhất 1 hạng mục"); return; }
    setPending(true);
    setErr(null);
    try {
      for (const r of valid) {
        const res = await saveCatalogProject({
          groupId,
          constructionTypeId,
          name: r.hangMuc.trim(),
          blockSystem: r.blockSystem.trim() || null,
          scale: null,
          startDate: hmDateSource?.startDate ? (hmDateSource.startDate instanceof Date ? hmDateSource.startDate.toISOString() : hmDateSource.startDate) : null,
          packagingDate: hmDateSource?.packagingDate ? (hmDateSource.packagingDate instanceof Date ? hmDateSource.packagingDate.toISOString() : hmDateSource.packagingDate) : null,
        });
        if (!res.ok) { setErr(res.error); setPending(false); return; }
      }
      onSuccess();
    } catch (e2) {
      setErr(String(e2));
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title} className="max-w-xl">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <p className="text-xs text-slate-500">Mỗi dòng là 1 Hạng mục + Khối/HT (tùy chọn).</p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs text-slate-400">{i + 1}</span>
              <input
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Tên hạng mục *"
                value={r.hangMuc}
                autoFocus={i === 0}
                onChange={(e) => setRow(r.id, { hangMuc: e.target.value })}
              />
              <input
                className="h-9 w-32 shrink-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Khối/HT"
                value={r.blockSystem}
                onChange={(e) => setRow(r.id, { blockSystem: e.target.value })}
              />
              {rows.length > 1 && (
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                  className="grid size-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500">
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, makeHangMucRow(defaultHangMuc ?? "")])}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700">
          <Plus className="size-3" /> Thêm hạng mục
        </button>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">Hủy</button>
          <button type="submit" disabled={pending} className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
            {pending ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Modal thêm nhiều loại hình (+ hạng mục) vào 1 dự án ----
type LoaiHinhRow = { id: number; ctCode: string; hangMuc: string; blockSystem: string };
let _loaiHinhRowId = 0;
function makeRow(): LoaiHinhRow { return { id: ++_loaiHinhRowId, ctCode: "", hangMuc: "", blockSystem: "" }; }

function AddLoaiHinhToGroupModal({
  group,
  constructionTypes,
  onClose,
  onSuccess,
}: {
  group: ProjectGroupRow;
  constructionTypes: SimpleRow[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rows, setRows] = React.useState<LoaiHinhRow[]>([makeRow()]);
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const ctCodes = constructionTypes.map((c) => c.code);

  function setRow(id: number, patch: Partial<LoaiHinhRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = rows.filter((r) => r.ctCode.trim() || r.hangMuc.trim());
    if (valid.length === 0) { setErr("Nhập ít nhất 1 hạng mục"); return; }
    const missing = valid.find((r) => !r.hangMuc.trim());
    if (missing) { setErr("Tên hạng mục không được để trống"); return; }
    setPending(true);
    setErr(null);
    try {
      for (const r of valid) {
        let ctId: string | null = null;
        if (r.ctCode.trim()) {
          const res = await upsertConstructionTypeReturnId(r.ctCode.trim(), r.ctCode.trim());
          if (!res.ok) { setErr(res.error); setPending(false); return; }
          ctId = res.data!.id;
        }
        const res = await saveCatalogProject({ groupId: group.id, name: r.hangMuc.trim(), constructionTypeId: ctId, blockSystem: r.blockSystem.trim() || null, scale: null, startDate: null, packagingDate: null });
        if (!res.ok) { setErr(res.error); setPending(false); return; }
      }
      onSuccess();
    } catch (e2) {
      setErr(String(e2));
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Thêm loại hình — ${group.code} · ${group.name}`} className="max-w-2xl">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <p className="text-xs text-slate-500">Mỗi dòng là 1 Loại hình + Hạng mục. Chọn từ danh sách hoặc gõ mới — loại hình mới sẽ được thêm vào danh mục <em>Loại hình công trình</em>.</p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs text-slate-400">{i + 1}</span>
              <div className="w-44 shrink-0">
                <SearchableCombobox
                  creatable
                  placeholder="Loại hình..."
                  value={r.ctCode}
                  options={ctCodes}
                  onChange={(v) => setRow(r.id, { ctCode: v })}
                />
              </div>
              <input
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Tên hạng mục *"
                value={r.hangMuc}
                onChange={(e) => setRow(r.id, { hangMuc: e.target.value })}
              />
              <input
                className="h-9 w-32 shrink-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Khối/HT"
                value={r.blockSystem}
                onChange={(e) => setRow(r.id, { blockSystem: e.target.value })}
              />
              {rows.length > 1 && (
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                  className="grid size-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500">
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, makeRow()])}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700">
          <Plus className="size-3" /> Thêm loại hình
        </button>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">Hủy</button>
          <button type="submit" disabled={pending} className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
            {pending ? "Đang lưu..." : "Lưu"}
          </button>
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
