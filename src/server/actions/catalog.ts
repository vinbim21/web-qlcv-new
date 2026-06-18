"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { catalogCrudSchema } from "@/lib/schemas/admin";
import { runAction } from "./_helpers";

// ---------- Nhóm công việc (Level 1) ----------

export async function saveWorkGroup(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = catalogCrudSchema.parse(input);
    const abbr = data.abbr ? data.abbr.trim().toUpperCase() : null;
    if (data.id) {
      await prisma.workGroup.update({
        where: { id: data.id },
        data: { code: data.code, name: data.name, abbr, order: data.order ?? 0 },
      });
    } else {
      await prisma.workGroup.create({
        data: { code: data.code, name: data.name, abbr, order: data.order ?? 0 },
      });
    }
    revalidatePath("/admin/catalog");
    revalidatePath("/assign");
    revalidatePath("/tasks");
    revalidatePath("/manage");
  });
}

export async function deleteWorkGroup(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const used = await prisma.task.count({ where: { workGroupId: id } });
    if (used > 0) throw new Error(`Nhóm đang có ${used} công việc, không thể xóa`);
    await prisma.workGroup.delete({ where: { id } });
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// ---------- Giai đoạn ----------

export async function savePhase(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const data = catalogCrudSchema.parse(input);
    if (data.id) {
      await prisma.phase.update({
        where: { id: data.id },
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    } else {
      await prisma.phase.create({
        data: { code: data.code, name: data.name, order: data.order ?? 0 },
      });
    }
    revalidatePath("/admin/catalog");
  });
}

export async function deletePhase(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const used = await prisma.task.count({ where: { phaseId: id } });
    if (used > 0) throw new Error(`Giai đoạn đang gắn ${used} công việc, không thể xóa`);
    await prisma.phase.delete({ where: { id } });
    revalidatePath("/admin/catalog");
  });
}

// ---------- Giá trị danh mục Level 2/3/5 (sheet Data) ----------

const VALID_LEVELS = [2, 3, 5];

export async function addCatalogValue(workGroupId: string, level: number, value: string, parentId?: string | null) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const v = value.trim();
    if (!v) throw new Error("Nhập giá trị");
    if (!VALID_LEVELS.includes(level)) throw new Error("Cấp không hợp lệ");
    await prisma.catalogItem.upsert({
      where: { workGroupId_level_value: { workGroupId, level, value: v } },
      update: { parentId: parentId ?? null },
      create: { workGroupId, level, value: v, parentId: parentId ?? null },
    });
    revalidatePath(`/admin/catalog/${workGroupId}`);
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

export async function updateCatalogValue(id: string, value: string, parentId?: string | null, projectGroupId?: string | null) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const v = value.trim();
    if (!v) throw new Error("Nhập giá trị");
    await prisma.catalogItem.update({
      where: { id },
      data: {
        value: v,
        parentId: parentId !== undefined ? (parentId ?? null) : undefined,
        projectGroupId: projectGroupId !== undefined ? (projectGroupId ?? null) : undefined,
      },
    });
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

export async function deleteCatalogValue(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    await prisma.catalogItem.delete({ where: { id } });
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// ---------- Batch thêm nhiều CatalogItem cùng parentId ----------

export async function batchSaveCatalogItems(
  workGroupId: string,
  level: number,
  parentId: string | null,
  values: string[],
  projectGroupId?: string | null,
) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const trimmed = values.map((v) => v.trim()).filter(Boolean);
    if (!trimmed.length) throw new Error("Nhập ít nhất 1 hạng mục");
    await prisma.$transaction(
      trimmed.map((v) =>
        prisma.catalogItem.upsert({
          where: { workGroupId_level_value: { workGroupId, level, value: v } },
          update: { parentId, projectGroupId: projectGroupId ?? null },
          create: { workGroupId, level, value: v, parentId, projectGroupId: projectGroupId ?? null },
        }),
      ),
    );
    revalidatePath(`/admin/catalog/${workGroupId}`);
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// ---------- Batch reorder (drag-and-drop) ----------

type OrderModel = "workGroup" | "phase" | "discipline" | "constructionType" | "projectGroup" | "catalogItem";

export async function batchReorderItems(model: OrderModel, ids: string[]) {
  return runAction(async () => {
    await requireRole("ADMIN");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (prisma as any)[model];
    await prisma.$transaction(
      ids.map((id, index) => m.update({ where: { id }, data: { order: index } }))
    );
    revalidatePath("/admin/catalog");
  });
}
