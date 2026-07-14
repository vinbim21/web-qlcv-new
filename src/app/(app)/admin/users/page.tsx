import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");

  const [users, disciplines, departments] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      include: { discipline: true, department: true },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    }),
    prisma.discipline.findMany({ orderBy: { order: "asc" } }),
    prisma.department.findMany({ orderBy: { order: "asc" } }),
  ]);

  return (
    <UsersManager
      users={users.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        disciplineId: u.disciplineId,
        disciplineName: u.discipline?.name ?? null,
        departmentId: u.departmentId,
        departmentName: u.department?.name ?? null,
        isActive: u.isActive,
      }))}
      disciplines={disciplines.map((d) => ({ id: d.id, name: d.name }))}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
