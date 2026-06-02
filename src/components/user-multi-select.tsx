"use client";

import { X } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { removeVietnameseTones } from "@/lib/utils";

export type UserOption = { id: string; fullName: string };

/** Chọn tối đa `max` người thực hiện, có tìm kiếm bỏ dấu. */
export function UserMultiSelect({
  users,
  value,
  onChange,
  max = 3,
}: {
  users: UserOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const selected = value
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is UserOption => !!u);

  const q = removeVietnameseTones(query);
  const matches = users
    .filter((u) => !value.includes(u.id) && removeVietnameseTones(u.fullName).includes(q))
    .slice(0, 8);

  function add(id: string) {
    if (value.length >= max) return;
    onChange([...value, id]);
    setQuery("");
  }
  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div className="space-y-1.5">
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
      </div>
      {value.length < max ? (
        <div className="relative">
          <Input
            value={query}
            placeholder={`Thêm người thực hiện (tối đa ${max})...`}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && matches.length > 0 ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
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
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
