import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";
import { startOfWeek, weekDays } from "@/lib/timesheet";
import { TimesheetClient } from "./timesheet-client";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const sp = await searchParams;
  const ws = startOfWeek(sp.week ?? new Date());
  const days = weekDays(ws);
  const start = days[0]!.toDate();
  const end = days[6]!.endOf("day").toDate();

  const [entries, myTasks, catalogL12] = await Promise.all([
    prisma.timeSheetEntry.findMany({
      where: { userId, deletedAt: null, date: { gte: start, lte: end } },
      include: { task: { include: { discipline: true, project: { include: { group: true, constructionType: true } } } } },
      orderBy: { date: "asc" },
    }),
    prisma.task.findMany({
      where: { deletedAt: null, assignees: { some: { userId } } },
      orderBy: { name: "asc" },
      take: 500,
      include: { workGroup: true, discipline: true, project: { include: { group: true, constructionType: true } } },
    }),
    // Catalog L1/L2/L3: tra mã dự án cho nhóm không có projectId (HTTC BIM, Đào tạo...)
    prisma.catalogItem.findMany({
      where: { level: { in: [1, 2, 3] } },
      select: {
        id: true, workGroupId: true, level: true, value: true, parentId: true,
        projectGroup: { select: { code: true } },
      },
    }),
  ]);

  // L2 → L1 (cho Đào tạo, nhóm chỉ có catalog thuần, không có projectGroup)
  const l1ValById = new Map<string, string>();
  for (const c of catalogL12) {
    if (c.level === 1) l1ValById.set(c.id, c.value);
  }
  const l1ByWgL2 = new Map<string, string>(); // `wgId::l2` → l1code
  for (const c of catalogL12) {
    if (c.level === 2 && c.parentId) {
      const l1 = l1ValById.get(c.parentId);
      if (l1) l1ByWgL2.set(`${c.workGroupId}::${c.value}`, l1);
    }
  }
  // L3 → projectGroup.code (cho HTTC BIM: L3 gắn trực tiếp vào projectGroup)
  const pgByWgL3 = new Map<string, string>(); // `wgId::l3` → projectGroup.code
  for (const c of catalogL12) {
    if (c.level === 3 && c.projectGroup?.code) {
      pgByWgL3.set(`${c.workGroupId}::${c.value}`, c.projectGroup.code);
    }
  }

  return (
    <TimesheetClient
      weekStartISO={ws.format("YYYY-MM-DD")}
      isAdmin={session.user.role === "ADMIN"}
      entries={entries.map((e) => {
        const tsk = e.task;
        // Với task có dự án (QL/TT): lấy project.group.code + constructionType.code
        // Với task không có dự án (HTTC BIM, Đào tạo...): level1 catalog ← l2, level2 ← l3
        const groupCode = tsk?.project?.group?.code
          ?? (tsk ? pgByWgL3.get(`${tsk.workGroupId}::${tsk.level3 ?? ""}`) : null)
          ?? (tsk ? l1ByWgL2.get(`${tsk.workGroupId}::${tsk.level2 ?? ""}`) : null)
          ?? null;
        const loaiHinhCode = tsk?.project?.constructionType?.code ?? tsk?.level2 ?? null;
        return {
          id: e.id,
          taskId: e.taskId,
          taskName: tsk?.name ?? null,
          disciplineCode: tsk?.discipline?.code ?? null,
          projectCode: groupCode,
          loaiHinhCode,
          hangMuc: tsk?.level3 ?? null,
          taskGroupCode: groupCode,
          taskLoaiHinhCode: loaiHinhCode,
          taskLevel3: tsk?.level3 ?? null,
          date: e.date.toISOString().slice(0, 10),
          hours: Number(e.hours),
          note: e.note,
        };
      })}
      tasks={myTasks.map((t) => ({
        id: t.id,
        name: t.name,
        groupCode: t.project?.group?.code
          ?? pgByWgL3.get(`${t.workGroupId}::${t.level3 ?? ""}`)
          ?? l1ByWgL2.get(`${t.workGroupId}::${t.level2 ?? ""}`)
          ?? null,
        loaiHinhCode: t.project?.constructionType?.code ?? t.level2 ?? null,
        level3: t.level3 ?? null,
        disciplineCode: t.discipline?.code ?? null,
      }))}
    />
  );
}
