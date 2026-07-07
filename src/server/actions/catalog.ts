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

const VALID_LEVELS = [1, 2, 3, 5];

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

    // Đọc giá trị cũ để cascade-update task đang lưu tên dạng chuỗi.
    const old = await prisma.catalogItem.findUniqueOrThrow({ where: { id }, select: { value: true, level: true, workGroupId: true } });

    await prisma.$transaction(async (tx) => {
      await tx.catalogItem.update({
        where: { id },
        data: {
          value: v,
          parentId: parentId !== undefined ? (parentId ?? null) : undefined,
          projectGroupId: projectGroupId !== undefined ? (projectGroupId ?? null) : undefined,
        },
      });

      // Đồng bộ tên sang các task đang dùng giá trị cũ (level2/3/5 lưu dạng string).
      const wg = old.workGroupId;
      const oldVal = old.value;
      if (old.level === 2) {
        await tx.task.updateMany({ where: { workGroupId: wg, level2: oldVal }, data: { level2: v } });
      } else if (old.level === 3) {
        await tx.task.updateMany({ where: { workGroupId: wg, level3: oldVal }, data: { level3: v } });
        // name thường = level3 khi không có level5
        await tx.task.updateMany({ where: { workGroupId: wg, level3: v, level5: null, name: oldVal }, data: { name: v } });
        await tx.task.updateMany({ where: { workGroupId: wg, level3: v, level5: "", name: oldVal }, data: { name: v } });
      } else if (old.level === 5) {
        await tx.task.updateMany({ where: { workGroupId: wg, level5: oldVal }, data: { level5: v } });
        // name thường = level5
        await tx.task.updateMany({ where: { workGroupId: wg, level5: v, name: oldVal }, data: { name: v } });
      }
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

// Tạo CatalogItem và trả về id (dùng trong bulk edit BIM Tools)
export async function createCatalogItemReturnId(
  workGroupId: string,
  level: number,
  value: string,
  parentId?: string | null,
) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const v = value.trim();
    if (!v) throw new Error("Nhập giá trị");
    const created = await prisma.catalogItem.create({
      data: { workGroupId, level, value: v, parentId: parentId ?? null },
    });
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
    return { id: created.id };
  });
}

// Batch update parentId / projectGroupId / value cho nhiều CatalogItem (Tab BIM Tools)
export async function batchUpdateCatalogItems(
  ids: string[],
  patch: { workGroupId?: string; parentId?: string | null; projectGroupId?: string | null; value?: string },
) {
  return runAction(async () => {
    await requireRole("ADMIN");
    if (!ids.length) throw new Error("Không có mục nào được chọn");
    for (const id of ids) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {};
      if (patch.workGroupId !== undefined) data.workGroupId = patch.workGroupId;
      if (patch.parentId !== undefined) data.parentId = patch.parentId;
      if (patch.projectGroupId !== undefined) data.projectGroupId = patch.projectGroupId || null;
      if (patch.value !== undefined && patch.value.trim()) data.value = patch.value.trim();
      if (Object.keys(data).length) await prisma.catalogItem.update({ where: { id }, data });
    }
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// ---------- Batch reorder (drag-and-drop) ----------

type OrderModel = "workGroup" | "phase" | "discipline" | "department" | "constructionType" | "projectGroup" | "catalogItem";

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

type SimpleCatalogModel = "workGroup" | "phase" | "discipline" | "department" | "constructionType";

export async function batchUpdateSimpleCatalog(
  model: SimpleCatalogModel,
  ids: string[],
  patch: { code?: string; name?: string; abbr?: string | null; order?: number },
) {
  return runAction(async () => {
    await requireRole("ADMIN");
    if (!ids.length) throw new Error("KhÃ´ng cÃ³ má»¥c nÃ o Ä‘Æ°á»£c chá»n");

    const data: Record<string, string | number | null> = {};
    if (patch.code !== undefined) {
      const code = patch.code.trim();
      if (!code) throw new Error("Nháº­p mÃ£");
      data.code = code;
    }
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("Nháº­p tÃªn");
      data.name = name;
    }
    if (patch.abbr !== undefined) data.abbr = patch.abbr?.trim().toUpperCase() || null;
    if (patch.order !== undefined) data.order = patch.order;
    if (!Object.keys(data).length) throw new Error("ChÆ°a cÃ³ dá»¯ liá»‡u cáº­p nháº­t");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (prisma as any)[model];
    await prisma.$transaction(ids.map((id) => m.update({ where: { id }, data })));
    revalidatePath("/admin/catalog");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}
