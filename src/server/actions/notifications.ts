"use server";

import { prisma } from "@/server/db/client";
import { requireUser } from "@/server/auth/permissions";
import { ensureDeadlineReminders } from "@/server/notifications/service";

export type NotificationDTO = {
  id: string;
  type: string;
  taskId: string | null;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string; // ISO — client tự format
};

/** Số thông báo chưa đọc (kèm sinh lười nhắc "sắp đến hạn"). */
export async function getUnreadCount(): Promise<number> {
  const user = await requireUser();
  await ensureDeadlineReminders(user.id);
  return prisma.notification.count({ where: { userId: user.id, isRead: false } });
}

/** Danh sách thông báo mới nhất + số chưa đọc. */
export async function getNotifications(
  limit = 20,
): Promise<{ items: NotificationDTO[]; unread: number }> {
  const user = await requireUser();
  await ensureDeadlineReminders(user.id);
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return {
    items: rows.map((n) => ({
      id: n.id,
      type: n.type,
      taskId: n.taskId,
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  };
}

/** Đánh dấu 1 thông báo đã đọc (chỉ của chính mình). */
export async function markRead(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id, userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

/** Đánh dấu tất cả đã đọc. */
export async function markAllRead(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
