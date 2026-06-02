"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn, removeVietnameseTones } from "@/lib/utils";

export type TaskOption = { id: string; name: string };

/** Chọn 1 công việc, có ô gõ tìm kiếm nhanh (bỏ dấu tiếng Việt). */
export function TaskCombobox({
  tasks,
  value,
  onChange,
  placeholder = "Tìm công việc...",
  allowEmpty = true,
}: {
  tasks: TaskOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const deferred = React.useDeferredValue(query);

  // Chỉ mục bỏ dấu, dựng 1 lần.
  const index = React.useMemo(
    () => tasks.map((t) => ({ t, key: removeVietnameseTones(t.name) })),
    [tasks],
  );
  const selected = tasks.find((t) => t.id === value) ?? null;

  const matches = React.useMemo(() => {
    const q = removeVietnameseTones(deferred.trim());
    const list = q ? index.filter((x) => x.key.includes(q)) : index;
    return list.slice(0, 30).map((x) => x.t);
  }, [index, deferred]);

  // Đã chọn việc → hiện chip, cho đổi.
  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
        <span className="truncate">{selected.name}</span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
            setOpen(true);
          }}
          aria-label="Đổi công việc"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="pr-9"
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {allowEmpty ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                setOpen(false);
              }}
            >
              — Không gắn việc —
            </button>
          ) : null}
          {matches.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(t.id);
                setQuery("");
                setOpen(false);
              }}
            >
              <Check className="size-3.5 opacity-0" />
              <span className="truncate">{t.name}</span>
            </button>
          ))}
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Không tìm thấy công việc</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
