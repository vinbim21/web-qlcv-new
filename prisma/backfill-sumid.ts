// Backfill Id công việc (sumId) cho các việc cũ đang trống Mã.
// Ghép "<abbr|code nhóm>-<seq 3 số>"; việc thiếu cả seq sẽ được cấp seq mới (tăng lastSeq nhóm).
// Chỉ đụng việc đang TRỐNG sumId — không sửa việc đã có Id. Chạy: npx tsx prisma/backfill-sumid.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const codeOf = (prefix: string, seq: number) => `${prefix}-${String(seq).padStart(3, "0")}`;

async function main() {
  // Việc thiếu Mã (null hoặc rỗng), gồm cả việc đã xóa mềm để dữ liệu nhất quán.
  const missing = await prisma.task.findMany({
    where: { OR: [{ sumId: null }, { sumId: "" }] },
    select: {
      id: true,
      seq: true,
      workGroupId: true,
      workGroup: { select: { abbr: true, code: true } },
    },
    orderBy: [{ workGroupId: "asc" }, { seq: "asc" }, { createdAt: "asc" }],
  });

  if (missing.length === 0) {
    console.log("[Backfill] Không có việc nào thiếu Mã. Bỏ qua.");
    return;
  }

  // Gom theo nhóm để cấp seq mới (nếu cần) một cách liên tục.
  const byGroup = new Map<string, typeof missing>();
  for (const t of missing) {
    const list = byGroup.get(t.workGroupId);
    if (list) list.push(t);
    else byGroup.set(t.workGroupId, [t]);
  }

  let filledHasSeq = 0;
  let filledNewSeq = 0;

  await prisma.$transaction(async (tx) => {
    for (const [workGroupId, tasks] of byGroup) {
      const prefix = tasks[0]!.workGroup.abbr || tasks[0]!.workGroup.code || "WG";
      const withSeq = tasks.filter((t) => t.seq != null);
      const noSeq = tasks.filter((t) => t.seq == null);

      // (1) Có seq sẵn → chỉ ghép Mã.
      for (const t of withSeq) {
        await tx.task.update({ where: { id: t.id }, data: { sumId: codeOf(prefix, t.seq as number) } });
        filledHasSeq++;
      }

      // (2) Thiếu seq → cấp dải seq mới nối tiếp lastSeq của nhóm.
      if (noSeq.length > 0) {
        const wg = await tx.workGroup.update({
          where: { id: workGroupId },
          data: { lastSeq: { increment: noSeq.length } },
          select: { lastSeq: true },
        });
        const firstSeq = wg.lastSeq - noSeq.length + 1;
        for (let k = 0; k < noSeq.length; k++) {
          const seq = firstSeq + k;
          await tx.task.update({
            where: { id: noSeq[k]!.id },
            data: { seq, sumId: codeOf(prefix, seq) },
          });
          filledNewSeq++;
        }
      }
    }
  });

  console.log(`[Backfill] Tổng việc thiếu Mã: ${missing.length}`);
  console.log(`[Backfill]   • Điền từ seq sẵn có: ${filledHasSeq}`);
  console.log(`[Backfill]   • Cấp seq mới + Mã:   ${filledNewSeq}`);
  console.log(`[Backfill] Hoàn tất.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
