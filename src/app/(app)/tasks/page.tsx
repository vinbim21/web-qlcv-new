import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";
import { canManage } from "@/server/auth/permissions";
import { TasksClient } from "./tasks-client";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) return null;
  const manage = canManage(session.user.role);

  const [tasks, workGroups, disciplines, phases, projects, users] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null },
      include: {
        workGroup: true,
        discipline: true,
        phase: true,
        project: true,
        assignees: { include: { user: true }, orderBy: { roleNo: "asc" } },
      },
      orderBy: [{ workGroupId: "asc" }, { createdAt: "asc" }],
      take: 2000,
    }),
    prisma.workGroup.findMany({ orderBy: { order: "asc" } }),
    prisma.discipline.findMany({ orderBy: { order: "asc" } }),
    prisma.phase.findMany({ orderBy: { order: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.user.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <TasksClient
      currentUserId={session.user.id}
      canManage={manage}
      tasks={tasks.map((t) => ({
        id: t.id,
        sumId: t.sumId,
        workGroupId: t.workGroupId,
        workGroupName: t.workGroup.name,
        projectId: t.projectId,
        projectName: t.project?.name ?? null,
        disciplineId: t.disciplineId,
        disciplineName: t.discipline?.name ?? null,
        phaseId: t.phaseId,
        phaseName: t.phase?.name ?? null,
        level2: t.level2,
        level3: t.level3,
        level5: t.level5,
        name: t.name,
        priority: t.priority,
        status: t.status,
        progressPercent: t.progressPercent,
        plannedStart: iso(t.plannedStart),
        plannedEnd: iso(t.plannedEnd),
        note: t.note,
        assigneeIds: t.assignees.map((a) => a.userId),
        assigneeNames: t.assignees.map((a) => a.user.fullName),
      }))}
      workGroups={workGroups.map((w) => ({ id: w.id, name: w.name }))}
      disciplines={disciplines.map((d) => ({ id: d.id, name: d.name }))}
      phases={phases.map((p) => ({ id: p.id, name: p.name }))}
      projects={projects.map((p) => ({ id: p.id, name: `${p.code} — ${p.name}` }))}
      users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
    />
  );
}
