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

  const [entries, myTasks] = await Promise.all([
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
  ]);

  return (
    <TimesheetClient
      weekStartISO={ws.format("YYYY-MM-DD")}
      isAdmin={session.user.role === "ADMIN"}
      entries={entries.map((e) => ({
        id: e.id,
        taskId: e.taskId,
        taskName: e.task?.name ?? null,
        disciplineCode: e.task?.discipline?.code ?? null,
        projectCode: e.task?.project?.group?.code ?? null,
        loaiHinhCode: e.task?.project?.constructionType?.code ?? null,
        hangMuc: e.task?.level3 ?? null,
        taskGroupCode: e.task?.project?.group?.code ?? null,
        taskLoaiHinhCode: e.task?.project?.constructionType?.code ?? null,
        taskLevel3: e.task?.level3 ?? null,
        date: e.date.toISOString().slice(0, 10),
        hours: Number(e.hours),
        note: e.note,
      }))}
      tasks={myTasks.map((t) => ({
        id: t.id,
        name: t.name,
        groupCode: t.project?.group?.code ?? null,
        loaiHinhCode: t.project?.constructionType?.code ?? null,
        level3: t.level3 ?? null,
        disciplineCode: t.discipline?.code ?? null,
      }))}
    />
  );
}
