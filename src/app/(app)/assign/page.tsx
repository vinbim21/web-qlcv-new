import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import { canAssign } from "@/server/auth/permissions";
import { getTaskLookups } from "@/server/data/task-lookups";
import { AssignClient } from "./assign-client";

export default async function AssignPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Chỉ Admin / Cấp 1 / Cấp 2 được giao việc.
  if (!canAssign(session.user.role)) redirect("/dashboard");

  const lookups = await getTaskLookups();
  return <AssignClient {...lookups} />;
}
