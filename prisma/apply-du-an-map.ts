/**
 * Áp bảng map Dự án↔Loại hình từ file CSV đã duyệt:
 *   prisma/import/du-an-map-draft.csv
 * Cột dùng: ma_goc (0), du_an_DUNG (6), loai_hinh_DUNG (7).
 *
 * Việc làm (LOCAL):
 *  - Gom lại ProjectGroup theo du_an_DUNG (1 dự án = 1 mã du_an).
 *  - Gán Project.groupId theo dự án; Project.constructionTypeId theo loai_hinh_DUNG
 *    (rỗng = để null). Giữ nguyên Project.code (mã gốc) để tham chiếu.
 *
 * Idempotent. Chạy: npx tsx prisma/apply-du-an-map.ts
 */
import * as fs from "fs";
import { prisma } from "@/server/db/client";

// Tách 1 dòng CSV, tôn trọng dấu nháy kép.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const path = "prisma/import/du-an-map-draft.csv";
  let raw = fs.readFileSync(path, "utf8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines.slice(1).map(parseCsvLine);

  // map: ma_goc -> { duAn, lhCode }
  const map = new Map<string, { duAn: string; lhCode: string }>();
  for (const r of rows) {
    const ma = (r[0] ?? "").trim();
    const duAn = (r[6] ?? "").trim() || ma;
    const lhCode = (r[7] ?? "").trim();
    if (ma) map.set(ma, { duAn, lhCode });
  }
  console.log(`Đọc CSV: ${map.size} mã → ${new Set([...map.values()].map((v) => v.duAn)).size} dự án`);

  const cts = await prisma.constructionType.findMany({ select: { id: true, code: true } });
  const ctByCode = new Map(cts.map((c) => [c.code, c.id]));

  // Cảnh báo mã loại hình lạ
  const badLh = [...new Set([...map.values()].map((v) => v.lhCode).filter((c) => c && !ctByCode.has(c)))];
  if (badLh.length) console.log("⚠ Mã loại hình KHÔNG có trong danh mục (sẽ để null):", badLh.join(", "));

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true },
  });

  // 1) Tạo/đảm bảo ProjectGroup cho từng du_an (name = du_an, seed).
  const duAnSet = [...new Set([...map.values()].map((v) => v.duAn))].sort((a, b) => a.localeCompare(b, "vi"));
  const groupIdByCode = new Map<string, string>();
  let order = 0;
  for (const code of duAnSet) {
    const g = await prisma.projectGroup.upsert({
      where: { code },
      update: { order: order++ },
      create: { code, name: code, order: order++ },
      select: { id: true },
    });
    groupIdByCode.set(code, g.id);
  }

  // 2) Gán groupId + constructionTypeId cho từng hạng mục.
  let reGroup = 0;
  let setLh = 0;
  let nullLh = 0;
  for (const p of projects) {
    const m = map.get(p.code);
    if (!m) { console.log("⚠ Mã không có trong CSV (bỏ qua):", p.code); continue; }
    const groupId = groupIdByCode.get(m.duAn)!;
    const constructionTypeId = m.lhCode && ctByCode.has(m.lhCode) ? ctByCode.get(m.lhCode)! : null;
    await prisma.project.update({ where: { id: p.id }, data: { groupId, constructionTypeId } });
    reGroup++;
    if (constructionTypeId) setLh++; else nullLh++;
  }

  // 3) Xóa ProjectGroup mồ côi (không còn hạng mục).
  const orphans = await prisma.projectGroup.findMany({
    where: { items: { none: {} } },
    select: { id: true, code: true },
  });
  if (orphans.length) {
    await prisma.projectGroup.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    console.log(`Xóa ${orphans.length} ProjectGroup mồ côi (mã cũ): ${orphans.map((o) => o.code).join(", ")}`);
  }

  const finalGroups = await prisma.projectGroup.count();
  console.log(`✓ Xong. Hạng mục cập nhật: ${reGroup} · có loại hình: ${setLh} · loại hình null: ${nullLh} · Dự án (ProjectGroup): ${finalGroups}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
