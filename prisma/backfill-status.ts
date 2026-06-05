// Backfill 1 lần: việc "Chưa làm" đã giao người & đã tới ngày bắt đầu -> "Đang thực hiện".
// Xem trước (không ghi): npx tsx prisma/backfill-status.ts --dry
// Chạy thật:            npx tsx prisma/backfill-status.ts
import { PrismaClient } from "@prisma/client";
import { shouldAutoStart } from "../src/lib/task-status";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

async function main() {
  // Ứng viên: Chưa làm, có người, có ngày bắt đầu (đã tới sẽ lọc bằng shouldAutoStart).
  const candidates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: "CHUA_LAM",
      plannedStart: { not: null },
      assignees: { some: {} },
    },
    select: { id: true, plannedStart: true, _count: { select: { assignees: true } } },
  });

  const ids = candidates
    .filter((t) =>
      shouldAutoStart({
        status: "CHUA_LAM",
        plannedStart: iso(t.plannedStart),
        assigneeCount: t._count.assignees,
      }),
    )
    .map((t) => t.id);

  console.log(`Ứng viên (Chưa làm + có người + có ngày bắt đầu): ${candidates.length}`);
  console.log(`Đủ điều kiện (ngày bắt đầu ≤ hôm nay) -> Đang thực hiện: ${ids.length}`);

  if (DRY) {
    console.log("[DRY] Không ghi DB.");
    return;
  }
  if (ids.length === 0) {
    console.log("Không có việc nào cần đổi.");
    return;
  }
  const res = await prisma.task.updateMany({
    where: { id: { in: ids } },
    data: { status: "DANG_LAM" },
  });
  console.log(`Đã cập nhật ${res.count} việc -> DANG_LAM.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
