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

    const dup = await prisma.project.findUnique({
      where: { code_name: { code, name } },
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
export async function saveProjectGroup(input: { id?: string; code: string; name: string; order?: number }) {
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
      await prisma.projectGroup.create({ data: { code, name, order: input.order ?? 0 } });
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
  constructionTypeId?: string | null;
  scale?: string | null;
}) {
  return runAction(async () => {
    await requireRole("ADMIN");
    const name = input.name.trim();
    if (!input.groupId) throw new Error("Chọn dự án");
    if (!name) throw new Error("Nhập tên hạng mục");
    const scale = input.scale?.trim() || null;
    const constructionTypeId = input.constructionTypeId || null;

    const group = await prisma.projectGroup.findUnique({
      where: { id: input.groupId },
      select: { code: true },
    });
    if (!group) throw new Error("Dự án không tồn tại");
    const code = group.code;

    const dup = await prisma.project.findUnique({
      where: { code_name: { code, name } },
      select: { id: true },
    });
    if (dup && dup.id !== input.id) throw new Error(`Hạng mục "${name}" đã tồn tại trong dự án này`);

    if (input.id) {
      await prisma.project.update({
        where: { id: input.id },
        data: { groupId: input.groupId, code, name, scale, constructionTypeId },
      });
    } else {
      await prisma.project.create({
        data: { groupId: input.groupId, code, name, scale, constructionTypeId },
      });
    }
    revalidatePath("/admin/catalog", "layout");
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
    revalidatePath("/manage");
    revalidatePath("/assign");
  });
}
