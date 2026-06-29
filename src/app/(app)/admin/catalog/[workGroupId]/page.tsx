import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { CatalogDetail } from "./catalog-detail";

export default async function CatalogDetailPage({
  params,
}: {
  params: Promise<{ workGroupId: string }>;
}) {
  const { workGroupId } = await params;
  const wg = await prisma.workGroup.findUnique({ where: { id: workGroupId } });
  if (!wg) notFound();

  const items = await prisma.catalogItem.findMany({
    where: { workGroupId },
    orderBy: [{ level: "asc" }, { order: "asc" }, { value: "asc" }],
  });

  const byLevel = (lv: number) =>
    items.filter((i) => i.level === lv).map((i) => ({ id: i.id, value: i.value, parentId: i.parentId ?? null }));

  // Nhóm Quản lý BIM (mã "3"): khai báo Dự án theo dòng (Level 2 = mã, Level 3 = tên, Quy mô CT = scale).
  const isBim = wg.code === "3";
  const projects = isBim
    ? (
        await prisma.project.findMany({
          where: { deletedAt: null },
          orderBy: [{ code: "asc" }],
          select: { id: true, code: true, name: true, scale: true },
        })
      ).map((p) => ({ id: p.id, code: p.code, name: p.name, scale: p.scale }))
    : [];

  return (
    <CatalogDetail
      workGroupId={wg.id}
      workGroupName={wg.name}
      workGroupCode={wg.code}
      workGroupAbbr={wg.abbr}
      workGroupOrder={wg.order}
      level1={byLevel(1)}
      level2={byLevel(2)}
      level3={byLevel(3)}
      level5={byLevel(5)}
      isBim={isBim}
      projects={projects}
    />
  );
}
