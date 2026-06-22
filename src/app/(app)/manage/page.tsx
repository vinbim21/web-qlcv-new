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

  const [tasks, lookups, catalogL3] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null },
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
    prisma.catalogItem.findMany({
      where: { level: 3, projectGroupId: { not: null } },
      select: { workGroupId: true, value: true, projectGroup: { select: { code: true, name: true } } },
    }),
  ]);
  const catalogPgMap = new Map(
    catalogL3.map((c) => [`${c.workGroupId}::${c.value}`, c.projectGroup]),
  );

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
        groupCode: t.project?.group?.code ?? catalogPgMap.get(`${t.workGroupId}::${t.level3}`)?.code ?? null,
        groupName: t.project?.group?.name ?? catalogPgMap.get(`${t.workGroupId}::${t.level3}`)?.name ?? null,
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
        measureNorm: t.measureNorm,
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
      catalog={lookups.catalog}
    />
  );
}
