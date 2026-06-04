"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PortalDropdown } from "@/components/ui/portal-dropdown";
import { cn, removeVietnameseTones } from "@/lib/utils";

/**
 * Combobox 1 giá trị: style như <Select> (khung + mũi tên) nhưng gõ để tìm kiếm
 * trong `options` (bỏ dấu) và **cho phép nhập giá trị mới** (creatable).
 */
export function SearchableCombobox({
  value,
  onChange,
  options = [],
  placeholder = "—",
  className,
  creatable = true,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  /** Cho phép nhập giá trị mới ngoài `options`. Mặc định true. */
  creatable?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selectedRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const q = removeVietnameseTones(query);
  const matches = options.filter((o) => removeVietnameseTones(o).includes(q));
  const trimmed = query.trim();
  const showCreate = creatable && trimmed.length > 0 && !options.some((o) => o === trimmed);

  function commit(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  // Mở ra → focus input không cuộn ngang (tránh xô lệch lưới), rồi cuộn tới
  // mục đang chọn trong danh sách dài.
  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <Input
          ref={inputRef}
          className={cn("pr-8", className)}
          value={query}
          placeholder={creatable ? "Tìm hoặc gõ mới..." : "Tìm..."}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (creatable && trimmed) commit(trimmed);
              else if (matches[0]) commit(matches[0]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              setQuery("");
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 pr-8 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          onClick={() => {
            setQuery("");
            setOpen(true);
          }}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
        </button>
      )}
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

      <PortalDropdown anchorRef={rootRef} open={open} onClose={close}>
        {showCreate ? (
          <button
            type="button"
            className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-accent"
            onMouseDown={(e) => {
              e.preventDefault();
              commit(trimmed);
            }}
          >
            + Dùng: “{trimmed}”
          </button>
        ) : null}
        {matches.map((o) => (
          <button
            key={o}
            ref={o === value ? selectedRef : undefined}
            type="button"
            className={cn(
              "block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-accent",
              o === value && "bg-accent font-medium",
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              commit(o);
            }}
          >
            {o}
          </button>
        ))}
        {matches.length === 0 && !showCreate ? (
          <div className="px-3 py-1.5 text-sm text-muted-foreground">Không có gợi ý</div>
        ) : null}
      </PortalDropdown>
    </div>
  );
}
