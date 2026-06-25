"use client";

import React from "react";
import { Copy, Check, Pencil, X, Plus } from "lucide-react";
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
  return /^[a-zA-Z]:[\\\/]/.test(v) || /^\\\\/.test(v);
}

// Lấy thư mục cha của đường dẫn file (nếu là file có đuôi mở rộng → bỏ tên file).
function getParentFolder(p: string): string {
  const clean = p.replace(/[/\\]$/, ""); // bỏ trailing slash
  const lastBackslash = clean.lastIndexOf("\\");
  const lastSlash = clean.lastIndexOf("/");
  const lastSep = Math.max(lastBackslash, lastSlash);
  if (lastSep <= 2) return p; // root như C:\ hoặc \\server
  const lastPart = clean.slice(lastSep + 1);
  // Có dấu chấm → đây là file → lấy phần thư mục
  if (lastPart.includes(".")) {
    return clean.slice(0, lastSep + 1);
  }
  return p; // đã là thư mục
}

// Tạo href cho từng loại link
function buildHref(v: string): string {
  if (isUrl(v)) return v;
  if (isFilePath(v)) {
    const folder = getParentFolder(v);
    return "file:///" + folder.replace(/\\/g, "/");
  }
  return "#";
}

// Tách result thành tối đa 2 link (phân cách bằng \n)
function parseLinks(value: string): string[] {
  return value.split("\n").map((s) => stripQuotes(s.trim())).filter(Boolean).slice(0, 2);
}

// Ghép 2 link thành 1 chuỗi lưu DB
export function joinLinks(l1: string, l2: string): string | null {
  const a = stripQuotes(l1.trim());
  const b = stripQuotes(l2.trim());
  if (!a && !b) return null;
  if (!b) return a || null;
  return [a, b].filter(Boolean).join("\n");
}

// Hiển thị 1 link
function LinkItem({ value, label }: { value: string; label: string }) {
  const href = buildHref(value);
  const cls = "text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline";
  if (href === "#") {
    return (
      <span className="text-xs font-medium text-blue-600 cursor-default" title={value}>
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={value}
      className={cls}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  );
}

// Hiển thị kết quả: 1 link → "Link", 2 link → "Link1 · Link2"
export function ResultDisplay({ value }: { value: string }) {
  const links = parseLinks(value);
  if (links.length === 0) return null;
  if (links.length === 1) {
    return <LinkItem value={links[0]} label="Link" />;
  }
  return (
    <span className="flex items-center gap-1">
      <LinkItem value={links[0]} label="Link1" />
      <span className="text-slate-300 text-xs">·</span>
      <LinkItem value={links[1]} label="Link2" />
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

// Cell đầy đủ: hiển thị + inline edit (click pencil → 2 input với nút +).
export function ResultCell({ taskId, value, canEdit }: ResultCellProps) {
  const [editing, setEditing] = React.useState(false);
  const links = value ? parseLinks(value) : [];
  const [draft1, setDraft1] = React.useState(links[0] ?? "");
  const [draft2, setDraft2] = React.useState(links[1] ?? "");
  const [showLink2, setShowLink2] = React.useState(!!(links[1]));
  const [saving, setSaving] = React.useState(false);
  const input1Ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) input1Ref.current?.focus();
  }, [editing]);

  function openEdit() {
    const ls = value ? parseLinks(value) : [];
    setDraft1(ls[0] ?? "");
    setDraft2(ls[1] ?? "");
    setShowLink2(!!(ls[1]));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const combined = joinLinks(draft1, showLink2 ? draft2 : "");
    await saveTaskResult({ id: taskId, result: combined });
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  }

  function stopBubble(e: React.MouseEvent) {
    e.stopPropagation();
  }

  if (editing) {
    return (
      <div className="relative h-5 min-w-[24px]" onClick={stopBubble}>
        <div className="absolute bottom-0 left-0 z-50 w-[320px] rounded border border-blue-400 bg-white px-1.5 py-1 shadow-lg space-y-1">
          {/* Link 1 */}
          <div className="flex items-center gap-1">
            <input
              ref={input1Ref}
              value={draft1}
              onChange={(e) => setDraft1(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={saving}
              placeholder="URL hoặc đường dẫn file…"
              className="h-6 flex-1 min-w-0 text-xs outline-none"
            />
            {!showLink2 && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setShowLink2(true); }}
                title="Thêm link thứ 2"
                className="shrink-0 rounded p-0.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50"
              >
                <Plus className="size-3" />
              </button>
            )}
          </div>
          {/* Link 2 */}
          {showLink2 && (
            <div className="flex items-center gap-1">
              <input
                value={draft2}
                onChange={(e) => setDraft2(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={saving}
                placeholder="Đường dẫn thứ 2 (tùy chọn)…"
                className="h-6 flex-1 min-w-0 text-xs outline-none"
              />
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setShowLink2(false); setDraft2(""); }}
                title="Xóa link thứ 2"
                className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          {/* Actions */}
          <div className="flex justify-end gap-1 pt-0.5">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cancel(); }}
              className="text-xs px-2 py-0.5 rounded text-slate-500 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); save(); }}
              disabled={saving}
              className="text-xs px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              Lưu
            </button>
          </div>
        </div>
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
      {value && <CopyButton value={value} />}
      {canEdit && (
        <button
          type="button"
          onClick={openEdit}
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
