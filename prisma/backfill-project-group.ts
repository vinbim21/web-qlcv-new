/**
 * Backfill ProjectGroup (Dự án cha) từ các mã (code) hiện có của Project (Hạng mục).
 * Quy tắc đã chốt: 1 mã = 1 Dự án; tên dự án seed tạm = mã (người dùng sửa sau).
 *
 * An toàn để chạy lại nhiều lần (idempotent): chỉ tạo group còn thiếu + gán groupId còn null.
 * CHẠY LOCAL: `npx tsx prisma/backfill-project-group.ts`
 */
import { prisma } from "@/server/db/client";

async function main() {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, groupId: true },
  });

  const codes = [...new Set(projects.map((p) => p.code))].sort((a, b) => a.localeCompare(b, "vi"));
  console.log(`Tổng hạng mục: ${projects.length} · mã khác nhau: ${codes.length}`);

  // 1) Tạo ProjectGroup cho mỗi mã (nếu chưa có). name = code (seed tạm).
  let order = 0;
  const groupIdByCode = new Map<string, string>();
  for (const code of codes) {
    const g = await prisma.projectGroup.upsert({
      where: { code },
      update: {},
      create: { code, name: code, order: order++ },
      select: { id: true },
    });
    groupIdByCode.set(code, g.id);
  }

  // 2) Gán groupId cho từng hạng mục còn thiếu.
  let updated = 0;
  for (const p of projects) {
    const gid = groupIdByCode.get(p.code);
    if (gid && p.groupId !== gid) {
      await prisma.project.update({ where: { id: p.id }, data: { groupId: gid } });
      updated++;
    }
  }

  // 3) Kiểm tra.
  const groups = await prisma.projectGroup.count();
  const missing = await prisma.project.count({ where: { deletedAt: null, groupId: null } });
  console.log(`Đã gán: ${updated} · ProjectGroup: ${groups} · Hạng mục thiếu groupId: ${missing}`);
  if (missing > 0) throw new Error("Còn hạng mục chưa có groupId — kiểm tra lại!");
  console.log("✓ Backfill xong.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
