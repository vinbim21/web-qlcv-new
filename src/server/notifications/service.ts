import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db/client";

/** Chấp nhận cả prisma gốc lẫn client trong transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

type NotifInput = {
  userId: string;
  actorId?: string | null;
  type: Prisma.NotificationCreateManyInput["type"];
  taskId?: string | null;
  title: string;
  body?: string | null;
  dedupeKey?: string | null;
};

/**
 * Ghi thông báo. Tự bỏ trường hợp người nhận trùng người gây ra (không tự báo
 * mình) và bỏ trùng theo `dedupeKey` (cho thông báo sinh lười).
 */
export async function createNotifications(db: Db, rows: NotifInput[]) {
  const data = rows
    .filter((r) => r.userId && r.userId !== r.actorId)
    .map((r) => ({
      userId: r.userId,
      actorId: r.actorId ?? null,
      type: r.type,
      taskId: r.taskId ?? null,
      title: r.title,
      body: r.body ?? null,
      dedupeKey: r.dedupeKey ?? null,
    }));
  if (data.length === 0) return;
  // skipDuplicates: bỏ qua bản trùng dedupeKey (NULL được Postgres coi là khác nhau
  // nên thông báo thường — dedupeKey null — không bị gộp).
  await db.notification.createMany({ data, skipDuplicates: true });
}

/** Báo "được giao việc" cho danh sách người nhận (đã là người MỚI thêm). */
export async function notifyAssignment(
  db: Db,
  opts: { taskId: string; taskName: string; recipientIds: string[]; actorId?: string | null },
) {
  if (opts.recipientIds.length === 0) return;
  await createNotifications(
    db,
    opts.recipientIds.map((userId) => ({
      userId,
      actorId: opts.actorId,
      type: "TASK_ASSIGNED" as const,
      taskId: opts.taskId,
      title: "Bạn được giao công việc mới",
      body: opts.taskName,
    })),
  );
}

/**
 * Báo thay đổi (đổi hạn / đổi ưu tiên) cho người đang được giao các việc trong
 * `taskIds`. Tự truy assignee + tên việc, loại người gây ra.
 */
export async function notifyTasksChange(
  db: Db,
  opts: {
    taskIds: string[];
    type: "TASK_DEADLINE_CHANGED" | "TASK_PRIORITY_CHANGED";
    actorId?: string | null;
    title: string;
    bodyFor: (task: { name: string }) => string;
  },
) {
  if (opts.taskIds.length === 0) return;
  const tasks = await db.task.findMany({
    where: { id: { in: opts.taskIds }, deletedAt: null },
    select: { id: true, name: true, assignees: { select: { userId: true } } },
  });
  const rows = tasks.flatMap((t) =>
    t.assignees.map((a) => ({
      userId: a.userId,
      actorId: opts.actorId,
      type: opts.type,
      taskId: t.id,
      title: opts.title,
      body: opts.bodyFor(t),
    })),
  );
  await createNotifications(db, rows);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function ddmmyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Sinh lười thông báo "sắp đến hạn" cho việc của chính `userId` có hạn trong
 * `withinDays` ngày tới (mặc định 3) và chưa hoàn thành. Idempotent nhờ
 * `dedupeKey` theo mốc hạn → mỗi việc chỉ nhắc 1 lần cho mỗi ngày-hạn.
 *
 * Chỉ tính từ hôm nay trở đi (không quét quá hạn cũ → tránh đổ hàng loạt nhắc
 * cho các việc trễ hạn từ lâu).
 */
export async function ensureDeadlineReminders(userId: string, withinDays = 3) {
  const today = startOfToday();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + withinDays);
  limit.setHours(23, 59, 59, 999);

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: "HOAN_THANH" },
      plannedEnd: { gte: today, lte: limit },
      assignees: { some: { userId } },
    },
    select: { id: true, name: true, plannedEnd: true },
  });
  if (tasks.length === 0) return;

  await createNotifications(
    prisma,
    tasks.map((t) => {
      const due = t.plannedEnd as Date;
      const key = due.toISOString().slice(0, 10);
      return {
        userId,
        actorId: null,
        type: "TASK_DEADLINE_SOON" as const,
        taskId: t.id,
        title: "Công việc sắp đến hạn",
        body: `${t.name} — hạn ${ddmmyyyy(due)}`,
        dedupeKey: `soon:${t.id}:${userId}:${key}`,
      };
    }),
  );
}
