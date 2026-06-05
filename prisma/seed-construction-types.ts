// Seed danh mục Loại hình công trình (idempotent). Chạy: npx tsx prisma/seed-construction-types.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const CONSTRUCTION_TYPES = [
  { code: "NHA_O", name: "Nhà ở / Chung cư", order: 1 },
  { code: "HA_TANG", name: "Hạ tầng kỹ thuật", order: 2 },
  { code: "TTTM", name: "Trung tâm thương mại", order: 3 },
  { code: "CONG_NGHIEP", name: "Công nghiệp / Nhà máy", order: 4 },
  { code: "CONG_CONG", name: "Công cộng (trường, bệnh viện...)", order: 5 },
  { code: "KHAC", name: "Khác", order: 9 },
];

async function main() {
  for (const c of CONSTRUCTION_TYPES) {
    await prisma.constructionType.upsert({
      where: { code: c.code },
      update: { name: c.name, order: c.order },
      create: c,
    });
  }
  const n = await prisma.constructionType.count();
  console.log(`ConstructionType: ${n} bản ghi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
