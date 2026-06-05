// Trục thời gian cho báo cáo — gom theo Tuần (ISO) / Tháng / Quý / Năm.
// Mốc thời gian = Hạn (plannedEnd). Tuần dùng chuẩn ISO (T2–CN); quý/năm dương lịch.
// Lưu ý: ngày vào là chuỗi "YYYY-MM-DD" đã quy về ngày dương lịch — không dính lệch múi giờ.

import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import quarterOfYear from "dayjs/plugin/quarterOfYear";

dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);

export type PeriodType = "week" | "month" | "quarter" | "year";

export const PERIOD_TYPES: PeriodType[] = ["week", "month", "quarter", "year"];

export const PERIOD_LABEL: Record<PeriodType, string> = {
  week: "Tuần",
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};

/** Năm + chỉ số kỳ của một ngày. Trả null nếu rỗng/không hợp lệ (việc "Chưa có hạn"). */
export function periodOf(dateStr: string, type: PeriodType): { year: number; idx: number } | null {
  if (!dateStr) return null;
  const d = dayjs(dateStr);
  if (!d.isValid()) return null;
  switch (type) {
    case "week":
      return { year: d.isoWeekYear(), idx: d.isoWeek() };
    case "month":
      return { year: d.year(), idx: d.month() + 1 };
    case "quarter":
      return { year: d.year(), idx: d.quarter() };
    case "year":
      return { year: d.year(), idx: d.year() };
  }
}

/** Năm dương lịch của một ngày (để lọc bảng theo năm). */
export function yearOf(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = dayjs(dateStr);
  return d.isValid() ? d.year() : null;
}

/** Nhãn ngắn cho cột biểu đồ theo kỳ. */
export function periodLabel(type: PeriodType, idx: number): string {
  switch (type) {
    case "week":
      return `T${idx}`;
    case "month":
      return `Th${idx}`;
    case "quarter":
      return `Q${idx}`;
    case "year":
      return `${idx}`;
  }
}
