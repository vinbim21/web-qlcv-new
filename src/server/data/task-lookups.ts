import { prisma } from "@/server/db/client";

/**
 * Dữ liệu tra cứu dùng chung cho form công việc (trang Công việc & Giao việc):
 * nhóm CV, bộ môn, giai đoạn, dự án, người dùng, và gợi ý Level 2/3/5 theo nhóm.
 */
export async function getTaskLookups() {
  const [workGroups, disciplines, phases, projects, users, catalogItems] = await Promise.all([
    prisma.workGroup.findMany({ orderBy: { order: "asc" } }),
    prisma.discipline.findMany({ orderBy: { order: "asc" } }),
    prisma.phase.findMany({ orderBy: { order: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.user.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.catalogItem.findMany({ orderBy: [{ order: "asc" }, { value: "asc" }] }),
  ]);

  // Gợi ý Level 2/3/5 theo nhóm: { [workGroupId]: { l2:[], l3:[], l5:[] } }
  const catalog: Record<string, { l2: string[]; l3: string[]; l5: string[] }> = {};
  for (const c of catalogItems) {
    const e = (catalog[c.workGroupId] ??= { l2: [], l3: [], l5: [] });
    if (c.level === 2) e.l2.push(c.value);
    else if (c.level === 3) e.l3.push(c.value);
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
    disciplines: disciplines.map((d) => ({ id: d.id, name: d.name })),
    phases: phases.map((p) => ({ id: p.id, name: p.name })),
    projects: projects.map((p) => ({ id: p.id, name: `${p.code} — ${p.name}` })),
    users: users.map((u) => ({ id: u.id, fullName: u.fullName })),
    catalog,
  };
}
