"use client";

import { X } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { PortalDropdown } from "@/components/ui/portal-dropdown";
import { cn, removeVietnameseTones } from "@/lib/utils";

export type UserOption = { id: string; fullName: string };

/** Chọn nhiều người thực hiện, có tìm kiếm bỏ dấu. `max` không truyền → không giới hạn. */
export function UserMultiSelect({
  users,
  value,
  onChange,
  max = Infinity,
  inputClassName,
  allowSelectAll = false,
}: {
  users: UserOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  /** Class áp cho ô nhập (vd để khớp chiều cao lưới). */
  inputClassName?: string;
  /** Hiện mục "Chọn tất cả" để gán hết người đang khớp bộ lọc. Mặc định tắt. */
  allowSelectAll?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = value
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is UserOption => !!u);

  const q = removeVietnameseTones(query);
  const allMatches = users.filter(
    (u) => !value.includes(u.id) && removeVietnameseTones(u.fullName).includes(q),
  );
  const matches = allMatches.slice(0, 8);

  function add(id: string) {
    if (value.length >= max) return;
    onChange([...value, id]);
    setQuery("");
  }
  function addAll() {
    const room = max - value.length;
    if (room <= 0) return;
    onChange([...value, ...allMatches.slice(0, room).map((u) => u.id)]);
    setQuery("");
  }
  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div className="space-y-1.5">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u, i) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs"
            >
              <span className="text-muted-foreground">{i + 1}.</span>
              {u.fullName}
              <button type="button" onClick={() => remove(u.id)} aria-label="Bỏ chọn">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange([]);
              setQuery("");
            }}
            className="inline-flex items-center text-muted-foreground hover:text-destructive"
            title="Xóa tất cả"
            aria-label="Xóa tất cả"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      {value.length < max ? (
        <div className="relative">
          <Input
            ref={inputRef}
            className={cn(inputClassName)}
            value={query}
            placeholder="Thêm người thực hiện..."
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          <PortalDropdown
            anchorRef={inputRef}
            open={open && matches.length > 0}
            onClose={() => setOpen(false)}
          >
            {allowSelectAll ? (
              <button
                type="button"
                className="block w-full border-b px-3 py-1.5 text-left text-sm font-medium hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addAll();
                }}
              >
                Chọn tất cả ({allMatches.length})
              </button>
            ) : null}
            {matches.map((u) => (
              <button
                key={u.id}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(u.id);
                }}
              >
                {u.fullName}
              </button>
            ))}
          </PortalDropdown>
        </div>
      ) : null}
    </div>
  );
}
