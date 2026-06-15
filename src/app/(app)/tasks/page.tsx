import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";
import { canManage } from "@/server/auth/permissions";
import { getTaskLookups } from "@/server/data/task-lookups";
import { TasksClient } from "./tasks-client";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) return null;
  const manage = canManage(session.user.role);

  const [tasks, lookups] = await Promise.all([
    prisma.task.findMany({
      // "Công việc của tôi" = chỉ việc mình được giao (worklist cá nhân).
      // Quản lý toàn phòng nằm ở /manage.
      where: { deletedAt: null, assignees: { some: { userId: session.user.id } } },
      include: {
        workGroup: true,
        discipline: true,
        phase: true,
        project: { include: { group: true, constructionType: true } },
        approvedBy: { select: { fullName: true } },
        approver: { select: { fullName: true } },
        assignees: { include: { user: true }, orderBy: { roleNo: "asc" } },
      },
      orderBy: [{ workGroupId: "asc" }, { createdAt: "asc" }],
      take: 2000,
    }),
    getTaskLookups(),
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
        groupName: t.project?.group?.name ?? null,
        loaiHinhName: t.project?.constructionType?.name ?? null,
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
        actualEnd: iso(t.actualEnd),
        note: t.note,
        approved: !!t.approvedAt,
        approvedByName: t.approvedBy?.fullName ?? null,
        approverId: t.approverId,
        approverName: t.approver?.fullName ?? null,
        startApproved: !!t.startApprovedAt,
        assigneeIds: t.assignees.map((a) => a.userId),
        assigneeNames: t.assignees.map((a) => a.user.fullName),
      }))}
      isAdmin={session.user.role === "ADMIN"}
      workGroups={lookups.workGroups}
      disciplines={lookups.disciplines}
      phases={lookups.phases}
      projects={lookups.projects}
      users={lookups.users}
      approvers={lookups.approvers}
      catalog={lookups.catalog}
    />
  );
}
