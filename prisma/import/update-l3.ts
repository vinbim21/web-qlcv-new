/**
 * Cập nhật RIÊNG trường `level3` (Chi tiết / Level 3) cho các task, khớp theo `sumId`.
 *
 * Quy trình:
 *   1) python prisma/import/extract.py   -> tạo data.json (đã có sumId + l3)
 *   2) tsx prisma/import/update-l3.ts     -> chỉ ghi level3, không đụng gì khác
 *   (hoặc gộp: pnpm import:l3)
 *
 * An toàn:
 *   - CHỈ cập nhật `level3`. KHÔNG chạm name / project / assignees / timesheet / deletedAt.
 *   - Bỏ qua dòng có l3 rỗng (không ghi đè giá trị cũ bằng trống).
 *   - Backup level3 hiện tại (id, sumId, level3) ra file JSON trước khi ghi -> có thể khôi phục.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DATA = path.join(process.cwd(), "prisma", "import", "data.json");

type TaskJson = { sumId: string; l3: string };

async function main() {
  if (!fs.existsSync(DATA)) {
    throw new Error("Chưa có data.json. Chạy trước: python prisma/import/extract.py");
  }
  const { tasks } = JSON.parse(fs.readFileSync(DATA, "utf-8")) as { tasks: TaskJson[] };

  // Gom sumId -> l3 (l3 không rỗng). Ghi nhận xung đột nếu cùng sumId mà l3 khác nhau.
  const bySum = new Map<string, string>();
  const conflicts: Array<{ sumId: string; a: string; b: string }> = [];
  let skippedEmpty = 0;
  for (const t of tasks) {
    const sumId = (t.sumId || "").trim();
    const l3 = (t.l3 || "").trim();
    if (!sumId) continue;
    if (!l3) {
      skippedEmpty++;
      continue;
    }
    const prev = bySum.get(sumId);
    if (prev !== undefined && prev !== l3) conflicts.push({ sumId, a: prev, b: l3 });
    bySum.set(sumId, l3);
  }

  // ----- Backup level3 hiện tại trước khi ghi -----
  const current = await prisma.task.findMany({
    where: { sumId: { in: [...bySum.keys()] } },
    select: { id: true, sumId: true, level3: true },
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(process.cwd(), "prisma", "import", `backup-l3-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(current, null, 2), "utf-8");
  console.log(`Backup ${current.length} bản ghi level3 hiện tại -> ${backupPath}`);

  // ----- Cập nhật từng sumId -----
  let updated = 0; // số bản ghi DB thực sự đổi
  let matchedSum = 0; // số sumId tìm thấy ít nhất 1 task
  const notFound: string[] = [];
  for (const [sumId, l3] of bySum) {
    const res = await prisma.task.updateMany({
      where: { sumId, deletedAt: null },
      data: { level3: l3 },
    });
    if (res.count > 0) {
      matchedSum++;
      updated += res.count;
    } else {
      notFound.push(sumId);
    }
  }

  console.log("──────── KẾT QUẢ ────────");
  console.log(`Tổng sumId có l3 trong file : ${bySum.size}`);
  console.log(`sumId khớp & cập nhật        : ${matchedSum}`);
  console.log(`Bản ghi DB đã đổi level3     : ${updated}`);
  console.log(`Dòng bỏ qua (l3 rỗng)        : ${skippedEmpty}`);
  console.log(`sumId KHÔNG tìm thấy trong DB: ${notFound.length}`);
  if (notFound.length) {
    console.log("   " + notFound.slice(0, 40).join(", ") + (notFound.length > 40 ? " ..." : ""));
  }
  if (conflicts.length) {
    console.log(`⚠ ${conflicts.length} sumId có l3 mâu thuẫn trong file (giá trị sau cùng được dùng):`);
    for (const c of conflicts.slice(0, 20)) console.log(`   · ${c.sumId}: "${c.a}" -> "${c.b}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
