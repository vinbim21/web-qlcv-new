import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import { canViewPersonReports } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import type { NormRow } from "./norm-report";
import { ReportsTabs } from "./reports-tabs";
import type { TimeEntry, TimeTask } from "./time-by-task";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const canViewPerson = canViewPersonReports(session.user.role);

  const [tasks, workGroups, disciplines, projects, hoursByUser] = await Promise.all([
    // Chỉ đếm VIỆC LÁ (không có việc con) để tránh đếm trùng việc cha/con.
    prisma.task.findMany({
      where: { deletedAt: null, children: { none: {} } },
      select: {
        id: true,
        sumId: true,
        name: true,
        workGroupId: true,
        disciplineId: true,
        projectId: true,
        status: true,
        priority: true,
        plannedStart: true,
        plannedEnd: true,
        workGroup: { select: { name: true, order: true } },
        discipline: { select: { code: true, name: true } },
        project: { select: { name: true } },
        assignees: { select: { roleNo: true, user: { select: { id: true, fullName: true } } }, orderBy: { roleNo: "asc" } },
      },
      take: 10000,
    }),
    prisma.workGroup.findMany({ orderBy: { order: "asc" } }),
    prisma.discipline.findMany({ orderBy: { order: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.timeSheetEntry.groupBy({
      by: ["userId"],
      where: { deletedAt: null },
      _sum: { hours: true },
    }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: hoursByUser.map((h) => h.userId) } },
    select: { id: true, fullName: true },
  });
  const userName = new Map(users.map((u) => [u.id, u.fullName]));

  // Dữ liệu cho pivot (BC1/2/3) — nhẹ, chỉ field cần thiết.
  const rows = tasks.map((t) => ({
    id: t.id,
    groupId: t.workGroupId,
    groupName: t.workGroup.name,
    groupOrder: t.workGroup.order,
    disciplineCode: t.discipline?.code ?? null,
    status: t.status,
    priority: t.priority,
    plannedStart: iso(t.plannedStart),
    plannedEnd: iso(t.plannedEnd),
    assignees: t.assignees.map((a) => ({ id: a.user.id, name: a.user.fullName })),
  }));

  // Dữ liệu cho tab "Tổng quan" (giữ nguyên giao diện cũ).
  const overview = {
    tasks: tasks.map((t) => ({
      id: t.id,
      sumId: t.sumId,
      name: t.name,
      workGroupId: t.workGroupId,
      workGroupName: t.workGroup.name,
      disciplineId: t.disciplineId,
      disciplineName: t.discipline?.name ?? null,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      status: t.status,
      priority: t.priority,
      plannedStart: iso(t.plannedStart),
      plannedEnd: iso(t.plannedEnd),
      assigneeNames: t.assignees.map((a) => a.user.fullName),
    })),
    workGroups: workGroups.map((w) => ({ id: w.id, name: w.name })),
    disciplines: disciplines.map((d) => ({ id: d.id, name: d.name })),
    projects: projects.map((p) => ({ id: p.id, name: `${p.code} — ${p.name}` })),
    hoursByUser: hoursByUser
      .map((h) => ({ name: userName.get(h.userId) ?? "—", value: Number(h._sum.hours ?? 0) }))
      .sort((a, b) => b.value - a.value),
  };

  // ----- Báo cáo định mức (BC4) + Thời gian theo việc — chỉ khi có quyền xem báo cáo nhạy cảm -----
  let normRows: NormRow[] = [];
  let normCts: string[] = [];
  let timeTasks: TimeTask[] = [];
  let timeEntries: TimeEntry[] = [];
  let unattributedHours = 0;
  if (canViewPerson) {
    const entries = await prisma.timeSheetEntry.findMany({
      where: { deletedAt: null, task: { is: { measureNorm: true, deletedAt: null } } },
      select: {
        hours: true,
        taskId: true,
        user: { select: { id: true, fullName: true } },
        task: {
          select: {
            level5: true,
            name: true,
            project: { select: { constructionType: { select: { name: true, order: true } } } },
          },
        },
      },
    });

    type A = {
      userId: string;
      userName: string;
      task: string;
      ctName: string;
      ctOrder: number;
      hours: number;
      tasks: Set<string>;
    };
    const byUser = new Map<string, A>();
    const byDept = new Map<string, { hours: number; tasks: Set<string> }>();
    for (const e of entries) {
      const taskName = e.task?.level5 || e.task?.name || "(không rõ đầu việc)";
      const ct = e.task?.project?.constructionType;
      const ctName = ct?.name ?? "Chưa gán loại hình";
      const ctOrder = ct?.order ?? 999;
      const h = Number(e.hours);
      const tk = e.taskId ?? `${taskName}|${ctName}`;

      const uk = `${e.user.id}|${taskName}|${ctName}`;
      let a = byUser.get(uk);
      if (!a) {
        a = { userId: e.user.id, userName: e.user.fullName, task: taskName, ctName, ctOrder, hours: 0, tasks: new Set() };
        byUser.set(uk, a);
      }
      a.hours += h;
      a.tasks.add(tk);

      const dk = `${taskName}|${ctName}`;
      let d = byDept.get(dk);
      if (!d) {
        d = { hours: 0, tasks: new Set() };
        byDept.set(dk, d);
      }
      d.hours += h;
      d.tasks.add(tk);
    }

    normRows = [...byUser.values()].map((a) => {
      const times = a.tasks.size || 1;
      const d = byDept.get(`${a.task}|${a.ctName}`)!;
      const dTimes = d.tasks.size || 1;
      return {
        userId: a.userId,
        userName: a.userName,
        task: a.task,
        ctName: a.ctName,
        ctOrder: a.ctOrder,
        times: a.tasks.size,
        hours: a.hours,
        norm: a.hours / times,
        deptNorm: d.hours / dTimes,
      };
    });
    normCts = [...new Set(normRows.map((r) => r.ctName))];

    // ----- Thời gian theo việc (tái dùng byDept của BC4 cho benchmark định mức) -----
    const tsAll = await prisma.timeSheetEntry.findMany({
      where: { deletedAt: null, taskId: { not: null } },
      select: { taskId: true, hours: true, date: true, user: { select: { fullName: true } } },
    });
    const unattr = await prisma.timeSheetEntry.aggregate({
      _sum: { hours: true },
      where: { deletedAt: null, taskId: null },
    });
    unattributedHours = Number(unattr._sum.hours ?? 0);

    const taskIds = [...new Set(tsAll.map((e) => e.taskId).filter(Boolean) as string[])];
    const taskInfos = await prisma.task.findMany({
      where: { id: { in: taskIds } }, // gồm cả việc đã xóa mềm
      select: {
        id: true,
        sumId: true,
        name: true,
        level5: true,
        plannedStart: true,
        plannedEnd: true,
        deletedAt: true,
        workGroup: { select: { name: true } },
        project: { select: { name: true, constructionType: { select: { name: true } } } },
      },
    });
    const deptNormOf = (level5: string, ctName: string): number | null => {
      const d = byDept.get(`${level5}|${ctName}`);
      return d && d.tasks.size > 0 ? d.hours / d.tasks.size : null;
    };
    timeTasks = taskInfos.map((t) => {
      const level5 = t.level5 || t.name;
      const ctName = t.project?.constructionType?.name ?? "Chưa gán loại hình";
      return {
        id: t.id,
        sumId: t.sumId,
        name: t.name,
        groupName: t.workGroup.name,
        projectName: t.project?.name ?? null,
        plannedStart: iso(t.plannedStart),
        plannedEnd: iso(t.plannedEnd),
        deleted: t.deletedAt != null,
        deptNorm: deptNormOf(level5, ctName),
      };
    });
    timeEntries = tsAll.map((e) => ({
      taskId: e.taskId as string,
      userName: e.user.fullName,
      date: iso(e.date),
      hours: Number(e.hours),
    }));
  }

  return (
    <ReportsTabs
      overview={overview}
      rows={rows}
      normRows={normRows}
      normCts={normCts}
      timeTasks={timeTasks}
      timeEntries={timeEntries}
      unattributedHours={unattributedHours}
      canViewPerson={canViewPerson}
    />
  );
}
