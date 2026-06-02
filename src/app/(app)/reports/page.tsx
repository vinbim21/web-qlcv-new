import { prisma } from "@/server/db/client";
import { ReportsClient } from "./reports-client";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function ReportsPage() {
  const [tasks, workGroups, disciplines, projects, hoursByUser] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null },
      include: {
        workGroup: true,
        discipline: true,
        project: true,
        assignees: { include: { user: true }, orderBy: { roleNo: "asc" } },
      },
      take: 5000,
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

  return (
    <ReportsClient
      tasks={tasks.map((t) => ({
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
      }))}
      workGroups={workGroups.map((w) => ({ id: w.id, name: w.name }))}
      disciplines={disciplines.map((d) => ({ id: d.id, name: d.name }))}
      projects={projects.map((p) => ({ id: p.id, name: `${p.code} — ${p.name}` }))}
      hoursByUser={hoursByUser
        .map((h) => ({ name: userName.get(h.userId) ?? "—", value: Number(h._sum.hours ?? 0) }))
        .sort((a, b) => b.value - a.value)}
    />
  );
}
