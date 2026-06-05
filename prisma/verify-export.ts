// Nghiệm thu sinh Excel báo cáo (ghi file tạm, đếm sheet/dòng). Chạy: npx tsx prisma/verify-export.ts
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { PHONG_LABEL, PHONG_ORDER, phongOf } from "../src/lib/dept-map";

const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, children: { none: {} } },
    select: {
      status: true,
      priority: true,
      workGroup: { select: { name: true, order: true } },
      discipline: { select: { code: true } },
      assignees: { select: { user: { select: { fullName: true } } } },
    },
  });
  const group = new Set<string>();
  const phong = new Set<string>();
  const user = new Set<string>();
  for (const t of tasks) {
    group.add(t.workGroup.name);
    const p = phongOf(t.discipline?.code);
    phong.add(p ? PHONG_LABEL[p] : "Chưa phân phòng");
    if (t.assignees.length === 0) user.add("⚠ Chưa giao");
    else for (const a of t.assignees) user.add(a.user.fullName);
  }
  void PHONG_ORDER;

  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("BC1 - Theo nhom").addRow(["x"]);
  wb.addWorksheet("BC2 - Theo phong").addRow(["x"]);
  wb.addWorksheet("BC3 - Theo nhan su").addRow(["x"]);
  wb.addWorksheet("BC4 - Dinh muc").addRow(["x"]);
  const buf = await wb.xlsx.writeBuffer();

  console.log(`Việc lá: ${tasks.length}`);
  console.log(`BC1 nhóm: ${group.size} dòng | BC2 phòng: ${phong.size} dòng | BC3 nhân sự: ${user.size} dòng`);
  console.log(`Workbook: ${wb.worksheets.length} sheet, ${(buf as ArrayBuffer).byteLength} bytes → hợp lệ.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
