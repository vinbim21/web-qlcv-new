// Đối chiếu/nghiệm thu báo cáo (READ-ONLY). Chạy: npx tsx prisma/verify-reports.ts
import { PrismaClient } from "@prisma/client";
import { effectiveStatus, shouldAutoStart } from "../src/lib/task-status";

const prisma = new PrismaClient();

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

async function main() {
  const active = await prisma.task.count({ where: { deletedAt: null } });
  const leaf = await prisma.task.count({ where: { deletedAt: null, children: { none: {} } } });
  const parents = active - leaf;
  console.log(`[Reconcile] Việc active: ${active} | việc LÁ (vào báo cáo): ${leaf} | việc cha (loại trừ): ${parents}`);

  const noEnd = await prisma.task.count({ where: { deletedAt: null, children: { none: {} }, plannedEnd: null } });
  console.log(`[BC1-3] Việc lá CHƯA CÓ HẠN (bucket riêng): ${noEnd}`);

  const noDisc = await prisma.task.count({
    where: { deletedAt: null, children: { none: {} }, disciplineId: null },
  });
  console.log(`[BC2] Việc lá CHƯA PHÂN PHÒNG (disciplineId null): ${noDisc}`);

  // Trạng thái suy diễn — đối chiếu "Chưa làm" -> "Đang thực hiện"
  const leafTasks = await prisma.task.findMany({
    where: { deletedAt: null, children: { none: {} } },
    select: {
      status: true,
      plannedStart: true,
      plannedEnd: true,
      _count: { select: { assignees: true } },
    },
  });
  const stored: Record<string, number> = {};
  const eff: Record<string, number> = {};
  let pending = 0; // việc còn "Chưa làm" mà ĐÁNG LẼ Đang thực hiện (chưa lưu lại — không cron)
  for (const t of leafTasks) {
    stored[t.status] = (stored[t.status] ?? 0) + 1;
    const e = effectiveStatus({ status: t.status, plannedEnd: iso(t.plannedEnd) });
    eff[e] = (eff[e] ?? 0) + 1;
    if (shouldAutoStart({ status: t.status, plannedStart: iso(t.plannedStart), assigneeCount: t._count.assignees })) {
      pending++;
    }
  }
  console.log(`[Trạng thái] Stored (DB thật):`, stored);
  console.log(`[Trạng thái] Hiển thị (+ overlay Quá hạn):`, eff);
  console.log(`[Trạng thái] Còn Chưa làm nhưng đủ điều kiện Đang thực hiện (chờ lưu lại): ${pending}`);

  // BC4 — dữ liệu định mức hiện có
  const measured = await prisma.task.count({ where: { deletedAt: null, measureNorm: true } });
  const projWithCt = await prisma.project.count({ where: { deletedAt: null, constructionTypeId: { not: null } } });
  const tsForMeasured = await prisma.timeSheetEntry.count({
    where: { deletedAt: null, task: { is: { measureNorm: true } } },
  });
  console.log(
    `[BC4] Việc cần đo ĐM: ${measured} | dự án có loại hình: ${projWithCt} | timesheet của việc đo ĐM: ${tsForMeasured}`,
  );

  // Kiểm tra pipeline định mức KHÔNG phụ thuộc measureNorm (mô phỏng trên toàn bộ timesheet có task+đầu việc)
  const entries = await prisma.timeSheetEntry.findMany({
    where: { deletedAt: null, task: { isNot: null } },
    select: {
      hours: true,
      taskId: true,
      user: { select: { fullName: true } },
      task: { select: { level5: true, project: { select: { constructionType: { select: { name: true } } } } } },
    },
    take: 5000,
  });
  const map = new Map<string, { hours: number; tasks: Set<string> }>();
  for (const e of entries) {
    const k = `${e.user.fullName} | ${e.task?.level5 ?? "(none)"} | ${e.task?.project?.constructionType?.name ?? "(none)"}`;
    let a = map.get(k);
    if (!a) {
      a = { hours: 0, tasks: new Set() };
      map.set(k, a);
    }
    a.hours += Number(e.hours);
    if (e.taskId) a.tasks.add(e.taskId);
  }
  const top = [...map.entries()]
    .map(([k, v]) => ({ k, norm: v.hours / (v.tasks.size || 1), times: v.tasks.size, hours: v.hours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);
  console.log(`[BC4 pipeline] ${entries.length} timesheet có task — top 5 (mô phỏng, bỏ qua cờ measureNorm):`);
  for (const t of top) console.log(`   ${t.k} → ĐM ${t.norm.toFixed(1)} giờ/lần (${t.times} lần, ${t.hours} giờ)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
