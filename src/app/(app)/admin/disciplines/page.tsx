import { prisma } from "@/server/db/client";
import { DisciplinesManager } from "./disciplines-manager";

export default async function DisciplinesPage() {
  const disciplines = await prisma.discipline.findMany({ orderBy: { order: "asc" } });
  return (
    <DisciplinesManager
      items={disciplines.map((d) => ({ id: d.id, code: d.code, name: d.name, order: d.order }))}
    />
  );
}
