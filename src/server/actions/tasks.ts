"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { canAssign, canManage, requireUser } from "@/server/auth/permissions";
import {
  bulkDeadlineSchema,
  bulkPrioritySchema,
  bulkReassignSchema,
  bulkStatusSchema,
  taskBatchSchema,
  taskSchema,
  taskStatusSchema,
} from "@/lib/schemas/task";
import { runAction } from "./_helpers";

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Tên hiển thị mặc định khi để trống: lấy theo cấp cụ thể nhất.
function defaultTaskName(r: {
  name?: string | null;
  level5?: string | null;
  level3?: string | null;
  level2?: string | null;
}): string {
  return r.name || r.level5 || r.level3 || r.level2 || "Công việc";
}

// Tự thêm giá trị Level 2/3/5 vào danh mục của nhóm (nếu là giá trị mới).
async function ensureCatalog(workGroupId: string, level: number, value?: string | null) {
  const v = value?.trim();
  if (!v) return;
  await prisma.catalogItem.upsert({
    where: { workGroupId_level_value: { workGroupId, level, value: v } },
    update: {},
    create: { workGroupId, level, value: v },
  });
}

export async function saveTask(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const data = taskSchema.parse(input);

    // Sửa việc có sẵn: chỉ Quản trị/Cấp 1. Tạo & giao việc mới: thêm cả Cấp 2.
    if (data.id) {
      if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được sửa công việc");
    } else {
      if (!canAssign(user.role)) throw new Error("Bạn không có quyền giao việc");
    }

    const name = defaultTaskName(data);
    const assigneeIds = [...new Set((data.assigneeIds ?? []).filter(Boolean))];

    const payload = {
      workGroupId: data.workGroupId,
      projectId: data.projectId || null,
      disciplineId: data.disciplineId || null,
      phaseId: data.phaseId || null,
      sumId: data.sumId || null,
      subId: data.subId || null,
      level2: data.level2 || null,
      level3: data.level3 || null,
      level5: data.level5 || null,
      name,
      priority: data.priority ?? "TRUNG_BINH",
      status: data.status ?? "CHUA_LAM",
      progressPercent: data.progressPercent ?? 0,
      plannedStart: toDate(data.plannedStart),
      plannedEnd: toDate(data.plannedEnd),
      note: data.note || null,
    };

    if (data.id) {
      await prisma.task.update({ where: { id: data.id }, data: payload });
      // đồng bộ người thực hiện
      await prisma.taskAssignee.deleteMany({ where: { taskId: data.id } });
      if (assigneeIds.length > 0) {
        await prisma.taskAssignee.createMany({
          data: assigneeIds.map((userId, i) => ({ taskId: data.id as string, userId, roleNo: i + 1 })),
        });
      }
    } else {
      const created = await prisma.task.create({
        data: {
          ...payload,
          wbsPath: data.sumId || randomUUID(),
          level: 5,
          assignees: {
            create: assigneeIds.map((userId, i) => ({ userId, roleNo: i + 1 })),
          },
        },
      });
      void created;
    }

    await Promise.all([
      ensureCatalog(data.workGroupId, 2, data.level2),
      ensureCatalog(data.workGroupId, 3, data.level3),
      ensureCatalog(data.workGroupId, 5, data.level5),
    ]);

    revalidatePath("/tasks");
    revalidatePath("/reports");
    revalidatePath("/admin/catalog");
  });
}

/**
 * Giao việc hàng loạt từ lưới (trang /assign): mỗi dòng tạo 1 việc với các trường
 * phân loại, dùng ưu tiên/trạng thái mặc định và chưa gán người thực hiện.
 */
export async function saveTasksBatch(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAssign(user.role)) throw new Error("Bạn không có quyền giao việc");

    const rows = taskBatchSchema.parse(input).filter((r) => r.workGroupId);
    if (rows.length === 0) throw new Error("Chưa có dòng nào để giao (cần chọn Nhóm công việc)");

    // Cấp seq (Id "abbr-001" theo nhóm) một cách nguyên tử + tạo việc trong 1 transaction.
    await prisma.$transaction(async (tx) => {
      // Gom dòng theo nhóm để cấp 1 dải seq liên tục cho mỗi nhóm.
      const byGroup = new Map<string, number[]>();
      rows.forEach((r, i) => {
        const list = byGroup.get(r.workGroupId);
        if (list) list.push(i);
        else byGroup.set(r.workGroupId, [i]);
      });

      const seqByIndex = new Array<number>(rows.length);
      for (const [workGroupId, idxs] of byGroup) {
        // Tăng lastSeq một lần cho cả nhóm → khóa dòng WorkGroup, không bị đua.
        const wg = await tx.workGroup.update({
          where: { id: workGroupId },
          data: { lastSeq: { increment: idxs.length } },
          select: { lastSeq: true },
        });
        const firstSeq = wg.lastSeq - idxs.length + 1;
        idxs.forEach((idx, k) => {
          seqByIndex[idx] = firstSeq + k;
        });
      }

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        // Bỏ trùng người (TaskAssignee unique theo [taskId, userId]).
        const assigneeIds = [...new Set((r.assigneeIds ?? []).filter(Boolean))];
        await tx.task.create({
          data: {
            workGroupId: r.workGroupId,
            projectId: r.projectId || null,
            disciplineId: r.disciplineId || null,
            phaseId: r.phaseId || null,
            level2: r.level2 || null,
            level3: r.level3 || null,
            level5: r.level5 || null,
            name: defaultTaskName(r),
            priority: r.priority ?? "TRUNG_BINH",
            plannedStart: toDate(r.plannedStart),
            plannedEnd: toDate(r.plannedEnd),
            seq: seqByIndex[i],
            wbsPath: randomUUID(),
            level: 5,
            assignees: {
              create: assigneeIds.map((userId, k) => ({ userId, roleNo: k + 1 })),
            },
          },
        });
      }
    });

    // Bổ sung danh mục Level 2/3/5 mới cho từng nhóm.
    await Promise.all(
      rows.flatMap((r) => [
        ensureCatalog(r.workGroupId, 2, r.level2),
        ensureCatalog(r.workGroupId, 3, r.level3),
        ensureCatalog(r.workGroupId, 5, r.level5),
      ]),
    );

    revalidatePath("/tasks");
    revalidatePath("/reports");
    revalidatePath("/admin/catalog");
    revalidatePath("/assign");
    return rows.length;
  });
}

export async function updateTaskStatus(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const data = taskStatusSchema.parse(input);

    // LEVEL_2 chỉ cập nhật việc được giao; LEVEL_1/ADMIN cập nhật mọi việc
    if (!canManage(user.role)) {
      const assigned = await prisma.taskAssignee.findFirst({
        where: { taskId: data.id, userId: user.id },
      });
      if (!assigned) throw new Error("Bạn không được giao công việc này");
    }

    await prisma.task.update({
      where: { id: data.id },
      data: {
        status: data.status,
        progressPercent: data.progressPercent ?? (data.status === "HOAN_THANH" ? 100 : undefined),
        actualEnd: data.status === "HOAN_THANH" ? new Date() : null,
      },
    });
    revalidatePath("/tasks");
    revalidatePath("/reports");
  });
}

// ============================================================
//  Thao tác hàng loạt — chỉ Quản trị/Cấp 1 (tab /manage)
// ============================================================

// Quy tắc đồng bộ status <-> progress, dùng chung cho mọi đường đổi trạng thái:
//   HOAN_THANH => 100% + chốt actualEnd; CHUA_LAM => 0%; còn lại giữ nguyên progress.
function statusSideEffects(status: "CHUA_LAM" | "DANG_LAM" | "HOAN_THANH" | "TAM_DUNG") {
  return {
    status,
    actualEnd: status === "HOAN_THANH" ? new Date() : null,
    ...(status === "HOAN_THANH" ? { progressPercent: 100 } : {}),
    ...(status === "CHUA_LAM" ? { progressPercent: 0 } : {}),
  };
}

function revalidateTaskViews() {
  revalidatePath("/manage");
  revalidatePath("/tasks");
  revalidatePath("/reports");
}

/** Đổi trạng thái nhiều việc cùng lúc (đồng bộ progress theo quy tắc chung). */
export async function bulkSetStatus(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được đổi trạng thái hàng loạt");
    const { ids, status } = bulkStatusSchema.parse(input);
    const res = await prisma.task.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: statusSideEffects(status),
    });
    revalidateTaskViews();
    return res.count;
  });
}

/** Đổi ưu tiên nhiều việc cùng lúc. */
export async function bulkSetPriority(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được đổi ưu tiên hàng loạt");
    const { ids, priority } = bulkPrioritySchema.parse(input);
    const res = await prisma.task.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { priority },
    });
    revalidateTaskViews();
    return res.count;
  });
}

/** Dời hạn (plannedEnd) nhiều việc cùng lúc. */
export async function bulkSetDeadline(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được đổi hạn hàng loạt");
    const { ids, plannedEnd } = bulkDeadlineSchema.parse(input);
    const d = toDate(plannedEnd);
    if (!d) throw new Error("Ngày hạn không hợp lệ");
    const res = await prisma.task.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { plannedEnd: d },
    });
    revalidateTaskViews();
    return res.count;
  });
}

/**
 * Giao lại người thực hiện hàng loạt.
 * - mode "replace" (mặc định): xóa hết người cũ rồi gán danh sách mới.
 * - mode "add": chỉ thêm người chưa có, giữ nguyên người cũ (đánh số roleNo tiếp).
 */
export async function bulkReassign(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được giao lại hàng loạt");
    const { ids, assigneeIds, mode } = bulkReassignSchema.parse(input);
    const newIds = [...new Set(assigneeIds.filter(Boolean))];

    const count = await prisma.$transaction(async (tx) => {
      // Chỉ thao tác trên việc chưa xóa.
      const tasks = await tx.task.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true },
      });
      const validIds = tasks.map((t) => t.id);
      if (validIds.length === 0) return 0;

      if (mode === "replace") {
        await tx.taskAssignee.deleteMany({ where: { taskId: { in: validIds } } });
        if (newIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: validIds.flatMap((taskId) =>
              newIds.map((userId, i) => ({ taskId, userId, roleNo: i + 1 })),
            ),
          });
        }
      } else {
        // add: thêm vào sau danh sách hiện có, bỏ qua người đã có.
        for (const taskId of validIds) {
          const existing = await tx.taskAssignee.findMany({
            where: { taskId },
            select: { userId: true, roleNo: true },
          });
          const have = new Set(existing.map((e) => e.userId));
          let next = existing.reduce((m, e) => Math.max(m, e.roleNo), 0) + 1;
          const toAdd = newIds.filter((u) => !have.has(u));
          if (toAdd.length > 0) {
            await tx.taskAssignee.createMany({
              data: toAdd.map((userId) => ({ taskId, userId, roleNo: next++ })),
            });
          }
        }
      }
      return validIds.length;
    });

    revalidateTaskViews();
    return count;
  });
}

export async function deleteTask(id: string) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Không đủ quyền");
    await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/tasks");
    revalidatePath("/reports");
  });
}
