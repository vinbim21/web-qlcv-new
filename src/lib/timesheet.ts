import dayjs from "dayjs";

/** Thứ Hai đầu tuần của ngày cho trước. */
export function startOfWeek(date: Date | string): dayjs.Dayjs {
  const d = dayjs(date);
  const dow = d.day(); // 0=CN..6=T7
  const diff = dow === 0 ? -6 : 1 - dow;
  return d.add(diff, "day").startOf("day");
}

export function weekDays(weekStart: dayjs.Dayjs): dayjs.Dayjs[] {
  return Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day"));
}

export const WEEKDAY_LABEL = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// TẠM THỜI mở khóa: cho mọi người sửa/xóa timesheet không giới hạn 2 ngày.
// Đổi về false để khôi phục giới hạn (chỉ trong 2 ngày, trừ admin).
const TIMESHEET_OPEN_EDIT = true;

/** Cho sửa nếu đang mở khóa tạm, hoặc trong vòng 2 ngày, hoặc là admin. */
export function canEditEntry(entryDate: Date | string, isAdmin: boolean): boolean {
  if (TIMESHEET_OPEN_EDIT || isAdmin) return true;
  const diff = dayjs().startOf("day").diff(dayjs(entryDate).startOf("day"), "day");
  return diff >= 0 && diff <= 2;
}
