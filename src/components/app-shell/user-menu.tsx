"use client";

import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { logoutAction } from "@/server/actions/auth";

export function UserMenu({ name, initials }: { name: string; initials: string }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);

  // Click ra ngoài → đóng.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md p-1 hover:bg-muted"
        aria-label="Tài khoản"
      >
        <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-medium">
          {initials}
        </span>
        <span className="hidden text-sm font-medium md:inline">{name}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60"
          >
            <KeyRound className="size-4" /> Đổi mật khẩu
          </Link>
          <form action={logoutAction} className="border-t">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
            >
              <LogOut className="size-4" /> Đăng xuất
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
