import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---- Danh mục lấy từ WM_New.xlsx ----

const WORK_GROUPS = [
  { code: "1", name: "Xây dựng HTTC BIM", order: 1 },
  { code: "2", name: "Đào tạo BIM", order: 2 },
  { code: "3", name: "Quản lý BIM", order: 3 },
  { code: "4", name: "Thanh tra BIM", order: 4 },
  { code: "5", name: "Phát triển BIM Tools", order: 5 },
  { code: "6", name: "Quản lý phần mềm", order: 6 },
  { code: "7", name: "Công việc khác", order: 7 },
];

const DISCIPLINES = [
  { code: "BIM", name: "BIM", order: 1 },
  { code: "KT", name: "Kiến trúc", order: 2 },
  { code: "KC", name: "Kết cấu", order: 3 },
  { code: "MEPF", name: "Cơ điện (MEPF)", order: 4 },
  { code: "HT", name: "Hạ tầng", order: 5 },
  { code: "IT", name: "Công nghệ thông tin (IT)", order: 6 },
  { code: "DI", name: "Điện (DI)", order: 7 },
  { code: "DN", name: "Điện nhẹ (DN)", order: 8 },
  { code: "NU", name: "Cấp thoát nước (NU)", order: 9 },
  { code: "DH", name: "Điều hòa (DH)", order: 10 },
  { code: "PC", name: "Phòng cháy (PC)", order: 11 },
];

const CONSTRUCTION_TYPES = [
  { code: "NHA_O", name: "Nhà ở / Chung cư", order: 1 },
  { code: "HA_TANG", name: "Hạ tầng kỹ thuật", order: 2 },
  { code: "TTTM", name: "Trung tâm thương mại", order: 3 },
  { code: "CONG_NGHIEP", name: "Công nghiệp / Nhà máy", order: 4 },
  { code: "CONG_CONG", name: "Công cộng (trường, bệnh viện...)", order: 5 },
  { code: "KHAC", name: "Khác", order: 9 },
];

const PHASES = [
  { code: "CONCEPT", name: "Concept", order: 1 },
  { code: "TKCS", name: "TKCS", order: 2 },
  { code: "FEED", name: "FEED", order: 3 },
  { code: "TKKT", name: "TKKT", order: 4 },
  { code: "TKBVTC", name: "TKBVTC", order: 5 },
  { code: "THI_CONG", name: "Thi công", order: 6 },
  { code: "HOAN_CONG", name: "Hoàn công", order: 7 },
  { code: "VAN_HANH", name: "Vận hành", order: 8 },
];

// Vài nhân sự lấy từ Excel (mật khẩu demo, buộc đổi lần đầu)
const DEMO_USERS = [
  "Hà Minh Luân",
  "Mai Hồng Hạnh",
  "Lý Huy Thành",
  "Nguyễn Hải Nam",
  "Đỗ Minh Ngọc",
  "Trần Văn Diện",
  "Đặng Minh Quang",
  "Trần Văn Toản",
];

function usernameFromName(fullName: string): string {
  // "Hà Minh Luân" -> "luan" + dedupe sau
  const noTone = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
  const parts = noTone.split(/\s+/);
  const last = parts[parts.length - 1] ?? "user";
  const initials = parts
    .slice(0, -1)
    .map((p) => p[0])
    .join("");
  return `${last}${initials}`; // luanhm
}

async function main() {
  console.log("Seeding danh mục...");

  for (const g of WORK_GROUPS) {
    await prisma.workGroup.upsert({
      where: { code: g.code },
      update: { name: g.name, order: g.order },
      create: g,
    });
  }
  for (const d of DISCIPLINES) {
    await prisma.discipline.upsert({
      where: { code: d.code },
      update: { name: d.name, order: d.order },
      create: d,
    });
  }
  for (const p of PHASES) {
    await prisma.phase.upsert({
      where: { code: p.code },
      update: { name: p.name, order: p.order },
      create: p,
    });
  }
  for (const c of CONSTRUCTION_TYPES) {
    await prisma.constructionType.upsert({
      where: { code: c.code },
      update: { name: c.name, order: c.order },
      create: c,
    });
  }

  // Admin
  const adminHash = await bcrypt.hash("Admin@12345", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@qlcv.local",
      fullName: "Quản trị viên",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      mustChangePassword: false,
    },
  });

  // Demo users
  const bimDept = await prisma.discipline.findUnique({ where: { code: "BIM" } });
  const demoHash = await bcrypt.hash("Qlcv@12345", 10);
  const seen = new Set<string>();
  for (const name of DEMO_USERS) {
    let uname = usernameFromName(name);
    while (seen.has(uname)) uname += "1";
    seen.add(uname);
    await prisma.user.upsert({
      where: { username: uname },
      update: {},
      create: {
        username: uname,
        email: `${uname}@qlcv.local`,
        fullName: name,
        passwordHash: demoHash,
        role: UserRole.LEVEL_2,
        disciplineId: bimDept?.id ?? null,
        mustChangePassword: true,
      },
    });
  }

  const counts = {
    workGroups: await prisma.workGroup.count(),
    disciplines: await prisma.discipline.count(),
    phases: await prisma.phase.count(),
    users: await prisma.user.count(),
  };
  console.log("Seed xong:", counts);
  console.log("Admin: admin / Admin@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
