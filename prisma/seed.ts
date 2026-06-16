import { PrismaClient, UserRole, TaskStatus, TaskPriority, ProjectStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const WORK_GROUPS = [
  { code: "1", name: "Xây dựng HTTC BIM", abbr: "XD", order: 1 },
  { code: "2", name: "Đào tạo BIM", abbr: "DT", order: 2 },
  { code: "3", name: "Quản lý BIM", abbr: "QL", order: 3 },
  { code: "4", name: "Thanh tra BIM", abbr: "TT", order: 4 },
  { code: "5", name: "Phát triển BIM Tools", abbr: "BT", order: 5 },
  { code: "6", name: "Quản lý phần mềm", abbr: "PM", order: 6 },
  { code: "7", name: "Công việc khác", abbr: "CV", order: 7 },
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
  const noTone = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
  const parts = noTone.split(/\s+/);
  const last = parts[parts.length - 1] ?? "user";
  const initials = parts.slice(0, -1).map((p) => p[0]).join("");
  return `${last}${initials}`;
}

async function main() {
  console.log("Seeding danh mục...");

  for (const g of WORK_GROUPS) {
    await prisma.workGroup.upsert({
      where: { code: g.code },
      update: { name: g.name, order: g.order, abbr: g.abbr },
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
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@qlcv.local",
      fullName: "Quản trị viên",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
    },
  });

  // Demo users
  const bimDept = await prisma.discipline.findUnique({ where: { code: "BIM" } });
  const ktDept = await prisma.discipline.findUnique({ where: { code: "KT" } });
  const kcDept = await prisma.discipline.findUnique({ where: { code: "KC" } });
  const mepfDept = await prisma.discipline.findUnique({ where: { code: "MEPF" } });
  const demoHash = await bcrypt.hash("Qlcv@12345", 10);
  const seen = new Set<string>();
  const demoUserRecords: { id: string; fullName: string }[] = [];

  const deptMap = [bimDept, ktDept, kcDept, mepfDept, bimDept, ktDept, kcDept, mepfDept];
  for (let i = 0; i < DEMO_USERS.length; i++) {
    const name = DEMO_USERS[i];
    let uname = usernameFromName(name);
    while (seen.has(uname)) uname += "1";
    seen.add(uname);
    const u = await prisma.user.upsert({
      where: { username: uname },
      update: {},
      create: {
        username: uname,
        email: `${uname}@qlcv.local`,
        fullName: name,
        passwordHash: demoHash,
        role: UserRole.LEVEL_2,
        disciplineId: deptMap[i]?.id ?? null,
      },
    });
    demoUserRecords.push({ id: u.id, fullName: u.fullName });
  }

  // ---------- Dữ liệu demo ----------
  console.log("Seeding dự án, hạng mục, công việc...");

  const ctNhaO = await prisma.constructionType.findUnique({ where: { code: "NHA_O" } });
  const ctHaTang = await prisma.constructionType.findUnique({ where: { code: "HA_TANG" } });
  const ctTTTM = await prisma.constructionType.findUnique({ where: { code: "TTTM" } });
  const ctCongNghiep = await prisma.constructionType.findUnique({ where: { code: "CONG_NGHIEP" } });

  const wgXD = await prisma.workGroup.findUnique({ where: { code: "1" } });
  const wgDT = await prisma.workGroup.findUnique({ where: { code: "2" } });
  const wgQL = await prisma.workGroup.findUnique({ where: { code: "3" } });
  const wgTT = await prisma.workGroup.findUnique({ where: { code: "4" } });

  const phTKBVTC = await prisma.phase.findUnique({ where: { code: "TKBVTC" } });
  const phThiCong = await prisma.phase.findUnique({ where: { code: "THI_CONG" } });
  const phTKKT = await prisma.phase.findUnique({ where: { code: "TKKT" } });

  // -- ProjectGroup (Dự án cha) --
  const pg1 = await prisma.projectGroup.upsert({
    where: { code: "VH.SAPPHIRE.01" },
    update: { name: "Vinhomes Sapphire" },
    create: { code: "VH.SAPPHIRE.01", name: "Vinhomes Sapphire" },
  });
  const pg2 = await prisma.projectGroup.upsert({
    where: { code: "VH.OCEAN.02" },
    update: { name: "Vinhomes Ocean Park 3" },
    create: { code: "VH.OCEAN.02", name: "Vinhomes Ocean Park 3" },
  });
  const pg3 = await prisma.projectGroup.upsert({
    where: { code: "VH.SMASTER.03" },
    update: { name: "Vincom Smart City" },
    create: { code: "VH.SMASTER.03", name: "Vincom Smart City" },
  });

  // -- Project (Hạng mục) --
  const proj1 = await prisma.project.upsert({
    where: { code_name: { code: "VH.SAPPHIRE.01", name: "Tòa S1 – Chung cư cao tầng" } },
    update: {},
    create: {
      code: "VH.SAPPHIRE.01",
      name: "Tòa S1 – Chung cư cao tầng",
      groupId: pg1.id,
      status: ProjectStatus.DANG_THUC_HIEN,
      constructionTypeId: ctNhaO?.id,
      startDate: new Date("2025-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });
  const proj2 = await prisma.project.upsert({
    where: { code_name: { code: "VH.SAPPHIRE.01", name: "Tòa S2 – Biệt thự liền kề" } },
    update: {},
    create: {
      code: "VH.SAPPHIRE.01",
      name: "Tòa S2 – Biệt thự liền kề",
      groupId: pg1.id,
      status: ProjectStatus.DANG_THUC_HIEN,
      constructionTypeId: ctNhaO?.id,
      startDate: new Date("2025-03-01"),
      endDate: new Date("2026-06-30"),
    },
  });
  const proj3 = await prisma.project.upsert({
    where: { code_name: { code: "VH.OCEAN.02", name: "Khu đô thị Ocean Park 3 – Hạ tầng" } },
    update: {},
    create: {
      code: "VH.OCEAN.02",
      name: "Khu đô thị Ocean Park 3 – Hạ tầng",
      groupId: pg2.id,
      status: ProjectStatus.DANG_THUC_HIEN,
      constructionTypeId: ctHaTang?.id,
      startDate: new Date("2024-06-01"),
      endDate: new Date("2026-09-30"),
    },
  });
  const proj4 = await prisma.project.upsert({
    where: { code_name: { code: "VH.SMASTER.03", name: "Vincom Smart City – TTTM" } },
    update: {},
    create: {
      code: "VH.SMASTER.03",
      name: "Vincom Smart City – TTTM",
      groupId: pg3.id,
      status: ProjectStatus.DANG_THUC_HIEN,
      constructionTypeId: ctTTTM?.id,
      startDate: new Date("2025-06-01"),
      endDate: new Date("2027-12-31"),
    },
  });
  const proj5 = await prisma.project.upsert({
    where: { code_name: { code: "VH.SMASTER.03", name: "Vincom Smart City – Nhà máy điện" } },
    update: {},
    create: {
      code: "VH.SMASTER.03",
      name: "Vincom Smart City – Nhà máy điện",
      groupId: pg3.id,
      status: ProjectStatus.DANG_THUC_HIEN,
      constructionTypeId: ctCongNghiep?.id,
      startDate: new Date("2025-09-01"),
      endDate: new Date("2027-06-30"),
    },
  });

  // -- CatalogItems (gợi ý dropdown) --
  const catalogItems = [
    // WorkGroup 1 – Xây dựng HTTC BIM
    { wgCode: "1", level: 2, value: "Tiêu chuẩn BIM" },
    { wgCode: "1", level: 2, value: "Template dự án" },
    { wgCode: "1", level: 2, value: "Quy trình phối hợp" },
    { wgCode: "1", level: 3, value: "Tiêu chuẩn đặt tên" },
    { wgCode: "1", level: 3, value: "LOD / LOI yêu cầu" },
    { wgCode: "1", level: 5, value: "Soạn thảo tài liệu" },
    { wgCode: "1", level: 5, value: "Kiểm tra / Review" },
    { wgCode: "1", level: 5, value: "Ban hành chính thức" },
    // WorkGroup 2 – Đào tạo BIM
    { wgCode: "2", level: 2, value: "Đào tạo nội bộ" },
    { wgCode: "2", level: 2, value: "Đào tạo dự án" },
    { wgCode: "2", level: 3, value: "Revit cơ bản" },
    { wgCode: "2", level: 3, value: "Navisworks" },
    { wgCode: "2", level: 3, value: "Dynamo / API" },
    { wgCode: "2", level: 5, value: "Lập kế hoạch đào tạo" },
    { wgCode: "2", level: 5, value: "Thực hành / Workshop" },
    // WorkGroup 3 – Quản lý BIM
    { wgCode: "3", level: 2, value: "Phối hợp BIM" },
    { wgCode: "3", level: 2, value: "Kiểm tra mô hình" },
    { wgCode: "3", level: 3, value: "Clash detection" },
    { wgCode: "3", level: 3, value: "Model audit" },
    { wgCode: "3", level: 5, value: "Họp phối hợp BIM" },
    { wgCode: "3", level: 5, value: "Xuất báo cáo" },
    // WorkGroup 4 – Thanh tra BIM
    { wgCode: "4", level: 2, value: "Kiểm tra tuân thủ" },
    { wgCode: "4", level: 3, value: "Theo tiêu chuẩn VN" },
    { wgCode: "4", level: 5, value: "Lập biên bản" },
  ];

  for (const item of catalogItems) {
    const wg = await prisma.workGroup.findUnique({ where: { code: item.wgCode } });
    if (!wg) continue;
    await prisma.catalogItem.upsert({
      where: { workGroupId_level_value: { workGroupId: wg.id, level: item.level, value: item.value } },
      update: {},
      create: { workGroupId: wg.id, level: item.level, value: item.value },
    });
  }

  // -- Tasks --
  const today = new Date();
  const d = (offsetDays: number) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + offsetDays);
    return dt;
  };

  // Tất cả user (admin + demo)
  const allUsers = [{ id: admin.id, fullName: "Quản trị viên" }, ...demoUserRecords];
  const u = (i: number) => allUsers[i % allUsers.length];

  const tasksData = [
    // --- Nhóm 1: Xây dựng HTTC BIM ---
    {
      wg: wgXD, project: proj1, discipline: bimDept, phase: phTKBVTC,
      level2: "Tiêu chuẩn BIM", level3: "Tiêu chuẩn đặt tên", level5: "Soạn thảo tài liệu",
      name: "Soạn thảo tiêu chuẩn đặt tên cấu kiện Revit",
      priority: TaskPriority.CAO, status: TaskStatus.DANG_LAM,
      plannedStart: d(-10), plannedEnd: d(5),
      assignees: [u(0), u(1)],
    },
    {
      wg: wgXD, project: proj1, discipline: ktDept, phase: phTKBVTC,
      level2: "Template dự án", level3: "LOD / LOI yêu cầu", level5: "Kiểm tra / Review",
      name: "Review template Revit kiến trúc dự án S1",
      priority: TaskPriority.TRUNG_BINH, status: TaskStatus.CHUA_LAM,
      plannedStart: d(3), plannedEnd: d(20),
      assignees: [u(2)],
    },
    {
      wg: wgXD, project: proj2, discipline: kcDept, phase: phTKKT,
      level2: "Tiêu chuẩn BIM", level3: "LOD / LOI yêu cầu", level5: "Ban hành chính thức",
      name: "Ban hành LOD 350 cho hạng mục kết cấu S2",
      priority: TaskPriority.CAO, status: TaskStatus.HOAN_THANH,
      plannedStart: d(-30), plannedEnd: d(-5),
      actualEnd: d(-3),
      assignees: [u(3)],
    },
    {
      wg: wgXD, project: proj3, discipline: mepfDept, phase: phThiCong,
      level2: "Quy trình phối hợp", level3: "LOD / LOI yêu cầu", level5: "Soạn thảo tài liệu",
      name: "Xây dựng quy trình phối hợp MEPF hạ tầng Ocean Park 3",
      priority: TaskPriority.TRUNG_BINH, status: TaskStatus.DANG_LAM,
      plannedStart: d(-7), plannedEnd: d(-1),
      assignees: [u(4), u(5)],
    },
    {
      wg: wgXD, project: proj4, discipline: bimDept, phase: phTKBVTC,
      level2: "Template dự án", level3: "Tiêu chuẩn đặt tên", level5: "Soạn thảo tài liệu",
      name: "Lập BEP (BIM Execution Plan) cho dự án Vincom Smart City",
      priority: TaskPriority.CAO, status: TaskStatus.DANG_LAM,
      plannedStart: d(-5), plannedEnd: d(10),
      assignees: [u(0), u(6)],
    },
    {
      wg: wgXD, project: proj5, discipline: ktDept, phase: phTKKT,
      level2: "Tiêu chuẩn BIM", level3: "Tiêu chuẩn đặt tên", level5: "Kiểm tra / Review",
      name: "Kiểm tra mô hình Revit kiến trúc nhà máy điện",
      priority: TaskPriority.THAP, status: TaskStatus.CHUA_LAM,
      plannedStart: d(10), plannedEnd: d(30),
      assignees: [u(1)],
    },
    // Quá hạn
    {
      wg: wgXD, project: proj1, discipline: kcDept, phase: phTKBVTC,
      level2: "Quy trình phối hợp", level3: "Clash detection", level5: "Xuất báo cáo",
      name: "Clash detection toàn mô hình S1 – báo cáo tuần",
      priority: TaskPriority.CAO, status: TaskStatus.DANG_LAM,
      plannedStart: d(-20), plannedEnd: d(-3),
      assignees: [u(2), u(3)],
    },

    // --- Nhóm 2: Đào tạo BIM ---
    {
      wg: wgDT, project: null, discipline: bimDept, phase: null,
      level2: "Đào tạo nội bộ", level3: "Revit cơ bản", level5: "Thực hành / Workshop",
      name: "Workshop Revit cơ bản – Batch tháng 6",
      priority: TaskPriority.TRUNG_BINH, status: TaskStatus.DANG_LAM,
      plannedStart: d(-3), plannedEnd: d(14),
      assignees: [u(7), u(0)],
    },
    {
      wg: wgDT, project: null, discipline: bimDept, phase: null,
      level2: "Đào tạo nội bộ", level3: "Navisworks", level5: "Lập kế hoạch đào tạo",
      name: "Lập kế hoạch đào tạo Navisworks Q3/2026",
      priority: TaskPriority.THAP, status: TaskStatus.CHUA_LAM,
      plannedStart: d(15), plannedEnd: d(45),
      assignees: [u(0)],
    },
    {
      wg: wgDT, project: null, discipline: bimDept, phase: null,
      level2: "Đào tạo dự án", level3: "Dynamo / API", level5: "Thực hành / Workshop",
      name: "Đào tạo Dynamo cho nhân sự dự án Ocean Park",
      priority: TaskPriority.TRUNG_BINH, status: TaskStatus.HOAN_THANH,
      plannedStart: d(-25), plannedEnd: d(-10),
      actualEnd: d(-10),
      assignees: [u(6)],
    },

    // --- Nhóm 3: Quản lý BIM ---
    {
      wg: wgQL, project: proj1, discipline: bimDept, phase: phTKBVTC,
      level2: "Phối hợp BIM", level3: "Họp phối hợp BIM", level5: "Họp phối hợp BIM",
      name: "Họp BIM Coordination tuần – dự án Sapphire S1",
      priority: TaskPriority.TRUNG_BINH, status: TaskStatus.HOAN_THANH,
      plannedStart: d(-7), plannedEnd: d(-7),
      actualEnd: d(-7),
      assignees: [u(0), u(1), u(2)],
    },
    {
      wg: wgQL, project: proj3, discipline: mepfDept, phase: phThiCong,
      level2: "Kiểm tra mô hình", level3: "Model audit", level5: "Xuất báo cáo",
      name: "Model Audit mô hình MEPF Ocean Park 3",
      priority: TaskPriority.CAO, status: TaskStatus.DANG_LAM,
      plannedStart: d(-2), plannedEnd: d(7),
      assignees: [u(4)],
    },
    {
      wg: wgQL, project: proj4, discipline: bimDept, phase: phTKBVTC,
      level2: "Phối hợp BIM", level3: "Clash detection", level5: "Xuất báo cáo",
      name: "Xuất báo cáo Clash Detection – Vincom Smart City TTTM",
      priority: TaskPriority.TRUNG_BINH, status: TaskStatus.TAM_DUNG,
      plannedStart: d(-5), plannedEnd: d(3),
      assignees: [u(5), u(0)],
    },

    // --- Nhóm 4: Thanh tra BIM ---
    {
      wg: wgTT, project: proj2, discipline: ktDept, phase: phTKBVTC,
      level2: "Kiểm tra tuân thủ", level3: "Theo tiêu chuẩn VN", level5: "Lập biên bản",
      name: "Kiểm tra tuân thủ tiêu chuẩn BIM – Sapphire S2 (KT)",
      priority: TaskPriority.CAO, status: TaskStatus.DANG_LAM,
      plannedStart: d(-8), plannedEnd: d(2),
      assignees: [u(3)],
    },
    {
      wg: wgTT, project: proj3, discipline: kcDept, phase: phThiCong,
      level2: "Kiểm tra tuân thủ", level3: "Theo tiêu chuẩn VN", level5: "Lập biên bản",
      name: "Lập biên bản thanh tra mô hình kết cấu Ocean Park 3",
      priority: TaskPriority.TRUNG_BINH, status: TaskStatus.CHUA_LAM,
      plannedStart: d(5), plannedEnd: d(25),
      assignees: [u(7)],
    },
  ];

  let seq = 1;
  for (const t of tasksData) {
    if (!t.wg) continue;

    // Tìm task đã có theo name + workGroupId để tránh tạo trùng
    const existing = await prisma.task.findFirst({
      where: { name: t.name, workGroupId: t.wg.id },
    });
    if (existing) continue;

    const task = await prisma.task.create({
      data: {
        workGroupId: t.wg.id,
        projectId: t.project?.id ?? null,
        disciplineId: t.discipline?.id ?? null,
        phaseId: t.phase?.id ?? null,
        seq: seq++,
        wbsPath: String(seq).padStart(3, "0"),
        level: 5,
        level2: t.level2,
        level3: t.level3,
        level5: t.level5,
        name: t.name,
        priority: t.priority,
        status: t.status,
        plannedStart: t.plannedStart,
        plannedEnd: t.plannedEnd,
        actualEnd: t.actualEnd ?? null,
        progressPercent: t.status === TaskStatus.HOAN_THANH ? 100 : t.status === TaskStatus.DANG_LAM ? 50 : 0,
        startApprovedAt: new Date(), // mặc định đã duyệt
      },
    });

    // Gán người thực hiện
    for (let i = 0; i < t.assignees.length; i++) {
      await prisma.taskAssignee.upsert({
        where: { taskId_userId: { taskId: task.id, userId: t.assignees[i].id } },
        update: {},
        create: {
          taskId: task.id,
          userId: t.assignees[i].id,
          roleNo: i + 1,
        },
      });
    }
  }

  const counts = {
    workGroups: await prisma.workGroup.count(),
    disciplines: await prisma.discipline.count(),
    phases: await prisma.phase.count(),
    constructionTypes: await prisma.constructionType.count(),
    users: await prisma.user.count(),
    projectGroups: await prisma.projectGroup.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
  };
  console.log("Seed xong:", counts);
  console.log("Admin: admin / Admin@12345");
  console.log("Demo users: password = Qlcv@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
