"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { catalogItemSchema } from "@/lib/schemas/admin";
import { runAction } from "./_helpers";

export async function updateWorkGroup(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = catalogItemSchema.parse(input);
    await prisma.workGroup.update({
      where: { id: data.id },
      data: { name: data.name, order: data.order ?? 0 },
    });
    revalidatePath("/admin/catalog");
  });
}

export async function updatePhase(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = catalogItemSchema.parse(input);
    await prisma.phase.update({
      where: { id: data.id },
      data: { name: data.name, order: data.order ?? 0 },
    });
    revalidatePath("/admin/catalog");
  });
}
