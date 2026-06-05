import ExcelJS from "exceljs";
import { auth } from "@/server/auth/config";
import { canViewPersonReports } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { PHONG_LABEL, PHONG_ORDER, phongOf } from "@/lib/dept-map";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import { effectiveStatus } from "@/lib/task-status";

export const runtime = "nodejs";

const STATUS_KEYS = ["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG", "QUA_HAN"] as const;
const PRIORITY_KEYS = ["CAO", "TRUNG_BINH", "THAP"] as const;

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

type Agg = { label: string; order: number; total: number; status: Record<string, number>; priority: Record<string, number> };

function blankAgg(label: string, order: number): Agg {
  return { label, order, total: 0, status: {}, priority: {} };
}

function addPivotSheet(
  wb: ExcelJS.Workbook,
  title: string,
  rowHeader: string,
  aggs: Agg[],
) {
  const ws = wb.addWorksheet(title);
  ws.columns = [
    { header: rowHeader, key: "label", width: 32 },
    { header: "Tổng", key: "total", width: 8 },
    ...STATUS_KEYS.map((k) => ({ header: TASK_STATUS_LABEL[k], key: `s_${k}`, width: 12 })),
    ...PRIORITY_KEYS.map((k) => ({ header: `Ưu tiên ${PRIORITY_LABEL[k]}`, key: `p_${k}`, width: 14 })),
  ];
  ws.getRow(1).font = { bold: true };
  const sorted = [...aggs].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "vi"));
  for (const a of sorted) {
    const row: Record<string, string | number> = { label: a.label, total: a.total };
    for (const k of STATUS_KEYS) row[`s_${k}`] = a.status[k] ?? 0;
    for (const k of PRIORITY_KEYS) row[`p_${k}`] = a.priority[k] ?? 0;
    ws.addRow(row);
  }
  // dòng tổng
  const totalRow: Record<string, string | number> = { label: "TỔNG CỘNG", total: 0 };
  for (const k of STATUS_KEYS) totalRow[`s_${k}`] = 0;
  for (const k of PRIORITY_KEYS) totalRow[`p_${k}`] = 0;
  for (const a of sorted) {
    (totalRow.total as number) += a.total;
    for (const k of STATUS_KEYS) (totalRow[`s_${k}`] as number) += a.status[k] ?? 0;
    for (const k of PRIORITY_KEYS) (totalRow[`p_${k}`] as number) += a.priority[k] ?? 0;
  }
  ws.addRow(totalRow).font = { bold: true };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const canPerson = canViewPersonReports(session.user.role);

  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, children: { none: {} } },
    select: {
      status: true,
      priority: true,
      plannedStart: true,
      plannedEnd: true,
      workGroup: { select: { name: true, order: true } },
      discipline: { select: { code: true } },
      assignees: { select: { user: { select: { fullName: true } } } },
    },
    take: 10000,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Web QLCV";

  const group = new Map<string, Agg>();
  const phong = new Map<string, Agg>();
  const user = new Map<string, Agg>();

  const bump = (m: Map<string, Agg>, key: string, mk: () => Agg, status: string, priority: string) => {
    let a = m.get(key);
    if (!a) {
      a = mk();
      m.set(key, a);
    }
    a.total += 1;
    a.status[status] = (a.status[status] ?? 0) + 1;
    a.priority[priority] = (a.priority[priority] ?? 0) + 1;
  };

  for (const t of tasks) {
    const eff = effectiveStatus({
      status: t.status,
      plannedStart: iso(t.plannedStart),
      plannedEnd: iso(t.plannedEnd),
      assigneeCount: t.assignees.length,
    });
    // BC1 — nhóm
    bump(group, t.workGroup.name, () => blankAgg(t.workGroup.name, t.workGroup.order), eff, t.priority);
    // BC2 — phòng
    const p = phongOf(t.discipline?.code);
    const pLabel = p ? PHONG_LABEL[p] : "Chưa phân phòng";
    const pOrder = p ? PHONG_ORDER.indexOf(p) : 99;
    bump(phong, pLabel, () => blankAgg(pLabel, pOrder), eff, t.priority);
    // BC3 — nhân sự (đếm mọi người được giao)
    if (t.assignees.length === 0) {
      bump(user, "⚠ Chưa giao", () => blankAgg("⚠ Chưa giao", 1e9), eff, t.priority);
    } else {
      for (const a of t.assignees) {
        const n = a.user.fullName;
        bump(user, n, () => blankAgg(n, 0), eff, t.priority);
      }
    }
  }

  addPivotSheet(wb, "BC1 - Theo nhom", "Nhóm công việc", [...group.values()]);
  addPivotSheet(wb, "BC2 - Theo phong", "Phòng", [...phong.values()]);
  addPivotSheet(wb, "BC3 - Theo nhan su", "Nhân sự", [...user.values()]);

  // BC4 — Định mức (chỉ khi có quyền)
  if (canPerson) {
    const entries = await prisma.timeSheetEntry.findMany({
      where: { deletedAt: null, task: { is: { measureNorm: true, deletedAt: null } } },
      select: {
        hours: true,
        taskId: true,
        user: { select: { fullName: true } },
        task: { select: { level5: true, name: true, project: { select: { constructionType: { select: { name: true, order: true } } } } } },
      },
    });
    type N = { user: string; task: string; ct: string; ctOrder: number; hours: number; tasks: Set<string> };
    const byUser = new Map<string, N>();
    const byDept = new Map<string, { hours: number; tasks: Set<string> }>();
    for (const e of entries) {
      const task = e.task?.level5 || e.task?.name || "(không rõ đầu việc)";
      const ct = e.task?.project?.constructionType;
      const ctName = ct?.name ?? "Chưa gán loại hình";
      const tk = e.taskId ?? `${task}|${ctName}`;
      const uk = `${e.user.fullName}|${task}|${ctName}`;
      let a = byUser.get(uk);
      if (!a) {
        a = { user: e.user.fullName, task, ct: ctName, ctOrder: ct?.order ?? 999, hours: 0, tasks: new Set() };
        byUser.set(uk, a);
      }
      a.hours += Number(e.hours);
      a.tasks.add(tk);
      const dk = `${task}|${ctName}`;
      let d = byDept.get(dk);
      if (!d) {
        d = { hours: 0, tasks: new Set() };
        byDept.set(dk, d);
      }
      d.hours += Number(e.hours);
      d.tasks.add(tk);
    }
    const ws = wb.addWorksheet("BC4 - Dinh muc");
    ws.columns = [
      { header: "Nhân sự", key: "user", width: 22 },
      { header: "Đầu việc", key: "task", width: 32 },
      { header: "Loại hình CT", key: "ct", width: 22 },
      { header: "Số lần", key: "times", width: 8 },
      { header: "Tổng giờ", key: "hours", width: 10 },
      { header: "Định mức (giờ/lần)", key: "norm", width: 16 },
      { header: "TB phòng", key: "dept", width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    const rows = [...byUser.values()].sort(
      (a, b) => a.user.localeCompare(b.user, "vi") || a.ctOrder - b.ctOrder || a.task.localeCompare(b.task, "vi"),
    );
    for (const a of rows) {
      const times = a.tasks.size || 1;
      const d = byDept.get(`${a.task}|${a.ct}`)!;
      const dTimes = d.tasks.size || 1;
      ws.addRow({
        user: a.user,
        task: a.task,
        ct: a.ct,
        times: a.tasks.size,
        hours: Number(a.hours.toFixed(1)),
        norm: Number((a.hours / times).toFixed(1)),
        dept: Number((d.hours / dTimes).toFixed(1)),
      });
    }
    if (rows.length === 0) ws.addRow({ user: "(Chưa có dữ liệu định mức)" });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-so-lieu-${Date.now()}.xlsx"`,
    },
  });
}
