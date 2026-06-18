"use server";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { canAssign, canManage, requireUser } from "@/server/auth/permissions";
import { completionDateError, isStartGateLocked, shouldAutoStart } from "@/lib/task-status";
import { PRIORITY_LABEL } from "@/lib/labels";
import {
  createNotifications,
  notifyAssignment,
  notifyTasksChange,
} from "@/server/notifications/service";
import {
  bulkApprovalSchema,
  bulkDeadlineSchema,
  bulkDeleteSchema,
  bulkMeasureNormSchema,
  bulkPrioritySchema,
  bulkReassignSchema,
  bulkStatusSchema,
  taskBatchSchema,
  type TaskBatchRow,
  taskCompletionSchema,
  taskApprovalSchema,
  taskStartApprovalSchema,
  taskPausedSchema,
  taskSchema,
  taskStatusSchema,
} from "@/lib/schemas/task";
import { runAction } from "./_helpers";

const APPROVER_ROLES = new Set(["ADMIN", "LEVEL_1", "LEVEL_2"]);

// Chặn nhập thời gian khi việc đang "chờ duyệt khởi tạo".
const GATE_MSG = "Việc đang chờ duyệt — chưa thể nhập thời gian";

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ddmmyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
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

// Người duyệt (nếu có) phải là ADMIN / Cấp 1 / Cấp 2.
async function validateApprovers(approverIds: string[]) {
  if (approverIds.length === 0) return;
  const found = await prisma.user.findMany({
    where: { id: { in: approverIds }, deletedAt: null },
    select: { id: true, role: true },
  });
  const okIds = new Set(found.filter((u) => APPROVER_ROLES.has(u.role)).map((u) => u.id));
  if (approverIds.some((id) => !okIds.has(id))) {
    throw new Error("Người duyệt phải là tài khoản Quản trị / Cấp 1 / Cấp 2");
  }
}

/**
 * Tạo nhiều việc trong 1 transaction: cấp mã "abbr-001" theo nhóm + gán người + thông báo giao việc.
 * - forceAssigneeIds: ép danh sách người thực hiện (dùng cho "tự note việc của mình").
 * - Việc có approverId → chờ duyệt khởi tạo (startApprovedAt null), KHÔNG kèm ngày kế hoạch.
 * Trả về [{ id, approverId, name }] để gọi thông báo tiếp theo nếu cần.
 */
async function createTasksBatchTx(
  tx: Prisma.TransactionClient,
  rows: TaskBatchRow[],
  opts: { actorId: string; forceAssigneeIds?: string[] },
): Promise<{ id: string; approverId: string | null; name: string }[]> {
  // Gom dòng theo nhóm để cấp 1 dải seq liên tục cho mỗi nhóm.
  const byGroup = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const list = byGroup.get(r.workGroupId);
    if (list) list.push(i);
    else byGroup.set(r.workGroupId, [i]);
  });
  const seqByIndex = new Array<number>(rows.length);
  const sumIdByIndex = new Array<string>(rows.length);
  for (const [workGroupId, idxs] of byGroup) {
    const wg = await tx.workGroup.update({
      where: { id: workGroupId },
      data: { lastSeq: { increment: idxs.length } },
      select: { lastSeq: true, abbr: true, code: true },
    });
    const firstSeq = wg.lastSeq - idxs.length + 1;
    const prefix = wg.abbr || wg.code || "WG";
    idxs.forEach((idx, k) => {
      seqByIndex[idx] = firstSeq + k;
      sumIdByIndex[idx] = `${prefix}-${String(firstSeq + k).padStart(3, "0")}`;
    });
  }

  const out: { id: string; approverId: string | null; name: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const assigneeIds = [...new Set((opts.forceAssigneeIds ?? r.assigneeIds ?? []).filter(Boolean))];
    const name = defaultTaskName(r);
    const created = await tx.task.create({
      data: {
        workGroupId: r.workGroupId,
        projectId: r.projectId || null,
        disciplineId: r.disciplineId || null,
        phaseId: r.phaseId || null,
        level2: r.level2 || null,
        level3: r.level3 || null,
        level5: r.level5 || null,
        name,
        priority: r.priority ?? "TRUNG_BINH",
        plannedStart: toDate(r.plannedStart),
        plannedEnd: toDate(r.plannedEnd),
        approverId: r.approverId || null,
        startApprovedAt: null,
        seq: seqByIndex[i],
        sumId: sumIdByIndex[i],
        wbsPath: randomUUID(),
        level: 5,
        assignees: { create: assigneeIds.map((userId, k) => ({ userId, roleNo: k + 1 })) },
      },
      select: { id: true, approverId: true },
    });
    await notifyAssignment(tx, {
      taskId: created.id,
      taskName: name,
      recipientIds: assigneeIds,
      actorId: opts.actorId,
    });
    out.push({ id: created.id, approverId: created.approverId, name });
  }
  return out;
}

export async function saveTask(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const data = taskSchema.parse(input);

    // Sửa việc có sẵn: chỉ Quản trị/Cấp 1. Tạo & giao việc mới: thêm cả Cấp 2.
    let approverDateOnly = false;
    if (data.id) {
      if (!canManage(user.role)) {
        const cur = await prisma.task.findUnique({
          where: { id: data.id },
          select: { approverId: true },
        });
        if (!cur || cur.approverId !== user.id || !canAssign(user.role)) {
          throw new Error("Không đủ quyền sửa công việc");
        }
        approverDateOnly = true;
      }
    } else {
      if (!canAssign(user.role)) throw new Error("Bạn không có quyền giao việc");
    }

    const name = defaultTaskName(data);
    const assigneeIds = [...new Set((data.assigneeIds ?? []).filter(Boolean))];

    // Tự chuyển "Chưa làm" -> "Đang thực hiện" khi đã giao người & đã tới ngày bắt đầu.
    let status = data.status ?? "CHUA_LAM";
    if (shouldAutoStart({ status, plannedStart: data.plannedStart, assigneeCount: assigneeIds.length })) {
      status = "DANG_LAM";
    }

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
      status,
      measureNorm: data.measureNorm ?? false,
      progressPercent: data.progressPercent ?? 0,
      plannedStart: toDate(data.plannedStart),
      plannedEnd: toDate(data.plannedEnd),
      note: data.note || null,
    };

    // Ghi việc + đồng bộ người + thông báo trong 1 transaction (atomic).
    await prisma.$transaction(async (tx) => {
      let taskId: string;
      let newAssigneeIds: string[];

      if (data.id) {
        // Diff: chỉ báo người MỚI được thêm (sửa lại việc không spam người cũ).
        const prev = await tx.taskAssignee.findMany({
          where: { taskId: data.id },
          select: { userId: true },
        });
        const had = new Set(prev.map((p) => p.userId));
        newAssigneeIds = assigneeIds.filter((id) => !had.has(id));

        if (approverDateOnly) {
          await tx.task.update({
            where: { id: data.id },
            data: {
              plannedStart: toDate(data.plannedStart),
              plannedEnd: toDate(data.plannedEnd),
            },
          });
        } else {
          await tx.task.update({ where: { id: data.id }, data: payload });
          await tx.taskAssignee.deleteMany({ where: { taskId: data.id } });
          if (assigneeIds.length > 0) {
            await tx.taskAssignee.createMany({
              data: assigneeIds.map((userId, i) => ({ taskId: data.id as string, userId, roleNo: i + 1 })),
            });
          }
        }
        taskId = data.id;
      } else {
        const created = await tx.task.create({
          data: {
            ...payload,
            wbsPath: data.sumId || randomUUID(),
            level: 5,
            assignees: {
              create: assigneeIds.map((userId, i) => ({ userId, roleNo: i + 1 })),
            },
          },
        });
        taskId = created.id;
        newAssigneeIds = assigneeIds; // việc mới → tất cả là người mới
      }

      await notifyAssignment(tx, {
        taskId,
        taskName: name,
        recipientIds: newAssigneeIds,
        actorId: user.id,
      });
    });

    await Promise.all([
      ensureCatalog(data.workGroupId, 2, data.level2),
      ensureCatalog(data.workGroupId, 3, data.level3),
      ensureCatalog(data.workGroupId, 5, data.level5),
    ]);

    revalidateTaskViews();
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

    await validateApprovers([...new Set(rows.map((r) => r.approverId).filter(Boolean) as string[])]);

    // Cấp mã + tạo việc + thông báo giao việc trong 1 transaction (helper dùng chung).
    await prisma.$transaction((tx) => createTasksBatchTx(tx, rows, { actorId: user.id }));

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
    revalidatePath("/manage");
    return rows.length;
  });
}

/**
 * "Thêm công việc" tự-note ở trang Công việc của tôi: NV (MỌI cấp) tự tạo việc cho
 * CHÍNH MÌNH thực hiện, bắt buộc chọn Người duyệt (sếp). Việc ở trạng thái chờ duyệt
 * (khóa nhập thời gian) tới khi người duyệt duyệt. Gửi thông báo cho người duyệt.
 */
export async function saveMyTasks(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const rows = taskBatchSchema.parse(input).filter((r) => r.workGroupId);
    if (rows.length === 0) throw new Error("Chưa có dòng nào (cần chọn Nhóm công việc)");
    if (rows.some((r) => !r.approverId)) throw new Error("Mỗi việc phải chọn Người duyệt");
    await validateApprovers([...new Set(rows.map((r) => r.approverId as string))]);

    // Tự gán người thực hiện = chính mình.
    const created = await prisma.$transaction((tx) =>
      createTasksBatchTx(tx, rows, { actorId: user.id, forceAssigneeIds: [user.id] }),
    );

    // Thông báo cho người duyệt: "Có việc chờ bạn duyệt".
    await createNotifications(
      prisma,
      created
        .filter((c) => c.approverId)
        .map((c) => ({
          userId: c.approverId as string,
          actorId: user.id,
          type: "TASK_APPROVAL_REQUESTED" as const,
          taskId: c.id,
          title: "Có việc chờ bạn duyệt",
          body: c.name,
        })),
    );

    await Promise.all(
      rows.flatMap((r) => [
        ensureCatalog(r.workGroupId, 2, r.level2),
        ensureCatalog(r.workGroupId, 3, r.level3),
        ensureCatalog(r.workGroupId, 5, r.level5),
      ]),
    );

    revalidatePath("/tasks");
    revalidatePath("/manage");
    revalidatePath("/reports");
    revalidatePath("/admin/catalog");
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
    revalidateTaskViews();
  });
}

// Suy lại trạng thái khi KHÔNG hoàn thành & KHÔNG tạm dừng: Đang thực hiện nếu đã giao + tới ngày
// bắt đầu, ngược lại Chưa làm.
function deriveActiveStatus(plannedStart: Date | null, assigneeCount: number): "CHUA_LAM" | "DANG_LAM" {
  const ps = plannedStart ? plannedStart.toISOString().slice(0, 10) : null;
  return shouldAutoStart({ status: "CHUA_LAM", plannedStart: ps, assigneeCount }) ? "DANG_LAM" : "CHUA_LAM";
}

/**
 * Đánh dấu/huỷ hoàn thành bằng ngày "Thực tế hoàn thành" — trạng thái TỰ suy.
 * Có ngày → HOÀN THÀNH (100%). Bỏ ngày → suy lại Đang thực hiện/Chưa làm (0%).
 * Quyền: Quản trị/Cấp 1 hoặc người được giao việc.
 */
export async function setTaskCompletion(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const data = taskCompletionSchema.parse(input);
    if (!canManage(user.role)) {
      const assigned = await prisma.taskAssignee.findFirst({
        where: { taskId: data.id, userId: user.id },
      });
      if (!assigned) throw new Error("Bạn không được giao công việc này");
    }
    // Cổng duyệt khởi tạo: chưa duyệt thì chưa cho đặt/đổi ngày hoàn thành.
    const gate = await prisma.task.findUnique({
      where: { id: data.id },
      select: { approverId: true, startApprovedAt: true, plannedStart: true },
    });
    if (gate && isStartGateLocked(gate)) throw new Error(GATE_MSG);
    const date = toDate(data.actualEnd);
    if (date) {
      // Ngày hoàn thành không được trước ngày bắt đầu (cho phép bằng).
      const err = completionDateError(date, gate?.plannedStart ?? null);
      if (err) throw new Error(err);
      await prisma.task.update({
        where: { id: data.id },
        data: { actualEnd: date, status: "HOAN_THANH", progressPercent: 100 },
      });
    } else {
      const t = await prisma.task.findUnique({
        where: { id: data.id },
        select: { plannedStart: true, _count: { select: { assignees: true } } },
      });
      if (!t) throw new Error("Không tìm thấy công việc");
      await prisma.task.update({
        where: { id: data.id },
        data: { actualEnd: null, status: deriveActiveStatus(t.plannedStart, t._count.assignees), progressPercent: 0 },
      });
    }
    revalidateTaskViews();
  });
}

/** Tạm dừng / bỏ tạm dừng — CHỈ Quản trị/Cấp 1. Không áp lên việc đã hoàn thành. */
export async function setTaskPaused(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được tạm dừng công việc");
    const data = taskPausedSchema.parse(input);
    const t = await prisma.task.findUnique({
      where: { id: data.id },
      select: { plannedStart: true, actualEnd: true, _count: { select: { assignees: true } } },
    });
    if (!t) throw new Error("Không tìm thấy công việc");
    if (data.paused) {
      if (t.actualEnd) throw new Error("Việc đã hoàn thành — bỏ ngày hoàn thành trước khi tạm dừng");
      await prisma.task.update({ where: { id: data.id }, data: { status: "TAM_DUNG" } });
    } else {
      await prisma.task.update({
        where: { id: data.id },
        data: { status: deriveActiveStatus(t.plannedStart, t._count.assignees) },
      });
    }
    revalidateTaskViews();
  });
}

/** Duyệt / bỏ duyệt việc — CHỈ Quản trị/Cấp 1, chỉ áp lên việc đã hoàn thành. */
export async function setTaskApproval(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được duyệt công việc");
    const data = taskApprovalSchema.parse(input);
    const t = await prisma.task.findUnique({ where: { id: data.id }, select: { actualEnd: true } });
    if (!t) throw new Error("Không tìm thấy công việc");
    if (data.approved && !t.actualEnd) throw new Error("Chỉ duyệt được việc đã hoàn thành");
    await prisma.task.update({
      where: { id: data.id },
      data: data.approved
        ? { approvedAt: new Date(), approvedById: user.id }
        : { approvedAt: null, approvedById: null },
    });
    revalidateTaskViews();
  });
}

/**
 * Duyệt KHỞI TẠO: mở/khóa cổng cho phép người được giao NHẬP thời gian.
 * - Duyệt (approved=true): ghi startApprovedAt = now → mở khóa nhập.
 * - Thu hồi (approved=false): xóa startApprovedAt → khóa nhập. Nếu việc CHƯA có người duyệt
 *   (giao trực tiếp), gán luôn người thao tác làm approver để cổng (isStartGateLocked) kích hoạt.
 * Quyền: Quản lý (ADMIN/Cấp 1) — hoặc người duyệt được chỉ định.
 */
export async function setTaskStartApproval(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const data = taskStartApprovalSchema.parse(input);
    const t = await prisma.task.findUnique({
      where: { id: data.id },
      select: { approverId: true },
    });
    if (!t) throw new Error("Không tìm thấy công việc");
    const isApprover = !!t.approverId && t.approverId === user.id;
    if (!canManage(user.role) && !(isApprover && canAssign(user.role))) {
      throw new Error("Chỉ Quản lý hoặc người duyệt được chỉ định mới được duyệt");
    }
    await prisma.task.update({
      where: { id: data.id },
      data: {
        startApprovedAt: data.approved ? new Date() : null,
        // Thu hồi việc giao trực tiếp (chưa có approver) → gán người thao tác làm approver
        // để việc chuyển sang trạng thái "Chờ duyệt" (cổng khóa nhập).
        ...(!data.approved && !t.approverId ? { approverId: user.id } : {}),
      },
    });
    revalidateTaskViews();
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
    const count = await prisma.$transaction(async (tx) => {
      const res = await tx.task.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { priority },
      });
      await notifyTasksChange(tx, {
        taskIds: ids,
        type: "TASK_PRIORITY_CHANGED",
        actorId: user.id,
        title: "Việc của bạn đổi mức ưu tiên",
        bodyFor: (t) => `${t.name} — ưu tiên: ${PRIORITY_LABEL[priority] ?? priority}`,
      });
      return res.count;
    });
    revalidateTaskViews();
    return count;
  });
}

/** Bật/tắt cờ "cần đo định mức" (*) nhiều việc cùng lúc — phục vụ Báo cáo định mức. */
export async function bulkSetMeasureNorm(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được đánh dấu định mức hàng loạt");
    const { ids, measureNorm } = bulkMeasureNormSchema.parse(input);
    const res = await prisma.task.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { measureNorm },
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
    const count = await prisma.$transaction(async (tx) => {
      const res = await tx.task.updateMany({
        // Bỏ qua việc đang chờ duyệt khởi tạo (chưa cho đặt thời gian).
        where: {
          id: { in: ids },
          deletedAt: null,
          OR: [{ approverId: null }, { startApprovedAt: { not: null } }],
        },
        data: { plannedEnd: d },
      });
      await notifyTasksChange(tx, {
        taskIds: ids,
        type: "TASK_DEADLINE_CHANGED",
        actorId: user.id,
        title: "Việc của bạn đã được dời hạn",
        bodyFor: (t) => `${t.name} — hạn mới ${ddmmyyyy(d)}`,
      });
      return res.count;
    });
    revalidateTaskViews();
    return count;
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
        select: { id: true, name: true },
      });
      const validIds = tasks.map((t) => t.id);
      if (validIds.length === 0) return 0;
      const nameById = new Map(tasks.map((t) => [t.id, t.name]));
      // Chỉ báo người MỚI được thêm vào (theo từng việc).
      const newPairs: { userId: string; taskId: string }[] = [];

      if (mode === "replace") {
        // Lấy người cũ TRƯỚC khi xóa để loại khỏi danh sách báo (giữ lại = không mới).
        const existing = await tx.taskAssignee.findMany({
          where: { taskId: { in: validIds } },
          select: { taskId: true, userId: true },
        });
        const haveByTask = new Map<string, Set<string>>();
        for (const e of existing) {
          const s = haveByTask.get(e.taskId) ?? new Set<string>();
          s.add(e.userId);
          haveByTask.set(e.taskId, s);
        }
        await tx.taskAssignee.deleteMany({ where: { taskId: { in: validIds } } });
        if (newIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: validIds.flatMap((taskId) =>
              newIds.map((userId, i) => ({ taskId, userId, roleNo: i + 1 })),
            ),
          });
        }
        for (const taskId of validIds) {
          const have = haveByTask.get(taskId) ?? new Set<string>();
          for (const userId of newIds) {
            if (!have.has(userId)) newPairs.push({ userId, taskId });
          }
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
            for (const userId of toAdd) newPairs.push({ userId, taskId });
          }
        }
      }

      await createNotifications(
        tx,
        newPairs.map((p) => ({
          userId: p.userId,
          actorId: user.id,
          type: "TASK_ASSIGNED" as const,
          taskId: p.taskId,
          title: "Bạn được giao công việc mới",
          body: nameById.get(p.taskId) ?? "Công việc",
        })),
      );
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
    revalidateTaskViews();
  });
}

/** Người được giao tự cập nhật ngày bắt đầu (không cần duyệt). */
export async function setTaskPlannedStart(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { id, plannedStart } = (input as { id: string; plannedStart: string | null });
    const t = await prisma.task.findUnique({
      where: { id },
      select: { assignees: { where: { userId: user.id }, select: { id: true } } },
    });
    if (!t) throw new Error("Không tìm thấy công việc");
    if (!canManage(user.role) && t.assignees.length === 0) throw new Error("Không có quyền");
    await prisma.task.update({
      where: { id },
      data: { plannedStart: plannedStart ? new Date(plannedStart) : null },
    });
    revalidateTaskViews();
  });
}

/** Cập nhật ngày bắt đầu hàng loạt — quản lý hoặc người được giao đều dùng được. */
export async function bulkSetPlannedStart(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { ids, plannedStart } = input as { ids: string[]; plannedStart: string | null };
    const d = plannedStart ? new Date(plannedStart) : null;
    const isManager = canManage(user.role);
    // Nếu không phải manager, chỉ cập nhật các task mà user là assignee
    const where = isManager
      ? { id: { in: ids }, deletedAt: null }
      : { id: { in: ids }, deletedAt: null, assignees: { some: { userId: user.id } } };
    const res = await prisma.task.updateMany({ where, data: { plannedStart: d } });
    revalidateTaskViews();
    return res.count;
  });
}

/** Gửi yêu cầu đổi ngày kết thúc (nhiều task). Manager → đổi trực tiếp; Assignee → pending chờ duyệt. */
export async function requestEndDateChange(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { ids, plannedEnd } = input as { ids: string[]; plannedEnd: string };
    const d = toDate(plannedEnd);
    if (!d) throw new Error("Ngày không hợp lệ");
    const isManager = canManage(user.role);
    if (isManager) {
      // Quản lý: đổi trực tiếp, xóa pending nếu có
      const res = await prisma.task.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { plannedEnd: d, pendingPlannedEnd: null, endChangeRequesterId: null },
      });
      revalidateTaskViews();
      return res.count;
    } else {
      // Assignee: lưu pending, chờ quản lý duyệt
      const res = await prisma.task.updateMany({
        where: { id: { in: ids }, deletedAt: null, assignees: { some: { userId: user.id } } },
        data: { pendingPlannedEnd: d, endChangeRequesterId: user.id },
      });
      revalidateTaskViews();
      return res.count;
    }
  });
}

/** Quản lý duyệt yêu cầu đổi ngày kết thúc. */
export async function approveEndDateChange(id: string) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Không đủ quyền");
    const t = await prisma.task.findUnique({
      where: { id },
      select: { pendingPlannedEnd: true },
    });
    if (!t?.pendingPlannedEnd) throw new Error("Không có yêu cầu đổi ngày kết thúc");
    await prisma.task.update({
      where: { id },
      data: { plannedEnd: t.pendingPlannedEnd, pendingPlannedEnd: null, endChangeRequesterId: null },
    });
    revalidateTaskViews();
  });
}

/** Từ chối (hoặc hủy) yêu cầu đổi ngày kết thúc. */
export async function rejectEndDateChange(id: string) {
  return runAction(async () => {
    const user = await requireUser();
    const t = await prisma.task.findUnique({
      where: { id },
      select: { endChangeRequesterId: true, assignees: { where: { userId: user.id }, select: { id: true } } },
    });
    if (!t) throw new Error("Không tìm thấy công việc");
    const isOwner = t.endChangeRequesterId === user.id || canManage(user.role);
    if (!isOwner) throw new Error("Không đủ quyền");
    await prisma.task.update({
      where: { id },
      data: { pendingPlannedEnd: null, endChangeRequesterId: null },
    });
    revalidateTaskViews();
  });
}

/** Duyệt / thu hồi duyệt khởi tạo hàng loạt. */
export async function bulkSetApproval(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được duyệt hàng loạt");
    const { ids, approved } = bulkApprovalSchema.parse(input);
    const now = new Date();

    if (approved) {
      // Duyệt: updateMany là đủ.
      const res = await prisma.task.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { startApprovedAt: now },
      });
      revalidateTaskViews();
      return res.count;
    }

    // Thu hồi: task chưa có approverId → gán người thao tác làm approver
    // (giống setTaskStartApproval đơn lẻ) để cổng isStartGateLocked kích hoạt.
    const tasks = await prisma.task.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, approverId: true },
    });
    await prisma.$transaction(
      tasks.map((t) =>
        prisma.task.update({
          where: { id: t.id },
          data: {
            startApprovedAt: null,
            ...(!t.approverId ? { approverId: user.id } : {}),
          },
        }),
      ),
    );
    revalidateTaskViews();
    return tasks.length;
  });
}

/** Xóa mềm nhiều việc cùng lúc. */
export async function bulkDelete(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (!canManage(user.role)) throw new Error("Chỉ Quản trị/Cấp 1 được xóa hàng loạt");
    const { ids } = bulkDeleteSchema.parse(input);
    const res = await prisma.task.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    revalidateTaskViews();
    return res.count;
  });
}
