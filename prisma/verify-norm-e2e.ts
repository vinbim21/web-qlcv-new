// E2E định mức trong transaction TỰ ROLLBACK (không ghi DB). Chạy: npx tsx prisma/verify-norm-e2e.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
class Rollback extends Error {}

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      // Chọn vài việc có timesheet + có dự án để gán loại hình.
      const tasksWithTs = await tx.timeSheetEntry.findMany({
        where: { deletedAt: null, task: { isNot: null } },
        select: { taskId: true, task: { select: { projectId: true } } },
        take: 200,
      });
      const taskIds = [...new Set(tasksWithTs.map((t) => t.taskId).filter(Boolean) as string[])];
      const projIds = [...new Set(tasksWithTs.map((t) => t.task?.projectId).filter(Boolean) as string[])];
      console.log(`Mô phỏng: bật measureNorm cho ${taskIds.length} việc, gán loại hình cho ${projIds.length} dự án.`);

      const ct = await tx.constructionType.findFirst({ orderBy: { order: "asc" } });
      await tx.task.updateMany({ where: { id: { in: taskIds } }, data: { measureNorm: true } });
      if (ct && projIds.length)
        await tx.project.updateMany({ where: { id: { in: projIds } }, data: { constructionTypeId: ct.id } });

      // Chạy ĐÚNG truy vấn của BC4 (lọc measureNorm).
      const entries = await tx.timeSheetEntry.findMany({
        where: { deletedAt: null, task: { is: { measureNorm: true, deletedAt: null } } },
        select: {
          hours: true,
          taskId: true,
          user: { select: { fullName: true } },
          task: { select: { level5: true, name: true, project: { select: { constructionType: { select: { name: true } } } } } },
        },
      });
      const map = new Map<string, { hours: number; tasks: Set<string> }>();
      for (const e of entries) {
        const k = `${e.user.fullName} | ${e.task?.level5 || e.task?.name} | ${e.task?.project?.constructionType?.name ?? "Chưa gán"}`;
        let a = map.get(k);
        if (!a) { a = { hours: 0, tasks: new Set() }; map.set(k, a); }
        a.hours += Number(e.hours);
        if (e.taskId) a.tasks.add(e.taskId);
      }
      const rows = [...map.entries()].map(([k, v]) => ({ k, norm: v.hours / (v.tasks.size || 1), times: v.tasks.size }));
      console.log(`BC4 (lọc measureNorm) cho ${rows.length} dòng. Top 5 theo định mức:`);
      for (const r of rows.sort((a, b) => b.norm - a.norm).slice(0, 5))
        console.log(`   ${r.k} → ${r.norm.toFixed(1)} giờ/lần (${r.times} lần)`);

      throw new Rollback(); // hủy mọi thay đổi
    });
  } catch (e) {
    if (e instanceof Rollback) console.log("→ Đã ROLLBACK, DB không đổi.");
    else throw e;
  }
  const stillMeasured = await prisma.task.count({ where: { measureNorm: true } });
  console.log(`Kiểm tra sau rollback: việc measureNorm=true còn lại = ${stillMeasured} (kỳ vọng 0).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
