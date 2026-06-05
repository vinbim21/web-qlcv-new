import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import { canViewPersonReports } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { ReportsTabs } from "./reports-tabs";

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

  return <ReportsTabs overview={overview} rows={rows} canViewPerson={canViewPerson} />;
}
