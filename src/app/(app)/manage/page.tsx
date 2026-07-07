import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";
import { canAssign, canManage } from "@/server/auth/permissions";
import { getTaskLookups } from "@/server/data/task-lookups";
import { ManageClient } from "./manage-client";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const manage = canManage(session.user.role);
  const assign = canAssign(session.user.role);

  // Deep-link từ Báo cáo: lấy ?user/group/phong/from/to (server-side → SSR-safe, không cần useSearchParams).
  const sp = await searchParams;
  const pick = (k: string): string => {
    const v = sp[k];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };
  const initial = {
    user: pick("user"),
    group: pick("group"),
    phong: pick("phong"),
    from: pick("from"),
    to: pick("to"),
  };

  const [tasks, hoursByTask, lookups, catalogL3, constructionTypes] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null },
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
    prisma.timeSheetEntry.groupBy({
      by: ["taskId"],
      where: { taskId: { not: null }, deletedAt: null },
      _sum: { hours: true },
    }),
    getTaskLookups(),
    prisma.catalogItem.findMany({
      where: { level: 3, projectGroupId: { not: null } },
      select: { workGroupId: true, value: true, projectGroup: { select: { code: true, name: true } } },
    }),
    prisma.constructionType.findMany({ orderBy: { order: "asc" } }),
  ]);
  const hoursMap = new Map(hoursByTask.map((h) => [h.taskId!, Number(h._sum.hours ?? 0)]));

  // Chi tiết giờ theo từng lần hoàn thành (chỉ với việc từng "Cập nhật công việc") — để hover
  // cột Thời gian thấy tách bạch giờ của lần hoàn thành trước và lần đang làm hiện tại.
  const taskIdsWithHistory = tasks.filter((t) => t.completionHistory.length > 0).map((t) => t.id);
  const entriesForHistoryTasks = taskIdsWithHistory.length
    ? await prisma.timeSheetEntry.findMany({
        where: { taskId: { in: taskIdsWithHistory }, deletedAt: null },
        select: { taskId: true, date: true, hours: true },
      })
    : [];
  const entriesByTask = new Map<string, { date: Date; hours: number }[]>();
  for (const e of entriesForHistoryTasks) {
    const arr = entriesByTask.get(e.taskId!) ?? [];
    arr.push({ date: e.date, hours: Number(e.hours) });
    entriesByTask.set(e.taskId!, arr);
  }
  function computeHoursBreakdown(
    taskId: string,
    history: { createdAt: Date; actualEnd: Date | null }[],
  ): { seq: number; completedOn: string | null; hours: number }[] {
    const entries = entriesByTask.get(taskId);
    if (!entries?.length || !history.length) return [];
    const sorted = [...history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const segments: { seq: number; completedOn: string | null; hours: number }[] = [];
    let prevBoundary: Date | null = null;
    for (const [i, h] of sorted.entries()) {
      const sum = entries
        .filter((e) => (!prevBoundary || e.date >= prevBoundary) && e.date < h.createdAt)
        .reduce((s, e) => s + e.hours, 0);
      segments.push({ seq: i + 1, completedOn: h.actualEnd ? iso(h.actualEnd) : null, hours: sum });
      prevBoundary = h.createdAt;
    }
    const currentSum = entries
      .filter((e) => !prevBoundary || e.date >= prevBoundary)
      .reduce((s, e) => s + e.hours, 0);
    segments.push({ seq: sorted.length + 1, completedOn: null, hours: currentSum });
    return segments;
  }
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
    <ManageClient
      // Đổi deep-link (từ Báo cáo) → key đổi → remount để seed lại bộ lọc đúng tham số mới.
      key={`${initial.user}|${initial.group}|${initial.phong}|${initial.from}|${initial.to}`}
      initial={initial}
      currentUserId={session.user.id}
      canManage={manage}
      canAssign={assign}
      tasks={tasks.map((t) => ({
        id: t.id,
        sumId: t.sumId,
        seq: t.seq,
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
        measureNorm: t.measureNorm,
        approved: !!t.approvedAt,
        approvedByName: t.approvedBy?.fullName ?? null,
        approverId: t.approverId,
        approverName: t.approver?.fullName ?? null,
        startApproved: !!t.startApprovedAt,
        pendingPlannedEnd: t.pendingPlannedEnd ? iso(t.pendingPlannedEnd) : null,
        endChangeRequesterId: t.endChangeRequesterId ?? null,
        endChangeRequesterName: t.endChangeRequester?.fullName ?? null,
        endChangeNote: t.endChangeNote ?? null,
        deleteRequestedAt: t.deleteRequestedAt ? t.deleteRequestedAt.toISOString() : null,
        deleteRequesterId: t.deleteRequesterId ?? null,
        deleteRequesterName: t.deleteRequester?.fullName ?? null,
        deleteRequestNote: t.deleteRequestNote ?? null,
        assigneeIds: t.assignees.map((a) => a.userId),
        assigneeNames: t.assignees.map((a) => a.user.fullName),
        totalHours: hoursMap.get(t.id) ?? 0,
        hoursBreakdown: computeHoursBreakdown(t.id, t.completionHistory),
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
      constructionTypes={constructionTypes.map((ct) => ({ id: ct.id, code: ct.code, name: ct.name }))}
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
