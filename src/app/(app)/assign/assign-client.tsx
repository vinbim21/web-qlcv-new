"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, ClipboardPaste, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { UserMultiSelect } from "@/components/user-multi-select";
import type { Catalog, Opt, UserOpt } from "@/components/task-form";

// Dự án kèm thông tin nhóm (ProjectGroup) và loại hình (ConstructionType) cho cascade 3 bước.
export type ProjectOpt = Opt & {
  code: string;
  l3: string;
  blockSystem: string;
  groupId: string;
  groupCode: string;
  groupName: string;
  groupWorkGroupId: string | null;
  constructionTypeId: string;
  constructionTypeCode: string;
};
import { PRIORITY_LABEL, PRIORITY_OPTIONS } from "@/lib/labels";
import { cn, removeVietnameseTones } from "@/lib/utils";
import { saveTasksBatch } from "@/server/actions/tasks";

type SortDir = "asc" | "desc";
const MIN_COL_W = 80;
const MAX_COL_W = 600;
const WIDTH_KEY = "assign-col-widths-v2";
const clampW = (n: number) => Math.min(MAX_COL_W, Math.max(MIN_COL_W, Math.round(n)));

// ----- Cấu hình cột theo từng bảng (suy ra từ prisma/import/extract.py) -----
type ColKey =
  | "id"
  | "project"
  | "level2"
  | "level3"
  | "blockSystem"
  | "discipline"
  | "level5"
  | "phase"
  | "priority"
  | "assignees"
  | "plannedStart"
  | "plannedEnd"
  | "approver";

const COLS_DEFAULT: ColKey[] = [
  "level2", "level3", "discipline", "level5",
  "priority", "assignees", "plannedStart", "plannedEnd",
];
// Bảng 3 (Quản lý BIM): thêm Dự án + Giai đoạn.
const COLS_B3: ColKey[] = [
  "project", "level2", "level3", "blockSystem", "discipline", "level5", "phase",
  "priority", "assignees", "plannedStart", "plannedEnd",
];
// Bảng 4 (Thanh tra BIM): như mặc định + cột Dự án trước Loại hình (không có Giai đoạn).
const COLS_B4: ColKey[] = [
  "project", "level2", "level3", "blockSystem", "discipline", "level5",
  "priority", "assignees", "plannedStart", "plannedEnd",
];
// Bảng 6 (Quản lý phần mềm): chỉ 1 người (giới hạn bằng max).
const COLS_B6: ColKey[] = [
  "level2", "level3", "discipline", "level5", "priority", "assignees", "plannedStart", "plannedEnd",
];

function columnsFor(code?: string, withApprover = false): ColKey[] {
  const base =
    code === "3" ? COLS_B3 : code === "4" ? COLS_B4 : code === "6" ? COLS_B6 : COLS_DEFAULT;
  if (!withApprover) return base;
  return [...base, "approver"];
}

const COL_LABEL: Record<ColKey, string> = {
  id: "Id",
  project: "Dự án",
  level2: "Loại hình",
  level3: "Hạng mục",
  blockSystem: "Khối/Hệ thống",
  discipline: "Bộ môn",
  level5: "Công việc",
  phase: "Giai đoạn",
  priority: "Ưu tiên",
  assignees: "Người thực hiện",
  plannedStart: "Bắt đầu",
  plannedEnd: "Kết thúc",
  approver: "Người duyệt",
};

// Bề rộng cố định từng cột (px). Dùng cho `table-layout: fixed` để mở/đóng ô
// (button ↔ input) không làm phình cột & xô lệch bảng.
const COL_PX: Record<ColKey, number> = {
  id: 76,
  project: 150,
  level2: 110,
  level3: 150,
  blockSystem: 150,
  discipline: 120,
  level5: 230,
  phase: 120,
  priority: 110,
  assignees: 230,
  plannedStart: 140,
  plannedEnd: 140,
  approver: 180,
};
const IDX_PX = 40; // cột #
const ACT_PX = 96; // cột hành động

// ----- Lưới -----
type GridRow = {
  key: number;
  projectId: string;
  projectGroupId: string; // UI only — dùng để cascade lọc Loại hình → Hạng mục
  level2: string;
  level3: string;
  blockSystem: string;
  level5: string;
  disciplineId: string;
  phaseId: string;
  priority: string;
  assigneeIds: string[];
  plannedStart: string;
  plannedEnd: string;
  approverId: string;
};

const EMPTY: Omit<GridRow, "key"> = {
  projectId: "",
  projectGroupId: "",
  level2: "",
  level3: "",
  blockSystem: "",
  level5: "",
  disciplineId: "",
  phaseId: "",
  priority: "TRUNG_BINH",
  assigneeIds: [],
  plannedStart: "",
  plannedEnd: "",
  approverId: "",
};

const INITIAL_ROWS = 5;
const CELL = "h-8 text-xs";
const NONE = "— Không —";

let keySeq = 0;
const makeRows = (n: number): GridRow[] =>
  Array.from({ length: n }, () => ({ key: keySeq++, ...EMPTY, assigneeIds: [] }));

// Dòng "có nội dung" khi có ít nhất một trong L2/L3/L5.
const hasContent = (r: GridRow) =>
  !!(r.level2.trim() || r.level3.trim() || r.level5.trim());

/** Ô tiêu đề: bấm nhãn để sắp xếp (none→tăng→giảm→none), kéo mép phải để giãn cột. */
function HeaderCell({
  label,
  width,
  sortDir,
  draggingRef,
  onToggleSort,
  onResize,
  onResizeEnd,
  onReset,
}: {
  label: string;
  width: number;
  sortDir: SortDir | null;
  draggingRef: React.MutableRefObject<boolean>;
  onToggleSort: () => void;
  onResize: (px: number) => void;
  onResizeEnd: () => void;
  onReset: () => void;
}) {
  const startRef = React.useRef<{ x: number; w: number } | null>(null);

  return (
    <th className="relative select-none" style={{ width }}>
      <button
        type="button"
        className="flex w-full items-center gap-1 text-left hover:text-foreground"
        onClick={() => {
          if (draggingRef.current) return;
          onToggleSort();
        }}
      >
        <span className="truncate">{label}</span>
        {sortDir === "asc" ? (
          <ChevronUp className="size-3.5 shrink-0" />
        ) : sortDir === "desc" ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-30" />
        )}
      </button>
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
        title="Kéo để giãn cột · nhấp đúp để đặt lại"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          startRef.current = { x: e.clientX, w: width };
          draggingRef.current = true;
        }}
        onPointerMove={(e) => {
          if (!startRef.current) return;
          onResize(clampW(startRef.current.w + (e.clientX - startRef.current.x)));
        }}
        onPointerUp={(e) => {
          if (!startRef.current) return;
          startRef.current = null;
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          onResizeEnd();
          // Bỏ cờ kéo sau khi vòng sự kiện click xử lý xong → tránh kích hoạt sort.
          setTimeout(() => {
            draggingRef.current = false;
          }, 0);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onReset();
        }}
      />
    </th>
  );
}

/**
 * Giao việc theo các tab Bảng 1-7 (mỗi tab = một Nhóm công việc). Mỗi tab hiện
 * đúng các cột của bảng đó (như Excel) và cho gõ trực tiếp + lưu hàng loạt.
 */
export function AssignClient({
  workGroups,
  disciplines,
  phases,
  projects,
  users,
  catalog,
  embedded = false,
  onSaved,
  withApprover = false,
  approvers = [],
  selfAssignUserId,
  saveAction = saveTasksBatch,
  defaultWorkGroupId,
  prefillRow,
}: {
  // workGroups kèm abbr (tiền tố Id) + lastSeq (gốc preview Id).
  workGroups: (Opt & { abbr?: string | null; lastSeq?: number })[];
  disciplines: Opt[];
  phases: Opt[];
  projects: ProjectOpt[];
  users: UserOpt[];
  catalog: Catalog;
  // embedded: dùng lại lưới trong modal (ẩn tiêu đề trang). onSaved: gọi sau khi lưu xong.
  embedded?: boolean;
  onSaved?: () => void;
  // withApprover: chế độ "Thêm công việc" — thêm cột Người duyệt (bắt buộc), bỏ cột ngày.
  withApprover?: boolean;
  approvers?: UserOpt[];
  // selfAssignUserId: chế độ "tự note" — ẩn cột Người thực hiện, tự gán user này làm người thực hiện.
  selfAssignUserId?: string;
  // saveAction: action lưu (mặc định saveTasksBatch; "tự note" dùng saveMyTasks).
  saveAction?: typeof saveTasksBatch;
  // defaultWorkGroupId: tab nhóm mặc định khi mở (dùng để pre-fill từ task đang chọn).
  defaultWorkGroupId?: string;
  // prefillRow: dữ liệu điền sẵn vào dòng đầu của tab defaultWorkGroupId.
  prefillRow?: Partial<Omit<GridRow, "key">>;
}) {
  const [activeWg, setActiveWg] = React.useState(
    (defaultWorkGroupId && workGroups.some((w) => w.id === defaultWorkGroupId)
      ? defaultWorkGroupId
      : workGroups[0]?.id) ?? "",
  );
  const [rowsByWg, setRowsByWg] = React.useState<Record<string, GridRow[]>>(() => {
    const init = Object.fromEntries(workGroups.map((w) => [w.id, makeRows(INITIAL_ROWS)]));
    if (prefillRow && defaultWorkGroupId && init[defaultWorkGroupId]) {
      const resolved: Partial<Omit<GridRow, "key">> = { ...prefillRow };
      if (prefillRow.projectId) {
        const proj = projects.find((p) => p.id === prefillRow.projectId);
        if (proj) {
          resolved.projectGroupId = proj.groupId;
          // Dùng constructionTypeCode và project name để cascade hiển thị đúng
          if (proj.constructionTypeCode) resolved.level2 = proj.constructionTypeCode;
          if (proj.name) resolved.level3 = proj.name;
          resolved.blockSystem = proj.blockSystem ?? "";
        }
      }
      init[defaultWorkGroupId][0] = { ...init[defaultWorkGroupId][0], ...resolved };
    }
    return init;
  });
  const [pending, setPending] = React.useState(false);
  // Bộ nhớ tạm 1 dòng để Sao chép → Dán (dùng chung mọi tab).
  const [clip, setClip] = React.useState<Omit<GridRow, "key"> | null>(null);

  // Bề rộng cột (kéo giãn) — dùng chung mọi tab, nhớ bằng localStorage.
  const [colWidths, setColWidths] = React.useState<Record<ColKey, number>>(() => ({ ...COL_PX }));
  const colWidthsRef = React.useRef(colWidths);
  React.useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);
  const draggingRef = React.useRef(false);
  // Sắp xếp — riêng từng tab.
  const [sortByWg, setSortByWg] = React.useState<Record<string, { col: ColKey; dir: SortDir }>>({});

  // Nạp width đã lưu sau khi mount (tránh lệch hydrate giữa server/client).
  React.useEffect(() => {
    function loadWidths() {
      try {
        const raw = window.localStorage.getItem(WIDTH_KEY);
        if (raw) setColWidths((w) => ({ ...w, ...(JSON.parse(raw) as Partial<Record<ColKey, number>>) }));
      } catch {
        /* bỏ qua localStorage lỗi */
      }
    }
    loadWidths();
  }, []);
  const persistWidths = (w: Record<ColKey, number>) => {
    try {
      window.localStorage.setItem(WIDTH_KEY, JSON.stringify(w));
    } catch {
      /* bỏ qua localStorage lỗi */
    }
  };

  const activeGroup = workGroups.find((w) => w.id === activeWg);
  // "Tự note" (selfAssignUserId): ẩn cột Người thực hiện (luôn tự gán mình).
  const cols = columnsFor(activeGroup?.code ?? undefined, withApprover).filter(
    (c) => !(selfAssignUserId && c === "assignees"),
  );
  const tableMinWidth = IDX_PX + ACT_PX + cols.reduce((s, c) => s + colWidths[c], 0);
  const rows = rowsByWg[activeWg] ?? [];
  const sort = sortByWg[activeWg] ?? null;

  // Id preview = "<abbr>-<seq 3 số>"; seq = lastSeq của nhóm + thứ tự TẠO dòng (theo key)
  // → cố định khi sắp xếp/đổi vị trí; chỉ là số dự kiến, Id chính thức cấp ở server lúc Lưu.
  const wgAbbr = activeGroup?.abbr || activeGroup?.code || "WG";
  const baseSeq = activeGroup?.lastSeq ?? 0;
  const idRank = new Map<number, number>();
  [...rows].sort((a, b) => a.key - b.key).forEach((r, i) => idRank.set(r.key, i + 1));
  const idOf = (r: GridRow) => `${wgAbbr}-${String(baseSeq + (idRank.get(r.key) ?? 0)).padStart(3, "0")}`;
  const validCount = rows.filter(hasContent).length;
  const sug = catalog[activeWg] ?? { l2: [], l3: [], l5: [] };

  const setRows = (fn: (rs: GridRow[]) => GridRow[]) =>
    setRowsByWg((prev) => ({ ...prev, [activeWg]: fn(prev[activeWg] ?? []) }));

  const updateRow = (key: number, patch: Partial<GridRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRows = (n: number) => setRows((rs) => [...rs, ...makeRows(n)]);
  const removeRow = (key: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const copyRow = (key: number) => {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    const { key: _k, ...rest } = r;
    void _k;
    setClip({ ...rest, assigneeIds: [...rest.assigneeIds] });
    toast.success("Đã sao chép dòng");
  };
  const pasteRow = (key: number) => {
    if (!clip) return;
    updateRow(key, { ...clip, assigneeIds: [...clip.assigneeIds] });
  };

  // ----- Kéo giãn cột -----
  const setColWidth = (col: ColKey, px: number) =>
    setColWidths((w) => ({ ...w, [col]: px }));
  const endResize = () => persistWidths(colWidthsRef.current);
  const resetColWidth = (col: ColKey) => {
    const nw = { ...colWidthsRef.current, [col]: COL_PX[col] };
    setColWidths(nw);
    persistWidths(nw);
  };

  // ----- Sắp xếp -----
  const nameOf = (list: Opt[], id: string) => list.find((o) => o.id === id)?.name ?? "";
  const userNameOf = (id: string) => users.find((u) => u.id === id)?.fullName ?? "";

  const cellEmpty = (r: GridRow, col: ColKey): boolean => {
    switch (col) {
      case "id": return false;
      case "project": return !r.projectId;
      case "discipline": return !r.disciplineId;
      case "phase": return !r.phaseId;
      case "level2": return !r.level2.trim();
      case "level3": return !r.level3.trim();
      case "blockSystem": return !r.blockSystem.trim();
      case "level5": return !r.level5.trim();
      case "assignees": return r.assigneeIds.length === 0;
      case "plannedStart": return !r.plannedStart;
      case "plannedEnd": return !r.plannedEnd;
      case "approver": return !r.approverId;
      case "priority": return false;
    }
  };

  const cellCmp = (a: GridRow, b: GridRow, col: ColKey): number => {
    const t = (s: string) => removeVietnameseTones(s);
    switch (col) {
      case "id": return a.key - b.key; // Id theo thứ tự tạo dòng
      case "level2": return t(a.level2).localeCompare(t(b.level2));
      case "level3": return t(a.level3).localeCompare(t(b.level3));
      case "blockSystem": return t(a.blockSystem).localeCompare(t(b.blockSystem));
      case "level5": return t(a.level5).localeCompare(t(b.level5));
      case "project": {
        const pa = projects.find((p) => p.id === a.projectId);
        const pb = projects.find((p) => p.id === b.projectId);
        return t(pa?.groupCode ?? "").localeCompare(t(pb?.groupCode ?? ""));
      }
      case "discipline": return t(nameOf(disciplines, a.disciplineId)).localeCompare(t(nameOf(disciplines, b.disciplineId)));
      case "phase": return t(nameOf(phases, a.phaseId)).localeCompare(t(nameOf(phases, b.phaseId)));
      case "priority": {
        const rank = (p: string) => {
          const i = (PRIORITY_OPTIONS as readonly string[]).indexOf(p);
          return i < 0 ? PRIORITY_OPTIONS.length : i;
        };
        return rank(a.priority) - rank(b.priority);
      }
      case "assignees": {
        const d = a.assigneeIds.length - b.assigneeIds.length;
        if (d !== 0) return d;
        return t(userNameOf(a.assigneeIds[0] ?? "")).localeCompare(t(userNameOf(b.assigneeIds[0] ?? "")));
      }
      case "plannedStart": return a.plannedStart.localeCompare(b.plannedStart); // yyyy-mm-dd so được theo từ điển
      case "plannedEnd": return a.plannedEnd.localeCompare(b.plannedEnd);
      case "approver": return t(userNameOf(a.approverId)).localeCompare(t(userNameOf(b.approverId)));
    }
  };

  const sortRows = (rs: GridRow[], col: ColKey, dir: SortDir): GridRow[] =>
    [...rs].sort((a, b) => {
      const ea = cellEmpty(a, col);
      const eb = cellEmpty(b, col);
      if (ea && eb) return 0;
      if (ea) return 1; // dòng rỗng luôn dồn xuống đáy
      if (eb) return -1;
      const c = cellCmp(a, b, col);
      return dir === "asc" ? c : -c;
    });

  const toggleSort = (col: ColKey) => {
    const cur = sortByWg[activeWg];
    const next: { col: ColKey; dir: SortDir } | null =
      !cur || cur.col !== col ? { col, dir: "asc" } : cur.dir === "asc" ? { col, dir: "desc" } : null;
    setSortByWg((prev) => {
      const cp = { ...prev };
      if (next) cp[activeWg] = next;
      else delete cp[activeWg];
      return cp;
    });
    // None: giữ nguyên thứ tự hiện tại. Có chiều: sắp lại 1 lần.
    if (next) setRows((rs) => sortRows(rs, next.col, next.dir));
  };

  async function onSave() {
    const validRows = rows.filter(hasContent);
    // "Thêm công việc": mỗi dòng bắt buộc có Người duyệt.
    if (withApprover && validRows.some((r) => !r.approverId)) {
      toast.error("Mỗi dòng phải chọn Người duyệt");
      return;
    }
    if (cols.includes("blockSystem")) {
      const ambiguousRow = validRows.find((r) => {
        if (!r.projectGroupId || !r.level2.trim() || !r.level3.trim() || r.projectId) return false;
        return projects.filter((p) =>
          p.groupId === r.projectGroupId &&
          p.constructionTypeCode === r.level2.trim() &&
          p.name === r.level3.trim(),
        ).length > 1;
      });
      if (ambiguousRow) {
        toast.error("Chọn Khối/Hệ thống cho các hạng mục có nhiều khối/hệ thống");
        return;
      }
    }
    const payload = validRows.map((r) => ({
      workGroupId: activeWg,
      projectId: cols.includes("project") ? r.projectId || null : null,
      disciplineId: r.disciplineId || null,
      phaseId: cols.includes("phase") ? r.phaseId || null : null,
      level2: r.level2.trim() || null,
      level3: r.level3.trim() || null,
      level5: r.level5.trim() || null,
      priority: r.priority || "TRUNG_BINH",
      // withApprover: bỏ ngày (đặt sau khi duyệt) + gắn người duyệt.
      plannedStart: r.plannedStart || null,
      plannedEnd: r.plannedEnd || null,
      approverId: withApprover ? r.approverId || null : null,
      // "Tự note": ép người thực hiện = chính mình.
      assigneeIds: selfAssignUserId ? [selfAssignUserId] : r.assigneeIds,
    }));

    if (payload.length === 0) {
      toast.error("Chưa có dòng nào để giao (cần nhập Loại hình/Hạng mục/Đầu việc)");
      return;
    }

    setPending(true);
    const res = await saveAction(payload);
    setPending(false);
    if (res.ok) {
      toast.success(withApprover ? `Đã thêm ${res.data} việc (chờ duyệt)` : `Đã giao ${res.data} việc`);
      setRows(() => makeRows(INITIAL_ROWS));
      onSaved?.();
    } else {
      toast.error(res.error);
    }
  }

  // Render một ô theo loại cột.
  function cell(r: GridRow, col: ColKey) {
    switch (col) {
      case "id":
        // Read-only: Id dự kiến theo nhóm, không sửa được.
        return (
          <div className="flex h-9 items-center px-1 font-mono text-xs text-muted-foreground">
            {idOf(r)}
          </div>
        );
      case "project": {
        // Cascade bước 1: chọn ProjectGroup (tên dự án như B.QNI.HLXHL)
        const pgCodes = [...new Set(projects.map((p) => p.groupCode).filter(Boolean))].sort();
        const curGroupCode = r.projectGroupId
          ? (projects.find((p) => p.groupId === r.projectGroupId)?.groupCode ?? "")
          : "";
        return (
          <SearchableCombobox
            className={CELL}
            creatable={false}
            placeholder="— Không —"
            value={curGroupCode}
            options={["— Không —", ...pgCodes]}
            onChange={(v) => {
              if (v === "— Không —") {
                updateRow(r.key, { projectGroupId: "", level2: "", level3: "", blockSystem: "", projectId: "" });
                return;
              }
              const pg = projects.find((p) => p.groupCode === v);
              updateRow(r.key, { projectGroupId: pg?.groupId ?? "", level2: "", level3: "", blockSystem: "", projectId: "" });
            }}
          />
        );
      }
      case "discipline":
        return (
          <SearchableCombobox
            className={CELL}
            creatable={false}
            placeholder="— Không —"
            value={disciplines.find((d) => d.id === r.disciplineId)?.code ?? ""}
            options={["— Không —", ...disciplines.map((d) => d.code ?? d.name)]}
            onChange={(label) =>
              updateRow(r.key, {
                disciplineId: label === "— Không —" ? "" : (disciplines.find((d) => (d.code ?? d.name) === label)?.id ?? ""),
              })
            }
          />
        );
      case "phase":
        return (
          <Select className={CELL} value={r.phaseId} onChange={(e) => updateRow(r.key, { phaseId: e.target.value })}>
            <option value="">— Không —</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        );
      case "priority":
        return (
          <SearchableCombobox
            className={CELL}
            creatable={false}
            value={PRIORITY_LABEL[r.priority] ?? ""}
            options={PRIORITY_OPTIONS.map((p) => PRIORITY_LABEL[p])}
            onChange={(label) =>
              updateRow(r.key, {
                priority: PRIORITY_OPTIONS.find((p) => PRIORITY_LABEL[p] === label) ?? "TRUNG_BINH",
              })
            }
          />
        );
      case "assignees":
        return (
          <UserMultiSelect
            users={users}
            value={r.assigneeIds}
            onChange={(ids) => updateRow(r.key, { assigneeIds: ids })}
            inputClassName={CELL}
            allowSelectAll
          />
        );
      case "plannedStart":
      case "plannedEnd":
        return (
          <Input className={CELL} type="date" value={r[col]} onChange={(e) => updateRow(r.key, { [col]: e.target.value })} />
        );
      case "approver":
        return (
          <Select
            className={CELL}
            value={r.approverId}
            onChange={(e) => updateRow(r.key, { approverId: e.target.value })}
          >
            <option value="">— Chọn người duyệt —</option>
            {approvers.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </Select>
        );
      case "blockSystem": {
        const pool = projects.filter((p) =>
          (!r.projectGroupId || p.groupId === r.projectGroupId) &&
          (!r.level2.trim() || p.constructionTypeCode === r.level2.trim()) &&
          (!r.level3.trim() || p.name === r.level3.trim()),
        );
        const blockOpts = [...new Set(pool.map((p) => p.blockSystem?.trim() ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
        const hasNoBlock = pool.some((p) => !(p.blockSystem?.trim()));
        const opts = [...(hasNoBlock ? [NONE] : []), ...blockOpts];
        return (
          <SearchableCombobox
            className={CELL}
            creatable={false}
            placeholder={NONE}
            value={r.blockSystem || (hasNoBlock ? NONE : "")}
            options={opts.length ? opts : [NONE]}
            onChange={(label) => {
              const blockSystem = label === NONE ? "" : label;
              const nl2 = r.level2.trim();
              const nl3 = r.level3.trim();
              const p = r.projectGroupId && nl2 && nl3
                ? projects.find((pp) =>
                    pp.groupId === r.projectGroupId &&
                    pp.constructionTypeCode === nl2 &&
                    pp.name === nl3 &&
                    (pp.blockSystem?.trim() ?? "") === blockSystem,
                  )
                : null;
              updateRow(r.key, { blockSystem, projectId: p?.id ?? "" });
            }}
          />
        );
      }
      case "level2":
      case "level3":
      case "level5": {
        // Cascade Dự án→Loại hình→Hạng mục: bật cho mọi bảng có cột "Dự án" (B3, Thanh tra BIM…).
        const hasProjectCascade = cols.includes("project");
        let opts: string[];
        if (hasProjectCascade && col === "level2") {
          // Cascade bước 2: Loại hình → lọc theo ProjectGroup đã chọn
          const pool = r.projectGroupId ? projects.filter((p) => p.groupId === r.projectGroupId) : projects;
          opts = [...new Set(pool.map((p) => p.constructionTypeCode).filter(Boolean))];
        } else if (hasProjectCascade && col === "level3") {
          // Cascade bước 3: Hạng mục → lọc theo ProjectGroup + Loại hình
          const pool = r.projectGroupId ? projects.filter((p) => p.groupId === r.projectGroupId) : projects;
          const l2 = r.level2.trim();
          opts = [...new Set(pool.filter((p) => !l2 || p.constructionTypeCode === l2).map((p) => p.name))];
        } else {
          if (col === "level2") {
            opts = sug.l2;
          } else if (col === "level3") {
            // Cascade L2→L3: lọc theo Loại hình đã chọn (dùng l3ByL2 map)
            const l2 = r.level2.trim();
            opts = l2 && sug.l3ByL2?.[l2]?.length ? sug.l3ByL2[l2] : sug.l3;
          } else {
            opts = sug.l5;
          }
        }
        return (
          <SearchableCombobox
            className={CELL}
            creatable={false}
            value={r[col]}
            onChange={(v) => {
              const patch: Partial<GridRow> = { [col]: v };
              // Non-project cascade: đổi Loại hình → reset Hạng mục
              if (!hasProjectCascade && col === "level2") {
                patch.level3 = "";
              }
              if (hasProjectCascade && col !== "level5") {
                if (col === "level2") {
                  // Đổi Loại hình → xóa Hạng mục + projectId vì cascade thay đổi
                  patch.level3 = "";
                  patch.blockSystem = "";
                  patch.projectId = "";
                } else if (col === "level3") {
                  // Chọn Hạng mục → tự resolve projectId
                  const nl2 = r.level2.trim();
                  const nl3 = v.trim();
                  if (r.projectGroupId && nl2 && nl3) {
                    const matches = projects.filter(
                      (pp) => pp.groupId === r.projectGroupId && pp.constructionTypeCode === nl2 && pp.name === nl3,
                    );
                    patch.blockSystem = matches.length === 1 ? (matches[0].blockSystem?.trim() ?? "") : "";
                    patch.projectId = matches.length === 1 ? matches[0].id : "";
                  } else {
                    patch.blockSystem = "";
                    patch.projectId = "";
                  }
                }
              }
              updateRow(r.key, patch);
            }}
            options={opts}
          />
        );
      }
    }
  }

  return (
    <div className="space-y-4">
      {embedded ? (
        <p className="text-sm text-muted-foreground">
          Chọn bảng theo nhóm công việc rồi nhập trực tiếp. Mỗi dòng có nội dung sẽ tạo thành một việc mới.
        </p>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Giao việc</h1>
          <p className="text-sm text-muted-foreground">
            Chọn bảng theo nhóm công việc rồi nhập trực tiếp. Mỗi dòng có nội dung sẽ tạo thành một việc mới.
          </p>
        </div>
      )}

      {/* Tab Bảng 1-7 */}
      <div className="flex flex-wrap gap-1.5 border-b pb-2">
        {workGroups.map((w) => {
          const count = (rowsByWg[w.id] ?? []).filter(hasContent).length;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => setActiveWg(w.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                w.id === activeWg ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {w.name}
              {count > 0 ? <span className="opacity-70"> ({count})</span> : null}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table
          className="w-full table-fixed border-collapse text-xs"
          style={{ minWidth: tableMinWidth }}
        >
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th className="text-center" style={{ width: IDX_PX }}>#</th>
              {cols.map((c) => (
                <HeaderCell
                  key={c}
                  label={COL_LABEL[c]}
                  width={colWidths[c]}
                  sortDir={sort?.col === c ? sort.dir : null}
                  draggingRef={draggingRef}
                  onToggleSort={() => toggleSort(c)}
                  onResize={(px) => setColWidth(c, px)}
                  onResizeEnd={endResize}
                  onReset={() => resetColWidth(c)}
                />
              ))}
              <th style={{ width: ACT_PX }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              return (
                <tr key={r.key} className="[&>td]:border-b [&>td]:p-1 align-top">
                  <td className="text-muted-foreground">
                    <div className="flex h-9 items-center justify-center">{i + 1}</div>
                  </td>
                  {cols.map((c) => (
                    <td key={c}>{cell(r, c)}</td>
                  ))}
                  <td>
                    <div className="flex h-9 items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyRow(r.key)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Sao chép dòng"
                      >
                        <Copy className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => pasteRow(r.key)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        disabled={!clip}
                        title="Dán vào dòng"
                      >
                        <ClipboardPaste className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                        disabled={rows.length <= 1}
                        title="Xóa dòng"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addRows(1)}>
          <Plus className="size-4" /> Thêm dòng
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRows(5)}>
          +5 dòng
        </Button>
        <span className="text-sm text-muted-foreground">{validCount} dòng có nội dung</span>
        <div className="ml-auto">
          <Button type="button" onClick={onSave} disabled={pending || validCount === 0}>
            {pending ? "Đang lưu..." : `Lưu bảng ${activeGroup?.name ?? ""} (${validCount})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
