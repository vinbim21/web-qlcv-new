/**
 * Fix WorkGroup.lastSeq bị lệch so với seq thực tế trong Task.
 * Chạy: npx tsx scripts/fix-lastseq.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Lấy max(seq) theo từng workgroup — GỒM CẢ task đã soft-delete
  // vì unique constraint (workGroupId, seq) không có điều kiện deletedAt.
  const rows = await prisma.$queryRaw<{ workGroupId: string; maxSeq: number }[]>`
    SELECT "workGroupId", COALESCE(MAX(seq), 0)::int AS "maxSeq"
    FROM "Task"
    GROUP BY "workGroupId"
  `;

  console.log("Kết quả max seq theo workgroup:");
  for (const r of rows) {
    const wg = await prisma.workGroup.findUnique({ where: { id: r.workGroupId }, select: { name: true, lastSeq: true } });
    console.log(`  ${wg?.name ?? r.workGroupId}: lastSeq hiện tại=${wg?.lastSeq}, max seq trong DB=${r.maxSeq}`);
  }

  const toUpdate = rows.filter((r) => {
    // Cần update tất cả (lastSeq có thể cao hơn nếu task bị xóa — giữ nguyên)
    return true;
  });

  console.log("\nĐang cập nhật...");
  for (const r of toUpdate) {
    const wg = await prisma.workGroup.findUnique({ where: { id: r.workGroupId }, select: { name: true, lastSeq: true } });
    const newSeq = Math.max(wg?.lastSeq ?? 0, r.maxSeq);
    await prisma.workGroup.update({
      where: { id: r.workGroupId },
      data: { lastSeq: newSeq },
    });
    console.log(`  ✓ ${wg?.name}: ${wg?.lastSeq} → ${newSeq}`);
  }

  console.log("\nHoàn thành.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
