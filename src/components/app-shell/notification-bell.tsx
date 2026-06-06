"use client";

import { Bell, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  type NotificationDTO,
} from "@/server/actions/notifications";
import { cn } from "@/lib/utils";

const POLL_MS = 45_000;

function timeAgo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export function NotificationBell() {
  const router = useRouter();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const [items, setItems] = React.useState<NotificationDTO[]>([]);
  const [loading, setLoading] = React.useState(false);

  const refreshCount = React.useCallback(async () => {
    try {
      setUnread(await getUnreadCount());
    } catch {
      /* bỏ qua lỗi mạng tạm thời */
    }
  }, []);

  // Poll số chưa đọc + làm mới khi quay lại tab.
  React.useEffect(() => {
    refreshCount();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshCount();
    }, POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCount]);

  // Click ra ngoài → đóng.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function loadList() {
    setLoading(true);
    try {
      const res = await getNotifications(20);
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      /* bỏ qua */
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function onClickItem(n: NotificationDTO) {
    setOpen(false);
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await markRead(n.id);
      } catch {
        /* bỏ qua */
      }
    }
    router.push("/manage");
  }

  async function onMarkAll() {
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    try {
      await markAllRead();
    } catch {
      /* bỏ qua */
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Thông báo"
        aria-label="Thông báo"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Thông báo</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Check className="size-3" /> Đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-[360px] overflow-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Đang tải…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Chưa có thông báo</p>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onClickItem(n)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60",
                        !n.isRead && "bg-primary/5",
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {!n.isRead && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                      )}
                      <span className="text-[11px] text-muted-foreground/70">
                        {timeAgo(n.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
