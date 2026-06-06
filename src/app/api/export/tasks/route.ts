import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { canViewPersonReports } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const sp = req.nextUrl.searchParams;
  const where: Record<string, unknown> = { deletedAt: null };
  if (sp.get("workGroupId")) where.workGroupId = sp.get("workGroupId");
  if (sp.get("projectId")) where.projectId = sp.get("projectId");
  if (sp.get("disciplineId")) where.disciplineId = sp.get("disciplineId");
  // Cấp 3: chỉ xuất việc của chính mình (ép ở server, không phụ thuộc tham số URL).
  if (!canViewPersonReports(session.user.role)) {
    where.assignees = { some: { userId: session.user.id } };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      workGroup: true,
      discipline: true,
      phase: true,
      project: true,
      assignees: { include: { user: true }, orderBy: { roleNo: "asc" } },
    },
    orderBy: [{ workGroupId: "asc" }, { createdAt: "asc" }],
    take: 10000,
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cong viec");
  ws.columns = [
    { header: "Mã", key: "sumId", width: 24 },
    { header: "Nhóm công việc", key: "wg", width: 20 },
    { header: "Hạng mục", key: "l2", width: 20 },
    { header: "Chi tiết", key: "l3", width: 24 },
    { header: "Đầu việc", key: "l5", width: 24 },
    { header: "Dự án", key: "project", width: 24 },
    { header: "Bộ môn", key: "discipline", width: 14 },
    { header: "Giai đoạn", key: "phase", width: 12 },
    { header: "Ưu tiên", key: "priority", width: 12 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Người thực hiện", key: "assignees", width: 30 },
    { header: "Bắt đầu", key: "start", width: 12 },
    { header: "Kết thúc", key: "end", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const t of tasks) {
    ws.addRow({
      sumId: t.sumId ?? "",
      wg: t.workGroup.name,
      l2: t.level2 ?? "",
      l3: t.level3 ?? "",
      l5: t.level5 ?? "",
      project: t.project?.name ?? "",
      discipline: t.discipline?.name ?? "",
      phase: t.phase?.name ?? "",
      priority: PRIORITY_LABEL[t.priority] ?? t.priority,
      status: TASK_STATUS_LABEL[t.status] ?? t.status,
      assignees: t.assignees.map((a) => a.user.fullName).join(", "),
      start: t.plannedStart ? t.plannedStart.toISOString().slice(0, 10) : "",
      end: t.plannedEnd ? t.plannedEnd.toISOString().slice(0, 10) : "",
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cong-viec-${Date.now()}.xlsx"`,
    },
  });
}
