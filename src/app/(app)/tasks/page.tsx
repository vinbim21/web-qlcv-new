import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";
import { canManage } from "@/server/auth/permissions";
import { getTaskLookups } from "@/server/data/task-lookups";
import { TasksClient } from "./tasks-client";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const manage = canManage(session.user.role);

  // Deep-link từ Tổng quan: click 1 việc "vừa được giao" → ?q=<sumId> lọc đúng việc đó.
  const sp = await searchParams;
  const qv = sp.q;
  const initialQuery = Array.isArray(qv) ? (qv[0] ?? "") : (qv ?? "");

  const [tasks, lookups, catalogL3] = await Promise.all([
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
        endChangeRequester: { select: { fullName: true } },
        deleteRequester: { select: { fullName: true } },
        assignees: { include: { user: true }, orderBy: { roleNo: "asc" } },
        completionHistory: {
          orderBy: { createdAt: "desc" },
          include: { approvedBy: { select: { fullName: true } } },
        },
      },
      orderBy: [{ workGroupId: "asc" }, { createdAt: "asc" }],
      take: 2000,
    }),
    getTaskLookups(),
    prisma.catalogItem.findMany({
      where: { level: 3, projectGroupId: { not: null } },
      select: { workGroupId: true, value: true, projectGroup: { select: { code: true, name: true } } },
    }),
  ]);
  // Map (workGroupId::level3) → projectGroup để điền mã dự án cho task BIM Tools
  const catalogPgMap = new Map(
    catalogL3.map((c) => [`${c.workGroupId}::${c.value}`, c.projectGroup]),
  );
  const catalogL1ByL2 = new Map<string, string>();
  for (const [workGroupId, cat] of Object.entries(lookups.catalog)) {
    for (const [level1, level2s] of Object.entries(cat.l2ByL1 ?? {})) {
      for (const level2 of level2s) {
        catalogL1ByL2.set(`${workGroupId}::${level2}`, level1);
      }
    }
  }

  return (
    <TasksClient
      currentUserId={session.user.id}
      canManage={manage}
      initialQuery={initialQuery}
      tasks={tasks.map((t) => ({
        id: t.id,
        sumId: t.sumId,
        workGroupId: t.workGroupId,
        workGroupName: t.workGroup.name,
        projectId: t.projectId,
        projectName: t.project?.name ?? null,
        blockSystem: t.project?.blockSystem ?? null,
        projectStartDate: t.project?.startDate ? iso(t.project.startDate) : null,
        projectPackagingDate: t.project?.packagingDate ? iso(t.project.packagingDate) : null,
        groupCode: t.project?.group?.code ?? catalogPgMap.get(`${t.workGroupId}::${t.level3}`)?.code ?? catalogL1ByL2.get(`${t.workGroupId}::${t.level2}`) ?? null,
        groupName: t.project?.group?.name ?? catalogPgMap.get(`${t.workGroupId}::${t.level3}`)?.name ?? catalogL1ByL2.get(`${t.workGroupId}::${t.level2}`) ?? null,
        loaiHinhCode: t.project?.constructionType?.code ?? null,
        disciplineId: t.disciplineId,
        disciplineCode: t.discipline?.code ?? null,
        disciplineName: t.discipline?.name ?? null,
        phaseId: t.phaseId,
        phaseCode: t.phase?.code ?? null,
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
        result: t.result,
        approved: !!t.approvedAt,
        approvedByName: t.approvedBy?.fullName ?? null,
        approverId: t.approverId,
        approverName: t.approver?.fullName ?? null,
        startApproved: !!t.startApprovedAt,
        pendingPlannedEnd: iso(t.pendingPlannedEnd),
        endChangeRequesterId: t.endChangeRequesterId ?? null,
        endChangeRequesterName: t.endChangeRequester?.fullName ?? null,
        endChangeNote: t.endChangeNote ?? null,
        deleteRequestedAt: t.deleteRequestedAt ? t.deleteRequestedAt.toISOString() : null,
        deleteRequesterId: t.deleteRequesterId ?? null,
        deleteRequesterName: t.deleteRequester?.fullName ?? null,
        deleteRequestNote: t.deleteRequestNote ?? null,
        assigneeIds: t.assignees.map((a) => a.userId),
        assigneeNames: t.assignees.map((a) => a.user.fullName),
        completionHistory: t.completionHistory.map((h) => ({
          plannedStart: iso(h.plannedStart),
          plannedEnd: iso(h.plannedEnd),
          actualEnd: iso(h.actualEnd),
          approvedAt: h.approvedAt ? h.approvedAt.toISOString() : null,
          approvedByName: h.approvedBy?.fullName ?? null,
          note: h.note,
        })),
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
