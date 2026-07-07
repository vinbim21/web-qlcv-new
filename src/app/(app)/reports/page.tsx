import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import { canViewPersonReports } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import type { TaskRow } from "./report-data";
import { ReportsTabs } from "./reports-tabs";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

function normKey(v?: string | null): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/&/g, " va ")
    .replace(/\+/g, " va ")
    .replace(/\bva\b/g, " va ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const canViewPerson = canViewPersonReports(session.user.role);
  // Level 3 only sees own report data.
  const selfOnly = !canViewPerson;
  const meId = session.user.id;

  const [tasks, hoursAgg, catalogItems, users] = await Promise.all([
    // Count only leaf tasks to avoid parent/child duplicates.
    prisma.task.findMany({
      where: {
        deletedAt: null,
        children: { none: {} },
        ...(selfOnly ? { assignees: { some: { userId: meId } } } : {}),
      },
      select: {
        id: true,
        sumId: true,
        name: true,
        level5: true,
        level2: true,
        level3: true,
        workGroupId: true,
        status: true,
        priority: true,
        result: true,
        plannedStart: true,
        plannedEnd: true,
        actualEnd: true,
        workGroup: { select: { name: true, order: true } },
        phase: { select: { code: true, name: true } },
        discipline: { select: { code: true, name: true } },
        project: {
          select: {
            name: true,
            group: { select: { code: true, name: true } },
            constructionType: { select: { code: true, name: true } },
          },
        },
        assignees: { select: { user: { select: { id: true, fullName: true } } }, orderBy: { roleNo: "asc" } },
      },
      take: 10000,
    }),
    // Real timesheet hours grouped by task; selfOnly keeps current user only.
    prisma.timeSheetEntry.groupBy({
      by: ["taskId"],
      where: { deletedAt: null, taskId: { not: null }, ...(selfOnly ? { userId: meId } : {}) },
      _sum: { hours: true },
    }),
    prisma.catalogItem.findMany({
      where: { level: 3 },
      select: {
        workGroupId: true,
        value: true,
        parent: { select: { value: true } },
        projectGroup: { select: { code: true, name: true } },
      },
      orderBy: [{ order: "asc" }, { value: "asc" }],
    }),
    prisma.user.findMany({
      where: { deletedAt: null },
      select: { fullName: true, discipline: { select: { name: true } } },
    }),
  ]);

  // Tên người → tên Bộ môn (khai báo ở Quản trị/Người dùng) — cho nhóm "Danh sách nhân sự" ở báo cáo.
  const disciplineByPerson: Record<string, string> = {};
  for (const u of users) disciplineByPerson[u.fullName] = u.discipline?.name ?? "Chưa gán bộ môn";

  const hoursByTask = new Map(hoursAgg.map((h) => [h.taskId as string, Number(h._sum.hours ?? 0)]));
  const catalogByWorkGroupAndValue = new Map<string, typeof catalogItems>();
  const catalogByWorkGroupAndNormValue = new Map<string, typeof catalogItems>();
  const catalogByWorkGroupAndNormParent = new Map<string, typeof catalogItems>();
  for (const item of catalogItems) {
    const key = `${item.workGroupId}|${item.value}`;
    const list = catalogByWorkGroupAndValue.get(key);
    if (list) list.push(item);
    else catalogByWorkGroupAndValue.set(key, [item]);

    const norm = `${item.workGroupId}|${normKey(item.value)}`;
    const normList = catalogByWorkGroupAndNormValue.get(norm);
    if (normList) normList.push(item);
    else catalogByWorkGroupAndNormValue.set(norm, [item]);

    const parentNorm = `${item.workGroupId}|${normKey(item.parent?.value)}`;
    const parentNormList = catalogByWorkGroupAndNormParent.get(parentNorm);
    if (parentNormList) parentNormList.push(item);
    else catalogByWorkGroupAndNormParent.set(parentNorm, [item]);
  }

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    ma: t.sumId,
    duAn: t.project?.group?.code ?? "—",
    loaiHinh: t.project?.constructionType?.code ?? "",
    hangMuc: t.project?.name ?? "",
    congViec: t.level5 || t.name,
    giaiDoan: t.phase?.code ?? "",
    boMon: t.discipline?.code ?? "",
    boMonCode: t.discipline?.code ?? null,
    thucHien: t.assignees.map((a) => a.user.fullName),
    thucHienIds: t.assignees.map((a) => a.user.id),
    groupId: t.workGroupId,
    groupName: t.workGroup.name,
    groupOrder: t.workGroup.order,
    uuTien: t.priority,
    tinhTrang: t.status,
    batDau: iso(t.plannedStart),
    ketThuc: iso(t.plannedEnd),
    thucTe: iso(t.actualEnd),
    result: t.result ?? "",
    hours: hoursByTask.get(t.id) ?? 0,
  }));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  for (const row of rows) {
    const task = taskById.get(row.id);
    if (!task || task.project) continue;
    const exactMatches = task.level3 ? (catalogByWorkGroupAndValue.get(`${task.workGroupId}|${task.level3}`) ?? []) : [];
    const normMatches = task.level3 ? (catalogByWorkGroupAndNormValue.get(`${task.workGroupId}|${normKey(task.level3)}`) ?? []) : [];
    const parentNormMatches = task.level2
      ? (catalogByWorkGroupAndNormParent.get(`${task.workGroupId}|${normKey(task.level2)}`) ?? [])
      : [];
    const seen = new Set<string>();
    const catalogMatches = [...exactMatches, ...normMatches, ...parentNormMatches].filter((c) => {
      const key = `${c.workGroupId}|${c.value}|${c.parent?.value ?? ""}|${c.projectGroup?.code ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const catalog =
      catalogMatches.find(
        (c) =>
          c.projectGroup &&
          (!task.level2 || normKey(c.parent?.value) === normKey(task.level2)) &&
          (!task.level3 || normKey(c.value) === normKey(task.level3)),
      ) ??
      catalogMatches.find((c) => c.projectGroup && (!task.level2 || normKey(c.parent?.value) === normKey(task.level2))) ??
      catalogMatches.find((c) => c.projectGroup) ??
      catalogMatches.find((c) => !task.level2 || normKey(c.parent?.value) === normKey(task.level2)) ??
      catalogMatches[0] ??
      null;
    if (catalog?.projectGroup) row.duAn = catalog.projectGroup.code || catalog.projectGroup.name;
    if (!row.loaiHinh) row.loaiHinh = catalog?.parent?.value ?? task.level2 ?? "";
    if (!row.hangMuc) row.hangMuc = catalog?.value ?? task.level3 ?? "";
  }

  return (
    <ReportsTabs rows={rows} canViewPerson={canViewPerson} selfOnly={selfOnly} disciplineByPerson={disciplineByPerson} />
  );
}
