"use client";

import * as React from "react";

/**
 * Tay kéo giãn cột — đặt ở mép phải <th> (th cần className "relative").
 * Kéo để đổi độ rộng, nhấp đúp để đặt lại mặc định.
 */
export function ColResizeHandle({
  width,
  minW,
  maxW,
  onResize,
  onResizeEnd,
  onReset,
  draggingRef,
}: {
  width: number;
  minW: number;
  maxW: number;
  onResize: (px: number) => void;
  onResizeEnd: () => void;
  onReset: () => void;
  /** set true khi bắt đầu kéo, dùng để chặn click (sort/filter) trong lúc kéo */
  draggingRef?: React.MutableRefObject<boolean>;
}) {
  const startRef = React.useRef<{ x: number; w: number } | null>(null);
  const clamp = (n: number) => Math.min(maxW, Math.max(minW, Math.round(n)));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
      title="Kéo để giãn cột · nhấp đúp để đặt lại"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        startRef.current = { x: e.clientX, w: width };
        if (draggingRef) draggingRef.current = true;
      }}
      onPointerMove={(e) => {
        if (!startRef.current) return;
        onResize(clamp(startRef.current.w + (e.clientX - startRef.current.x)));
      }}
      onPointerUp={(e) => {
        if (!startRef.current) return;
        startRef.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        onResizeEnd();
        if (draggingRef) {
          setTimeout(() => {
            draggingRef.current = false;
          }, 0);
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
    />
  );
}
