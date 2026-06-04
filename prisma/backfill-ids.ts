/**
 * Áp schema + backfill cho tính năng Id công việc theo nhóm (XD-001).
 * Tự chứa, idempotent, dùng DDL tường minh (không cần `prisma db push`):
 *  1) Thêm cột WorkGroup.abbr, WorkGroup.lastSeq, Task.seq (IF NOT EXISTS).
 *  2) Thêm unique index trùng tên Prisma sinh (khỏi lệch schema sau này).
 *  3) Đánh seq cho Task theo thứ tự tạo (createdAt) mỗi nhóm; set lastSeq = max(seq).
 *  4) Gán viết tắt mặc định theo mã nhóm nếu chưa có.
 *
 * Chạy: `npx tsx prisma/backfill-ids.ts`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Viết tắt mặc định theo mã nhóm (1..7). Chỉ áp khi nhóm chưa có abbr.
const ABBR_BY_CODE: Record<string, string> = {
  "1": "XD", // Xây dựng HTTC BIM
  "2": "DT", // Đào tạo BIM
  "3": "QL", // Quản lý BIM
  "4": "TT", // Thanh tra BIM
  "5": "PT", // Phát triển BIM Tools
  "6": "PM", // Quản lý phần mềm
  "7": "CK", // Công việc khác
};

async function main() {
  // 1) Cột mới (an toàn: nullable / có default; không mất dữ liệu).
  await prisma.$executeRawUnsafe(`ALTER TABLE "WorkGroup" ADD COLUMN IF NOT EXISTS "abbr" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "WorkGroup" ADD COLUMN IF NOT EXISTS "lastSeq" INTEGER NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "seq" INTEGER;`);

  // 2) Unique index (tên trùng convention Prisma → không drift với schema.prisma).
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "WorkGroup_abbr_key" ON "WorkGroup"("abbr");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Task_workGroupId_seq_key" ON "Task"("workGroupId", "seq");`);

  // 3) Đánh seq cho task chưa có (1..n mỗi nhóm theo thứ tự tạo).
  await prisma.$executeRawUnsafe(`
    UPDATE "Task" t SET "seq" = s.rn
    FROM (
      SELECT id, row_number() OVER (PARTITION BY "workGroupId" ORDER BY "createdAt" ASC, id ASC) AS rn
      FROM "Task"
    ) s
    WHERE t.id = s.id AND t."seq" IS NULL;
  `);
  // lastSeq = số seq lớn nhất hiện có mỗi nhóm (để cấp tiếp khi giao việc).
  await prisma.$executeRawUnsafe(`
    UPDATE "WorkGroup" w
    SET "lastSeq" = COALESCE((SELECT MAX(t."seq") FROM "Task" t WHERE t."workGroupId" = w.id), 0);
  `);

  // 4) Viết tắt theo mã (chỉ khi đang NULL).
  for (const [code, abbr] of Object.entries(ABBR_BY_CODE)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "WorkGroup" SET "abbr" = $1 WHERE "code" = $2 AND "abbr" IS NULL;`,
      abbr,
      code,
    );
  }

  // In kết quả.
  const rows = await prisma.$queryRawUnsafe<
    { code: string; name: string; abbr: string | null; lastSeq: number }[]
  >(`SELECT "code", "name", "abbr", "lastSeq" FROM "WorkGroup" ORDER BY "code" ASC;`);
  for (const g of rows) {
    console.log(`[${g.code}] ${g.name}: abbr=${g.abbr ?? "—"} lastSeq=${g.lastSeq}`);
  }
  console.log("Áp schema + backfill xong.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
