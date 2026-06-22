"use client";

import React from "react";
import { Copy, Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveTaskResult } from "@/server/actions/tasks";

// Bỏ dấu " bao quanh (người dùng hay copy path có quotes)
function stripQuotes(v: string): string {
  return v.replace(/^["']|["']$/g, "").trim();
}

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

function isFilePath(v: string): boolean {
  // Windows drive path (T:\...) hoặc UNC path (\\server\...)
  return /^[a-zA-Z]:[\\\/]/.test(v) || /^\\\\/.test(v);
}


// Hiển thị kết quả: URL → link "Link" click mở tab mới; file path / text → "Link" với tooltip đường dẫn.
export function ResultDisplay({ value }: { value: string }) {
  const normalized = stripQuotes(value);

  if (isUrl(normalized)) {
    return (
      <a
        href={normalized}
        target="_blank"
        rel="noopener noreferrer"
        title={normalized}
        className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Link
      </a>
    );
  }

  // File path hoặc text thường — chỉ hiển thị "Link" + tooltip đường dẫn
  return (
    <span
      className="text-xs font-medium text-blue-600 cursor-default"
      title={normalized}
      onClick={(e) => e.stopPropagation()}
    >
      Link
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Đã copy!" : "Copy link"}
      className="shrink-0 rounded p-0.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
    </button>
  );
}

type ResultCellProps = {
  taskId: string;
  value: string | null;
  canEdit: boolean;
};

// Cell đầy đủ: hiển thị + inline edit (click pencil → input).
export function ResultCell({ taskId, value, canEdit }: ResultCellProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    setSaving(true);
    const trimmed = draft.trim();
    // Chuẩn hoá: bỏ quotes bao quanh trước khi lưu
    const cleaned = stripQuotes(trimmed) || null;
    await saveTaskResult({ id: taskId, result: cleaned });
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  }

  // Chặn mọi click trong cell bubble lên <tr> (tránh mở modal ghi giờ)
  function stopBubble(e: React.MouseEvent) {
    e.stopPropagation();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-0" onClick={stopBubble}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={save}
          disabled={saving}
          placeholder="Nhập URL hoặc đường dẫn file…"
          className="h-6 flex-1 min-w-0 rounded border border-blue-400 px-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); cancel(); }}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1 min-w-0" onClick={stopBubble}>
      {value ? (
        <ResultDisplay value={value} />
      ) : (
        canEdit ? (
          <span className="text-xs text-slate-300 italic select-none">—</span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )
      )}
      {value && <CopyButton value={stripQuotes(value)} />}
      {canEdit && (
        <button
          type="button"
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
          title="Sửa kết quả"
          className={cn(
            "shrink-0 rounded p-0.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50",
            "opacity-0 group-hover:opacity-100",
          )}
        >
          <Pencil className="size-3" />
        </button>
      )}
    </div>
  );
}
