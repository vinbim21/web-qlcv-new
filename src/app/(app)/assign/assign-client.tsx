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
import { PRIORITY_LABEL, PRIORITY_OPTIONS } from "@/lib/labels";
import { cn, removeVietnameseTones } from "@/lib/utils";
import { saveTasksBatch } from "@/server/actions/tasks";

type SortDir = "asc" | "desc";
const MIN_COL_W = 80;
const MAX_COL_W = 600;
const WIDTH_KEY = "assign-col-widths-v1";
const clampW = (n: number) => Math.min(MAX_COL_W, Math.max(MIN_COL_W, Math.round(n)));

// ----- Cấu hình cột theo từng bảng (suy ra từ prisma/import/extract.py) -----
type ColKey =
  | "id"
  | "project"
  | "level2"
  | "level3"
  | "discipline"
  | "level5"
  | "phase"
  | "priority"
  | "assignees"
  | "plannedStart"
  | "plannedEnd";

const COLS_DEFAULT: ColKey[] = [
  "id", "level2", "level3", "discipline", "level5",
  "priority", "assignees", "plannedStart", "plannedEnd",
];
// Bảng 3 (Quản lý BIM): thêm Dự án + Giai đoạn.
const COLS_B3: ColKey[] = [
  "id", "project", "level2", "level3", "discipline", "level5", "phase",
  "priority", "assignees", "plannedStart", "plannedEnd",
];
// Bảng 6 (Quản lý phần mềm): chỉ 1 người (giới hạn bằng max).
const COLS_B6: ColKey[] = [
  "id", "level2", "level3", "discipline", "level5", "priority", "assignees", "plannedStart", "plannedEnd",
];

function columnsFor(code?: string): ColKey[] {
  if (code === "3") return COLS_B3;
  if (code === "6") return COLS_B6;
  return COLS_DEFAULT;
}

const COL_LABEL: Record<ColKey, string> = {
  id: "Id",
  project: "Dự án",
  level2: "Hạng mục (L2)",
  level3: "Chi tiết (L3)",
  discipline: "Bộ môn (L4)",
  level5: "Đầu việc (L5)",
  phase: "Giai đoạn",
  priority: "Ưu tiên",
  assignees: "Người thực hiện",
  plannedStart: "Ngày BĐ",
  plannedEnd: "Ngày KT",
};

// Bề rộng cố định từng cột (px). Dùng cho `table-layout: fixed` để mở/đóng ô
// (button ↔ input) không làm phình cột & xô lệch bảng.
const COL_PX: Record<ColKey, number> = {
  id: 76,
  project: 150,
  level2: 150,
  level3: 150,
  discipline: 120,
  level5: 160,
  phase: 120,
  priority: 110,
  assignees: 230,
  plannedStart: 140,
  plannedEnd: 140,
};
const IDX_PX = 40; // cột #
const ACT_PX = 96; // cột hành động

// ----- Lưới -----
type GridRow = {
  key: number;
  projectId: string;
  level2: string;
  level3: string;
  level5: string;
  disciplineId: string;
  phaseId: string;
  priority: string;
  assigneeIds: string[];
  plannedStart: string;
  plannedEnd: string;
};

const EMPTY: Omit<GridRow, "key"> = {
  projectId: "",
  level2: "",
  level3: "",
  level5: "",
  disciplineId: "",
  phaseId: "",
  priority: "TRUNG_BINH",
  assigneeIds: [],
  plannedStart: "",
  plannedEnd: "",
};

const INITIAL_ROWS = 5;
const CELL = "h-8 text-xs";

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
}: {
  // workGroups kèm abbr (tiền tố Id) + lastSeq (gốc preview Id).
  workGroups: (Opt & { abbr?: string | null; lastSeq?: number })[];
  disciplines: Opt[];
  phases: Opt[];
  projects: Opt[];
  users: UserOpt[];
  catalog: Catalog;
  // embedded: dùng lại lưới trong modal (ẩn tiêu đề trang). onSaved: gọi sau khi lưu xong.
  embedded?: boolean;
  onSaved?: () => void;
}) {
  const [activeWg, setActiveWg] = React.useState(workGroups[0]?.id ?? "");
  const [rowsByWg, setRowsByWg] = React.useState<Record<string, GridRow[]>>(() =>
    Object.fromEntries(workGroups.map((w) => [w.id, makeRows(INITIAL_ROWS)])),
  );
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
  const cols = columnsFor(activeGroup?.code);
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
      case "level5": return !r.level5.trim();
      case "assignees": return r.assigneeIds.length === 0;
      case "plannedStart": return !r.plannedStart;
      case "plannedEnd": return !r.plannedEnd;
      case "priority": return false;
    }
  };

  const cellCmp = (a: GridRow, b: GridRow, col: ColKey): number => {
    const t = (s: string) => removeVietnameseTones(s);
    switch (col) {
      case "id": return a.key - b.key; // Id theo thứ tự tạo dòng
      case "level2": return t(a.level2).localeCompare(t(b.level2));
      case "level3": return t(a.level3).localeCompare(t(b.level3));
      case "level5": return t(a.level5).localeCompare(t(b.level5));
      case "project": return t(nameOf(projects, a.projectId)).localeCompare(t(nameOf(projects, b.projectId)));
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
    const payload = rows.filter(hasContent).map((r) => ({
      workGroupId: activeWg,
      projectId: cols.includes("project") ? r.projectId || null : null,
      disciplineId: r.disciplineId || null,
      phaseId: cols.includes("phase") ? r.phaseId || null : null,
      level2: r.level2.trim() || null,
      level3: r.level3.trim() || null,
      level5: r.level5.trim() || null,
      priority: r.priority || "TRUNG_BINH",
      plannedStart: r.plannedStart || null,
      plannedEnd: r.plannedEnd || null,
      assigneeIds: r.assigneeIds,
    }));

    if (payload.length === 0) {
      toast.error("Chưa có dòng nào để giao (cần nhập Hạng mục/Chi tiết/Đầu việc)");
      return;
    }

    setPending(true);
    const res = await saveTasksBatch(payload);
    setPending(false);
    if (res.ok) {
      toast.success(`Đã giao ${res.data} việc`);
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
      case "project":
        return (
          <SearchableCombobox
            className={CELL}
            creatable={false}
            placeholder="— Không —"
            value={projects.find((p) => p.id === r.projectId)?.name ?? ""}
            options={["— Không —", ...projects.map((p) => p.name)]}
            onChange={(label) =>
              updateRow(r.key, {
                projectId: label === "— Không —" ? "" : (projects.find((p) => p.name === label)?.id ?? ""),
              })
            }
          />
        );
      case "discipline":
        return (
          <SearchableCombobox
            className={CELL}
            creatable={false}
            placeholder="— Không —"
            value={disciplines.find((d) => d.id === r.disciplineId)?.name ?? ""}
            options={["— Không —", ...disciplines.map((d) => d.name)]}
            onChange={(label) =>
              updateRow(r.key, {
                disciplineId: label === "— Không —" ? "" : (disciplines.find((d) => d.name === label)?.id ?? ""),
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
      case "level2":
      case "level3":
      case "level5": {
        const opts = col === "level2" ? sug.l2 : col === "level3" ? sug.l3 : sug.l5;
        return (
          <SearchableCombobox
            className={CELL}
            creatable={false}
            value={r[col]}
            onChange={(v) => updateRow(r.key, { [col]: v })}
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
