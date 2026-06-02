import { prisma } from "@/server/db/client";
import { ProjectsManager } from "./projects-manager";

function toInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { tasks: true } } },
    orderBy: { code: "asc" },
  });
  return (
    <ProjectsManager
      items={projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        startDate: toInput(p.startDate),
        endDate: toInput(p.endDate),
        description: p.description ?? "",
        taskCount: p._count.tasks,
      }))}
    />
  );
}
