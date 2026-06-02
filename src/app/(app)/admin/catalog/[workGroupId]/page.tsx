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
    items.filter((i) => i.level === lv).map((i) => ({ id: i.id, value: i.value }));

  return (
    <CatalogDetail
      workGroupId={wg.id}
      workGroupName={wg.name}
      level2={byLevel(2)}
      level3={byLevel(3)}
      level5={byLevel(5)}
    />
  );
}
