"use client";
import * as React from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

// yyyy-mm-dd → dd/mm/yyyy
function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// dd/mm/yyyy → yyyy-mm-dd  (trả "" nếu chưa đủ / không hợp lệ)
function displayToISO(display: string): string {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return "";
  return `${y}-${mo}-${d}`;
}

// Tự chèn dấu "/" khi gõ số: "01052025" → "01/05/2025"
function applyMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> {
  /** ISO yyyy-mm-dd — controlled */
  value?: string;
  /** ISO yyyy-mm-dd — uncontrolled khởi tạo */
  defaultValue?: string;
  /** Nhận ISO yyyy-mm-dd (hoặc "" khi chưa đủ) trong e.target.value */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, defaultValue, onChange, name, className, id, required, disabled, style, ...rest }, ref) => {
    const isControlled = value !== undefined;
    const initISO = value ?? defaultValue ?? "";
    const [display, setDisplay] = React.useState(() => isoToDisplay(initISO));
    const [iso, setIso] = React.useState(initISO);

    // Đồng bộ khi prop value thay đổi từ bên ngoài
    React.useEffect(() => {
      if (!isControlled) return;
      const currentISO = displayToISO(display);
      if (currentISO !== (value ?? "")) {
        setDisplay(isoToDisplay(value ?? ""));
        setIso(value ?? "");
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, isControlled]);

    function fireChange(newISO: string, baseEvent: React.ChangeEvent<HTMLInputElement>) {
      if (onChange) {
        const fakeEvent = { ...baseEvent, target: { ...baseEvent.target, value: newISO } } as React.ChangeEvent<HTMLInputElement>;
        onChange(fakeEvent);
      }
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const masked = applyMask(e.target.value);
      setDisplay(masked);
      const newISO = displayToISO(masked);
      setIso(newISO);
      fireChange(newISO, e);
    }

    // Khi chọn từ calendar picker (native date input ẩn)
    function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
      const newISO = e.target.value; // yyyy-mm-dd
      setDisplay(isoToDisplay(newISO));
      setIso(newISO);
      fireChange(newISO, e);
    }

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/yyyy"
          value={display}
          onChange={handleChange}
          maxLength={10}
          id={id}
          required={required}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          style={{ paddingRight: "2rem", ...style }}
          {...rest}
        />
        {/* Icon lịch — chỉ hiển thị, không bắt sự kiện */}
        <CalendarDays className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        {/* Native date picker ẩn phủ lên icon lịch để user click mở lịch */}
        <input
          type="date"
          tabIndex={-1}
          value={iso}
          disabled={disabled}
          onChange={handlePickerChange}
          className="absolute inset-y-0 right-0 w-8 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        {/* Input ẩn mang giá trị ISO cho FormData khi dùng kiểu uncontrolled (name prop) */}
        {name ? <input type="hidden" name={name} value={iso} /> : null}
      </div>
    );
  },
);
DateInput.displayName = "DateInput";
