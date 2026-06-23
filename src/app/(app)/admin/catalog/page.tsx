import { prisma } from "@/server/db/client";
import { CatalogClient } from "./catalog-client";

export default async function CatalogPage() {
  const [workGroups, phases, constructionTypes, disciplines, projectGroups, projects, level5, ptItems] = await Promise.all([
    prisma.workGroup.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { tasks: true } } },
    }),
    prisma.phase.findMany({ orderBy: { order: "asc" } }),
    prisma.constructionType.findMany({ orderBy: { order: "asc" } }),
    prisma.discipline.findMany({ orderBy: { order: "asc" } }),
    prisma.projectGroup.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: [{ code: "asc" }, { name: "asc" }],
      include: { _count: { select: { tasks: true } } },
    }),
    // Tab "Công việc" = danh mục Đầu việc (CatalogItem level 5) theo từng Nhóm công việc.
    prisma.catalogItem.findMany({
      where: { level: 5 },
      orderBy: [{ order: "asc" }, { value: "asc" }],
    }),
    // Tab "Dự án BIM Tools" = Level 2+3 của nhóm PT (Loại hình + Hạng mục phần mềm).
    prisma.catalogItem.findMany({
      where: { workGroup: { abbr: "PT" }, level: { in: [2, 3] } },
      orderBy: [{ order: "asc" }, { value: "asc" }],
      select: { id: true, level: true, value: true, parentId: true, projectGroupId: true, order: true },
    }),
  ]);

  return (
    <CatalogClient
      workGroups={workGroups.map((w) => ({
        id: w.id,
        code: w.code,
        abbr: w.abbr,
        name: w.name,
        order: w.order,
        taskCount: w._count.tasks,
      }))}
      phases={phases.map((p) => ({ id: p.id, code: p.code, name: p.name, order: p.order }))}
      disciplines={disciplines.map((d) => ({ id: d.id, code: d.code, name: d.name, order: d.order }))}
      constructionTypes={constructionTypes.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        order: c.order,
      }))}
      projectGroups={projectGroups.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        order: g.order,
        workGroupId: g.workGroupId,
        itemCount: g._count.items,
      }))}
      projects={projects.map((p) => ({
        id: p.id,
        groupId: p.groupId,
        code: p.code,
        name: p.name,
        blockSystem: p.blockSystem,
        scale: p.scale,
        constructionTypeId: p.constructionTypeId,
        startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
        packagingDate: p.packagingDate ? p.packagingDate.toISOString().slice(0, 10) : null,
        taskCount: p._count.tasks,
      }))}
      works={level5.map((i) => ({ id: i.id, workGroupId: i.workGroupId, value: i.value, order: i.order }))}
      ptItems={ptItems.map((i) => ({ id: i.id, level: i.level, value: i.value, parentId: i.parentId, projectGroupId: i.projectGroupId, order: i.order }))}
    />
  );
}
