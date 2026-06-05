import { prisma } from "@/server/db/client";
import { ConstructionTypesManager } from "./construction-types-manager";

export default async function ConstructionTypesPage() {
  const items = await prisma.constructionType.findMany({ orderBy: { order: "asc" } });
  return (
    <ConstructionTypesManager
      items={items.map((c) => ({ id: c.id, code: c.code, name: c.name, order: c.order }))}
    />
  );
}
