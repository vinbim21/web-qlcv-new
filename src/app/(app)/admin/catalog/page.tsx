import { prisma } from "@/server/db/client";
import { CatalogManager } from "./catalog-manager";

export default async function CatalogPage() {
  const [workGroups, phases] = await Promise.all([
    prisma.workGroup.findMany({ orderBy: { order: "asc" } }),
    prisma.phase.findMany({ orderBy: { order: "asc" } }),
  ]);
  return (
    <CatalogManager
      workGroups={workGroups.map((w) => ({ id: w.id, code: w.code, name: w.name, order: w.order, abbr: w.abbr }))}
      phases={phases.map((p) => ({ id: p.id, code: p.code, name: p.name, order: p.order }))}
    />
  );
}
