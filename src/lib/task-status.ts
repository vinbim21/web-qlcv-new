// Trạng thái suy diễn — 1 nguồn sự thật dùng chung cho báo cáo, /manage, dashboard.
// Quy tắc (thứ tự ưu tiên):
//   1. HOAN_THANH                                            -> "HOAN_THANH"
//   2. có hạn & hạn < hôm nay & chưa hoàn thành              -> "QUA_HAN" (suy ra, không lưu DB)
//   3. CHUA_LAM & đã giao người & có ngày bắt đầu ≤ hôm nay  -> "DANG_LAM" (suy ra: đã khai báo thời gian)
//   4. còn lại                                               -> status gốc
// ⚠ KHÔNG dùng cho view Kanban (kéo-thả ghi status thật).

export type EffectiveStatus = "CHUA_LAM" | "DANG_LAM" | "HOAN_THANH" | "TAM_DUNG" | "QUA_HAN";

export type StatusInput = {
  status: string;
  plannedStart?: string | null; // "YYYY-MM-DD" hoặc rỗng
  plannedEnd?: string | null;
  assigneeCount: number;
};

/** Đầu ngày hôm nay (local) — mốc so sánh ngày. */
function startOfToday(): Date {
  return new Date(new Date().toDateString());
}

/** Quá hạn: có hạn, hạn < hôm nay, và chưa hoàn thành. */
export function isOverdue(input: { status: string; plannedEnd?: string | null }): boolean {
  if (!input.plannedEnd || input.status === "HOAN_THANH") return false;
  return new Date(input.plannedEnd) < startOfToday();
}

/** Đã khai báo thời gian & mốc bắt đầu đã tới (≤ hôm nay). */
function hasStarted(plannedStart?: string | null): boolean {
  if (!plannedStart) return false;
  const d = new Date(plannedStart);
  if (Number.isNaN(d.getTime())) return false;
  return d <= startOfToday();
}

/** Trạng thái hiển thị/đếm (gồm Quá hạn + nâng "Đang thực hiện" khi đã khai báo thời gian). */
export function effectiveStatus(input: StatusInput): EffectiveStatus {
  if (input.status === "HOAN_THANH") return "HOAN_THANH";
  if (isOverdue(input)) return "QUA_HAN";
  if (
    input.status === "CHUA_LAM" &&
    input.assigneeCount > 0 &&
    hasStarted(input.plannedStart)
  ) {
    return "DANG_LAM";
  }
  return input.status as EffectiveStatus;
}
