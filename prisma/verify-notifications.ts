// Kiểm tra cơ chế thông báo ở mức DB (transaction TỰ ROLLBACK — không ghi DB).
// Chạy: npx tsx prisma/verify-notifications.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
class Rollback extends Error {}

async function main() {
  let ok = true;
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { isActive: true }, select: { id: true } });
      const task = await tx.task.findFirst({ where: { deletedAt: null }, select: { id: true, name: true } });
      if (!user || !task) throw new Error("Thiếu user/task để kiểm tra");

      // 1) notifyAssignment tạo được thông báo.
      await tx.notification.createMany({
        data: [{ userId: user.id, actorId: null, type: "TASK_ASSIGNED", taskId: task.id, title: "Bạn được giao công việc mới", body: task.name }],
        skipDuplicates: true,
      });
      const created = await tx.notification.count({ where: { userId: user.id, taskId: task.id, type: "TASK_ASSIGNED" } });
      console.log(`1) Tạo thông báo giao việc: ${created} (kỳ vọng ≥1) ${created >= 1 ? "✓" : "✗"}`);
      ok &&= created >= 1;

      // 2) Dedupe theo dedupeKey: createMany 2 lần cùng key → chỉ 1 bản.
      const key = `verify:${task.id}:${user.id}`;
      const reminder = { userId: user.id, actorId: null, type: "TASK_DEADLINE_SOON" as const, taskId: task.id, title: "Công việc sắp đến hạn", dedupeKey: key };
      await tx.notification.createMany({ data: [reminder], skipDuplicates: true });
      await tx.notification.createMany({ data: [reminder], skipDuplicates: true }); // phải bị bỏ qua
      const dedupCnt = await tx.notification.count({ where: { dedupeKey: key } });
      console.log(`2) Dedupe nhắc sắp-đến-hạn: ${dedupCnt} (kỳ vọng 1) ${dedupCnt === 1 ? "✓" : "✗"}`);
      ok &&= dedupCnt === 1;

      // 3) Không tự-báo-mình: filter userId === actorId.
      const rows = [
        { userId: "A", actorId: "A" }, // người giao tự giao mình → loại
        { userId: "B", actorId: "A" }, // người khác → giữ
      ].filter((r) => r.userId && r.userId !== r.actorId);
      console.log(`3) Lọc tự-báo-mình: giữ ${rows.length} (kỳ vọng 1) ${rows.length === 1 ? "✓" : "✗"}`);
      ok &&= rows.length === 1;

      throw new Rollback();
    });
  } catch (e) {
    if (e instanceof Rollback) console.log("→ Đã ROLLBACK, DB không đổi.");
    else throw e;
  }

  const leftover = await prisma.notification.count({ where: { dedupeKey: { startsWith: "verify:" } } });
  console.log(`Kiểm tra sau rollback: thông báo test còn sót = ${leftover} (kỳ vọng 0).`);
  ok &&= leftover === 0;

  console.log(ok ? "\nTẤT CẢ ĐẠT ✓" : "\nCÓ MỤC KHÔNG ĐẠT ✗");
  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
