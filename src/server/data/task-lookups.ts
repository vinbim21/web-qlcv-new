import { prisma } from "@/server/db/client";

/**
 * Dữ liệu tra cứu dùng chung cho form công việc (trang Công việc & Giao việc):
 * nhóm CV, bộ môn, giai đoạn, dự án, người dùng, và gợi ý Level 2/3/5 theo nhóm.
 */
export async function getTaskLookups() {
  const [workGroups, disciplines, phases, projects, projectGroups, users, catalogItems] = await Promise.all([
    prisma.workGroup.findMany({ orderBy: { order: "asc" } }),
    prisma.discipline.findMany({ orderBy: { order: "asc" } }),
    prisma.phase.findMany({ orderBy: { order: "asc" } }),
    prisma.project.findMany({
      where: { deletedAt: null },
      include: { group: true, constructionType: true },
      orderBy: { code: "asc" },
    }),
    prisma.projectGroup.findMany({
      where: { workGroupId: { not: null } },
      orderBy: [{ order: "asc" }, { code: "asc" }],
    }),
    prisma.user.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.catalogItem.findMany({ orderBy: [{ order: "asc" }, { value: "asc" }] }),
  ]);

  // Gợi ý Level 1/2/3/5 theo nhóm: { [workGroupId]: { l1:[], l2:[], l3:[], l5:[], l2ByL1:{}, l3ByL2:{} } }
  const l1NameById = new Map(catalogItems.filter((c) => c.level === 1).map((c) => [c.id, c.value]));
  const l2NameById = new Map(catalogItems.filter((c) => c.level === 2).map((c) => [c.id, c.value]));
  const projectGroupById = new Map(projectGroups.map((g) => [g.id, { id: g.id, code: g.code, name: g.name }]));
  const catalog: Record<string, {
    l1: string[];
    l2: string[];
    l3: string[];
    l5: string[];
    l2ByL1: Record<string, string[]>;
    l3ByL2: Record<string, string[]>;
    projectGroups: { id: string; code: string; name: string }[];
    l3ByProjectGroup: Record<string, string[]>;
    projectGroupByL3: Record<string, { id: string; code: string; name: string }>;
  }> = {};
  for (const g of projectGroups) {
    if (!g.workGroupId) continue;
    const e = (catalog[g.workGroupId] ??= { l1: [], l2: [], l3: [], l5: [], l2ByL1: {}, l3ByL2: {}, projectGroups: [], l3ByProjectGroup: {}, projectGroupByL3: {} });
    e.projectGroups.push({ id: g.id, code: g.code, name: g.name });
    e.l1.push(g.code);
  }
  for (const c of catalogItems) {
    const e = (catalog[c.workGroupId] ??= { l1: [], l2: [], l3: [], l5: [], l2ByL1: {}, l3ByL2: {}, projectGroups: [], l3ByProjectGroup: {}, projectGroupByL3: {} });
    if (c.level === 1) e.l1.push(c.value);
    else if (c.level === 2) {
      e.l2.push(c.value);
      if (c.parentId) {
        const l1Name = l1NameById.get(c.parentId);
        if (l1Name) (e.l2ByL1[l1Name] ??= []).push(c.value);
      }
    }
    else if (c.level === 3) {
      e.l3.push(c.value);
      if (c.parentId) {
        const l2Name = l2NameById.get(c.parentId);
        if (l2Name) (e.l3ByL2[l2Name] ??= []).push(c.value);
      }
      if (c.projectGroupId) {
        const projectGroup = projectGroupById.get(c.projectGroupId);
        if (projectGroup) {
          const projectGroupLabel = projectGroup.code;
          (e.l3ByProjectGroup[c.projectGroupId] ??= []).push(c.value);
          (e.l3ByProjectGroup[projectGroupLabel] ??= []).push(c.value);
          e.projectGroupByL3[c.value] = projectGroup;
        }
      }
    }
    else if (c.level === 5) e.l5.push(c.value);
  }

  return {
    // abbr = tiền tố Id (XD), lastSeq = số đã cấp gần nhất của nhóm (làm gốc preview Id).
    workGroups: workGroups.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      abbr: w.abbr,
      lastSeq: w.lastSeq,
    })),
    disciplines: disciplines.map((d) => ({ id: d.id, name: d.name, code: d.code })),
    phases: phases.map((p) => ({ id: p.id, name: p.name })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      l3: p.name,
      blockSystem: p.blockSystem ?? "",
      groupId: p.group?.id ?? "",
      groupCode: p.group?.code ?? "",
      groupName: p.group?.name ?? "",
      groupWorkGroupId: p.group?.workGroupId ?? null,
      constructionTypeId: p.constructionTypeId ?? "",
      constructionTypeCode: p.constructionType?.code ?? "",
      startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : "",
      packagingDate: p.packagingDate ? p.packagingDate.toISOString().slice(0, 10) : "",
      description: p.description ?? "",
    })),
    users: users.map((u) => ({ id: u.id, fullName: u.fullName })),
    // Người duyệt (luồng "Thêm công việc"): chỉ tài khoản ADMIN / Cấp 1 / Cấp 2.
    approvers: users
      .filter((u) => u.role === "ADMIN" || u.role === "LEVEL_1" || u.role === "LEVEL_2")
      .map((u) => ({ id: u.id, fullName: u.fullName })),
    catalog,
  };
}
