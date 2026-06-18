// Tiện ích lát cắt thời gian — dùng chung cho toàn bộ tab Báo cáo.

import type { TaskRow } from "./report-data";

export type PeriodType = "all" | "week" | "month" | "quarter" | "year";

export type PeriodBounds = { start: string; end: string; label: string };

// --- Date helpers ---

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtShort(d: Date): string {
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

export function getISOWeekYear(date: Date): { year: number; week: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const thu = new Date(d);
  thu.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan1 = new Date(thu.getFullYear(), 0, 1);
  return {
    year: thu.getFullYear(),
    week:
      1 +
      Math.round(
        ((thu.getTime() - jan1.getTime()) / 86400000 - 3 + ((jan1.getDay() + 6) % 7)) / 7,
      ),
  };
}

export function isoWeeksInYear(year: number): number {
  const p = (y: number) => {
    const x = y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
    return x % 7;
  };
  return p(year) === 4 || p(year - 1) === 3 ? 53 : 52;
}

// Tuần T2–T7 (Monday–Saturday)
export function getWeekBounds(year: number, week: number): PeriodBounds {
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dow + (week - 1) * 7);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  return {
    start: toISO(monday),
    end: toISO(saturday),
    label: `Tuần ${week} · ${fmtShort(monday)}–${fmtShort(saturday)}/${saturday.getFullYear()}`,
  };
}

export function getMonthBounds(year: number, month: number): PeriodBounds {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = month.toString().padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${lastDay.toString().padStart(2, "0")}`,
    label: `Tháng ${month}/${year}`,
  };
}

export function getQuarterBounds(year: number, q: number): PeriodBounds {
  const sm = (q - 1) * 3 + 1;
  const em = q * 3;
  const lastDay = new Date(year, em, 0).getDate();
  return {
    start: `${year}-${sm.toString().padStart(2, "0")}-01`,
    end: `${year}-${em.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`,
    label: `Quý ${q} · ${year}`,
  };
}

export function getYearBounds(year: number): PeriodBounds {
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Năm ${year}` };
}

export function getBounds(
  type: PeriodType,
  year: number,
  week: number,
  month: number,
  quarter: number,
): PeriodBounds | null {
  if (type === "all") return null;
  if (type === "week") return getWeekBounds(year, week);
  if (type === "month") return getMonthBounds(year, month);
  if (type === "quarter") return getQuarterBounds(year, quarter);
  return getYearBounds(year);
}

// --- Lọc theo kỳ ---
// Nếu đã hoàn thành (thucTe có giá trị): chỉ hiện khi thucTe nằm trong kỳ.
// Nếu chưa hoàn thành: hiện nếu task còn "open" trong kỳ:
//   - Chưa có lịch (không có cả batDau lẫn ketThuc)
//   - ketThuc >= ps (deadline trong hoặc sau kỳ)
//   - batDau <= pe (bắt đầu trước kỳ kết thúc, không có deadline = đang chạy)
//   - Timeline [batDau, ketThuc] giao với [ps, pe]
export function taskInPeriod(r: TaskRow, ps: string, pe: string): boolean {
  const { batDau, ketThuc, thucTe } = r;
  if (thucTe) return thucTe >= ps && thucTe <= pe;
  if (!batDau && !ketThuc) return true;
  if (!batDau && ketThuc) return ketThuc >= ps;
  if (batDau && !ketThuc) return batDau <= pe;
  return (batDau as string) <= pe && (ketThuc as string) >= ps;
}

export function filterByPeriod(rows: TaskRow[], bounds: PeriodBounds | null): TaskRow[] {
  if (!bounds) return rows;
  return rows.filter((r) => taskInPeriod(r, bounds.start, bounds.end));
}
