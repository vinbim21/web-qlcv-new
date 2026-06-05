// Nghiệm thu "Thời gian theo việc" (READ-ONLY). Chạy: npx tsx prisma/verify-time.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const num = (v: unknown) => Number(v ?? 0);

async function main() {
  const total = await prisma.timeSheetEntry.aggregate({ _sum: { hours: true }, where: { deletedAt: null } });
  const attr = await prisma.timeSheetEntry.aggregate({
    _sum: { hours: true },
    _count: true,
    where: { deletedAt: null, taskId: { not: null } },
  });
  const unattr = await prisma.timeSheetEntry.aggregate({
    _sum: { hours: true },
    where: { deletedAt: null, taskId: null },
  });

  const tHours = num(total._sum.hours);
  const aHours = num(attr._sum.hours);
  const uHours = num(unattr._sum.hours);

  const byTask = await prisma.timeSheetEntry.groupBy({
    by: ["taskId"],
    where: { deletedAt: null, taskId: { not: null } },
    _sum: { hours: true },
  });
  const ids = byTask.map((b) => b.taskId).filter(Boolean) as string[];
  const deletedTasks = await prisma.task.count({ where: { id: { in: ids }, deletedAt: { not: null } } });

  console.log(`[Đối chiếu giờ] Tổng timesheet: ${tHours} | Gắn việc: ${aHours} | Chưa gắn việc: ${uHours}`);
  console.log(`[Đối chiếu giờ] Gắn + Chưa gắn = ${(aHours + uHours).toFixed(2)}  ${Math.abs(aHours + uHours - tHours) < 0.01 ? "✓ khớp" : "✗ LỆCH"}`);
  console.log(`[Thời gian theo việc] Số việc có timesheet: ${byTask.length} (trong đó đã xóa mềm: ${deletedTasks})`);
  console.log(`[Thời gian theo việc] Số lượt chấm gắn việc: ${attr._count}`);

  const top = [...byTask].sort((a, b) => num(b._sum.hours) - num(a._sum.hours)).slice(0, 5);
  const tasks = await prisma.task.findMany({
    where: { id: { in: top.map((t) => t.taskId!) } },
    select: { id: true, sumId: true, name: true },
  });
  const nameOf = new Map(tasks.map((t) => [t.id, `${t.sumId ?? "—"} ${t.name}`]));
  console.log(`[Top 5 việc ngốn giờ]`);
  for (const t of top) console.log(`   ${num(t._sum.hours)} giờ — ${nameOf.get(t.taskId!) ?? t.taskId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
