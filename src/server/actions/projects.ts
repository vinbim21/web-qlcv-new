"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/permissions";
import { projectSchema } from "@/lib/schemas/project";
import { runAction } from "./_helpers";

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function saveProject(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN", "LEVEL_1");
    const data = projectSchema.parse(input);
    const payload = {
      code: data.code,
      name: data.name,
      status: data.status ?? "DANG_THUC_HIEN",
      constructionTypeId: data.constructionTypeId || null,
      startDate: toDate(data.startDate),
      endDate: toDate(data.endDate),
      description: data.description || null,
    };
    if (data.id) {
      await prisma.project.update({ where: { id: data.id }, data: payload });
    } else {
      await prisma.project.create({ data: payload });
    }
    revalidatePath("/admin/projects");
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// Lưu Dự án từ màn Khai báo danh mục (nhóm Quản lý BIM): CHỈ động tới mã/tên/quy mô,
// KHÔNG đụng status/giai đoạn/ngày... để tránh ghi đè dữ liệu dự án đã có.
export async function saveBimProject(input: {
  id?: string;
  code: string;
  name: string;
  scale?: string | null;
}) {
  return runAction(async () => {
    await requireRole("ADMIN", "LEVEL_1");
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code) throw new Error("Nhập mã dự án (Level 2)");
    if (!name) throw new Error("Nhập tên dự án (Level 3)");
    const scale = input.scale?.trim() || null;

    const dup = await prisma.project.findFirst({
      where: { code, name, deletedAt: null },
      select: { id: true },
    });
    if (dup && dup.id !== input.id) throw new Error(`Dự án "${code} — ${name}" đã tồn tại`);

    if (input.id) {
      await prisma.project.update({ where: { id: input.id }, data: { code, name, scale } });
    } else {
      await prisma.project.create({ data: { code, name, scale } });
    }
    revalidatePath("/admin/projects");
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// ----- Dự án (cấp cha = ProjectGroup) -----

// Lưu Dự án (cha) từ màn Khai báo. Tên do người dùng đặt; mã = khóa nhóm hạng mục.
export async function saveProjectGroup(input: { id?: string; code: string; name: string; order?: number; workGroupId?: string | null }) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code) throw new Error("Nhập mã dự án");
    if (!name) throw new Error("Nhập tên dự án");

    const dup = await prisma.projectGroup.findUnique({ where: { code }, select: { id: true } });
    if (dup && dup.id !== input.id) throw new Error(`Mã dự án "${code}" đã tồn tại`);

    if (input.id) {
      await prisma.projectGroup.update({ where: { id: input.id }, data: { code, name, order: input.order ?? 0 } });
    } else {
      await prisma.projectGroup.create({ data: { code, name, order: input.order ?? 0, workGroupId: input.workGroupId ?? null } });
    }
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// Xóa Dự án (cha): chặn nếu còn hạng mục thuộc dự án.
export async function deleteProjectGroup(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const itemCount = await prisma.project.count({ where: { groupId: id, deletedAt: null } });
    if (itemCount > 0) throw new Error("Dự án còn hạng mục, hãy gỡ/chuyển hạng mục trước khi xóa");
    await prisma.projectGroup.delete({ where: { id } });
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// ----- Hạng mục (= model Project) -----

// Lưu Hạng mục từ màn "Khai báo thông tin" (tab Dự án): chỉ động Dự án(group)/Tên/Loại hình/Quy mô.
// Mã (code) lấy theo Dự án cha. KHÔNG đụng status/giai đoạn/ngày — tránh ghi đè dữ liệu vận hành.
export async function saveCatalogProject(input: {
  id?: string;
  groupId: string;
  name: string;
  blockSystem?: string | null;
  constructionTypeId?: string | null;
  scale?: string | null;
  startDate?: string | null;
  packagingDate?: string | null;
}) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const name = input.name.trim();
    if (!input.groupId) throw new Error("Chọn dự án");
    if (!name) throw new Error("Nhập tên hạng mục");
    const blockSystem = input.blockSystem?.trim() || null;
    const scale = input.scale?.trim() || null;
    const startDate = toDate(input.startDate);
    const packagingDate = toDate(input.packagingDate);
    const constructionTypeId = input.constructionTypeId || null;

    const group = await prisma.projectGroup.findUnique({
      where: { id: input.groupId },
      select: { code: true },
    });
    if (!group) throw new Error("Dự án không tồn tại");
    const code = group.code;

    const dup = await prisma.project.findFirst({
      where: {
        code,
        name,
        constructionTypeId,
        blockSystem,
        deletedAt: null,
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new Error(`Hạng mục "${name}" đã tồn tại với cùng Dự án, Loại hình và Khối/Hệ thống`);

    if (input.id) {
      await prisma.project.update({
        where: { id: input.id },
        data: { groupId: input.groupId, code, name, blockSystem, scale, constructionTypeId, startDate, packagingDate },
      });
      // Đồng bộ ngày Bắt đầu/Đóng gói sang tất cả hạng mục cùng Dự án + cùng tên (khác Khối/Hệ thống)
      await prisma.project.updateMany({
        where: { groupId: input.groupId, name, id: { not: input.id }, deletedAt: null },
        data: { startDate, packagingDate },
      });
      await prisma.task.updateMany({
        where: { projectId: input.id, deletedAt: null },
        data: { level3: name },
      });
    } else {
      await prisma.project.create({
        data: { groupId: input.groupId, code, name, blockSystem, scale, constructionTypeId, startDate, packagingDate },
      });
    }
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

export async function batchSaveCatalogProjects(input: {
  groupId: string;
  constructionTypeId: string | null;
  items: { name: string; blockSystem?: string | null; scale: string | null }[];
}) {
  return runAction(async () => {
    await requireRole("ADMIN");
    if (!input.groupId) throw new Error("Chọn dự án");
    const validItems = input.items.map((i) => ({ ...i, name: i.name.trim() })).filter((i) => i.name);
    if (!validItems.length) throw new Error("Nhập ít nhất 1 hạng mục");

    const group = await prisma.projectGroup.findUnique({
      where: { id: input.groupId },
      select: { code: true },
    });
    if (!group) throw new Error("Dự án không tồn tại");
    const code = group.code;
    const constructionTypeId = input.constructionTypeId || null;

    const seen = new Set<string>();
    for (const item of validItems) {
      const scale = item.scale?.trim() || null;
      const blockSystem = item.blockSystem?.trim() || null;
      const duplicateKey = [code, constructionTypeId ?? "", item.name, blockSystem ?? ""].join("\u0000");
      if (seen.has(duplicateKey)) throw new Error(`Hạng mục "${item.name}" bị trùng trong danh sách nhập`);
      seen.add(duplicateKey);

      const dup = await prisma.project.findFirst({
        where: { code, name: item.name, constructionTypeId, blockSystem, deletedAt: null },
        select: { id: true },
      });
      if (dup) throw new Error(`Hạng mục "${item.name}" đã tồn tại với cùng Dự án, Loại hình và Khối/Hệ thống`);
      await prisma.project.create({
        data: { groupId: input.groupId, code, name: item.name, blockSystem, scale, constructionTypeId },
      });
    }
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

export async function deleteProject(id: string) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const taskCount = await prisma.task.count({ where: { projectId: id, deletedAt: null } });
    if (taskCount > 0) throw new Error("Dự án còn công việc, không thể xóa");
    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/admin/projects");
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}

// Tạo ProjectGroup và trả về id (dùng trong bulk edit)
export async function createProjectGroupReturnId(input: {
  code: string;
  name: string;
  workGroupId?: string | null;
}) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code) throw new Error("Nhập mã dự án");
    if (!name) throw new Error("Nhập tên dự án");
    const dup = await prisma.projectGroup.findUnique({ where: { code }, select: { id: true } });
    if (dup) throw new Error(`Mã "${code}" đã tồn tại`);
    const created = await prisma.projectGroup.create({
      data: { code, name, order: 0, workGroupId: input.workGroupId ?? null },
    });
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
    return { id: created.id };
  });
}

// Batch update Dự án / Loại hình / Hạng mục cho nhiều hạng mục (Tab Dự án)
export async function batchUpdateCatalogProjects(
  ids: string[],
  patch: { groupId?: string; constructionTypeId?: string | null; name?: string; blockSystem?: string | null },
) {
  return runAction(async () => {
    await requireRole("ADMIN");
    if (!ids.length) throw new Error("Không có mục nào được chọn");
    let newCode: string | undefined;
    if (patch.groupId) {
      const group = await prisma.projectGroup.findUnique({
        where: { id: patch.groupId },
        select: { code: true },
      });
      if (!group) throw new Error("Dự án không tồn tại");
      newCode = group.code;
    }
    for (const id of ids) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {};
      if (patch.groupId !== undefined) { data.groupId = patch.groupId; data.code = newCode; }
      if (patch.constructionTypeId !== undefined) data.constructionTypeId = patch.constructionTypeId || null;
      if (patch.name !== undefined && patch.name.trim()) data.name = patch.name.trim();
      if (patch.blockSystem !== undefined) data.blockSystem = patch.blockSystem?.trim() || null;
      if (Object.keys(data).length) {
        await prisma.project.update({ where: { id }, data });
        const taskData: { level3?: string } = {};
        if (patch.name !== undefined && patch.name.trim()) taskData.level3 = patch.name.trim();
        if (Object.keys(taskData).length) {
          await prisma.task.updateMany({ where: { projectId: id, deletedAt: null }, data: taskData });
        }
      }
    }
    revalidatePath("/admin/catalog", "layout");
    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}
