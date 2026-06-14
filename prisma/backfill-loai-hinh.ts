/**
 * Suy "Loại hình công trình" cho từng Hạng mục (= model Project) từ mã dự án.
 * Quy tắc: mã là chuỗi phân cấp (B.DSHNQN.STA…); một trong các segment trùng
 * với ConstructionType.code (STA=Nhà ga, BRG=Cầu, NOXH.CT=Nhà ở xã hội cao tầng…).
 * → gán Project.constructionTypeId theo segment khớp. Ưu tiên mã loại DÀI hơn
 * (NOXH.CT trước CT) để chính xác hơn. Mã không khớp → để null (điền tay sau).
 *
 * An toàn chạy lại (idempotent). CHẠY LOCAL: npx tsx prisma/backfill-loai-hinh.ts
 */
import { prisma } from "@/server/db/client";

async function main() {
  const cts = await prisma.constructionType.findMany({ select: { id: true, code: true, name: true } });
  // Ưu tiên mã dài hơn (nhiều segment) để khớp cụ thể nhất.
  cts.sort((a, b) => b.code.length - a.code.length);

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, constructionTypeId: true },
  });

  let assigned = 0;
  let unchanged = 0;
  const skipped: string[] = [];
  const byType = new Map<string, number>();

  for (const p of projects) {
    const padded = `.${p.code}.`;
    const hit = cts.find((c) => padded.includes(`.${c.code}.`));
    if (!hit) {
      if (!skipped.includes(p.code)) skipped.push(p.code);
      continue;
    }
    byType.set(hit.name, (byType.get(hit.name) ?? 0) + 1);
    if (p.constructionTypeId === hit.id) {
      unchanged++;
      continue;
    }
    await prisma.project.update({ where: { id: p.id }, data: { constructionTypeId: hit.id } });
    assigned++;
  }

  console.log(`Hạng mục: ${projects.length} · gán mới: ${assigned} · đã đúng sẵn: ${unchanged} · bỏ qua (không khớp): ${projects.filter((p) => !cts.some((c) => `.${p.code}.`.includes(`.${c.code}.`))).length}`);
  console.log("Mã KHÔNG khớp (để null, điền tay):", skipped.sort().join(", ") || "(không có)");
  console.log("Phân bố Loại hình đã gán:");
  for (const [name, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
