"use client";

import { Menu, X } from "lucide-react";
import * as React from "react";

export function MobileSidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Mở menu"
      >
        <Menu className="size-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            className="fixed inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-10 w-64 overflow-y-auto">
            <button
              type="button"
              className="absolute right-2 top-3 z-20 grid size-7 place-items-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent"
              onClick={() => setOpen(false)}
              aria-label="Đóng"
            >
              <X className="size-4" />
            </button>
            <div onClick={() => setOpen(false)} role="presentation">
              {children}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
