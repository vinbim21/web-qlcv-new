import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import { canViewPersonReports } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import type { TaskRow } from "./report-data";
import { ReportsTabs } from "./reports-tabs";

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const canViewPerson = canViewPersonReports(session.user.role);
  // Cấp 3: vào được báo cáo nhưng CHỈ thấy dữ liệu của chính mình.
  const selfOnly = !canViewPerson;
  const meId = session.user.id;

  const [tasks, hoursAgg] = await Promise.all([
    // Chỉ đếm VIỆC LÁ (không có việc con) để tránh đếm trùng cha/con.
    prisma.task.findMany({
      where: {
        deletedAt: null,
        children: { none: {} },
        ...(selfOnly ? { assignees: { some: { userId: meId } } } : {}),
      },
      select: {
        id: true,
        sumId: true,
        name: true,
        level5: true,
        workGroupId: true,
        status: true,
        priority: true,
        plannedStart: true,
        plannedEnd: true,
        actualEnd: true,
        workGroup: { select: { name: true, order: true } },
        discipline: { select: { code: true, name: true } },
        project: {
          select: {
            name: true,
            group: { select: { name: true } },
            constructionType: { select: { name: true } },
          },
        },
        assignees: { select: { user: { select: { id: true, fullName: true } } }, orderBy: { roleNo: "asc" } },
      },
      take: 10000,
    }),
    // Giờ công thật theo từng việc (timesheet). selfOnly → chỉ giờ của chính mình.
    prisma.timeSheetEntry.groupBy({
      by: ["taskId"],
      where: { deletedAt: null, taskId: { not: null }, ...(selfOnly ? { userId: meId } : {}) },
      _sum: { hours: true },
    }),
  ]);

  const hoursByTask = new Map(hoursAgg.map((h) => [h.taskId as string, Number(h._sum.hours ?? 0)]));

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    ma: t.sumId,
    duAn: t.project?.group?.name ?? "—",
    loaiHinh: t.project?.constructionType?.name ?? "",
    hangMuc: t.project?.name ?? "",
    congViec: t.level5 || t.name,
    boMon: t.discipline?.name ?? "",
    boMonCode: t.discipline?.code ?? null,
    thucHien: t.assignees.map((a) => a.user.fullName),
    thucHienIds: t.assignees.map((a) => a.user.id),
    groupId: t.workGroupId,
    groupName: t.workGroup.name,
    groupOrder: t.workGroup.order,
    uuTien: t.priority,
    tinhTrang: t.status,
    batDau: iso(t.plannedStart),
    ketThuc: iso(t.plannedEnd),
    thucTe: iso(t.actualEnd),
    hours: hoursByTask.get(t.id) ?? 0,
  }));

  return <ReportsTabs rows={rows} canViewPerson={canViewPerson} selfOnly={selfOnly} />;
}
