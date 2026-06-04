"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Panel dropdown render qua React Portal (→ document.body) và định vị `fixed`
 * theo vị trí của `anchorRef`. Mục đích: thoát mọi container `overflow`
 * (lưới /assign nằm trong `overflow-x-auto` sẽ cắt dropdown `absolute`
 * ở các dòng gần đáy / khi cuộn ngang).
 *
 * - Tự lật lên trên khi không đủ chỗ phía dưới.
 * - Bám theo anchor khi cuộn (capture để bắt cả cuộn trong overflow) / resize.
 * - Click ra ngoài (cả anchor lẫn panel) → gọi `onClose`.
 */
export function PortalDropdown({
  anchorRef,
  open,
  onClose,
  children,
  className,
  maxHeight = 224, // ~ max-h-56
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  maxHeight?: number;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      // Lật lên trên nếu dưới không đủ chỗ mà trên rộng hơn.
      const flipUp = spaceBelow < maxHeight && r.top > spaceBelow;
      // Đo DOM rồi đồng bộ vào state — pattern layout hợp lệ với useLayoutEffect.
      setStyle({
        position: "fixed",
        left: r.left,
        width: r.width,
        maxHeight,
        ...(flipUp
          ? { bottom: window.innerHeight - r.top + 4 }
          : { top: r.bottom + 4 }),
      });
    }
    place();
    // capture = true để bắt cuộn trong các container overflow lồng nhau.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchorRef, maxHeight]);

  // Click ra ngoài cả anchor lẫn panel → đóng.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, anchorRef, onClose]);

  if (!open || !style) return null;
  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className={cn("z-50 overflow-auto rounded-md border bg-popover shadow-md", className)}
    >
      {children}
    </div>,
    document.body,
  );
}
