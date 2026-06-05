// Trạng thái công việc — dùng chung cho báo cáo, /manage, dashboard.
//
// "Đang thực hiện" giờ được LƯU THẬT trong DB (qua backfill 1 lần + tự set khi tạo/sửa việc),
// KHÔNG suy diễn nữa → combobox/KPI/báo cáo luôn khớp.
// effectiveStatus chỉ còn thêm lớp phủ "Quá hạn" (suy ra từ hạn, không lưu DB).

export type EffectiveStatus = "CHUA_LAM" | "DANG_LAM" | "HOAN_THANH" | "TAM_DUNG" | "QUA_HAN";

export type StatusInput = {
  status: string;
  plannedEnd?: string | null;
  // Hai trường dưới chỉ phục vụ shouldAutoStart (lúc lưu/backfill) — effectiveStatus KHÔNG dùng.
  plannedStart?: string | null;
  assigneeCount?: number;
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

/** Trạng thái hiển thị/đếm: status thật + lớp phủ Quá hạn. */
export function effectiveStatus(input: StatusInput): EffectiveStatus {
  if (input.status === "HOAN_THANH") return "HOAN_THANH";
  if (isOverdue(input)) return "QUA_HAN";
  return input.status as EffectiveStatus;
}

/**
 * Việc NÊN ở trạng thái "Đang thực hiện": Chưa làm + đã giao người + đã tới ngày bắt đầu
 * (plannedStart ≤ hôm nay). Dùng cho backfill 1 lần và tự set khi lưu việc.
 */
export function shouldAutoStart(input: {
  status: string;
  plannedStart?: string | null;
  assigneeCount: number;
}): boolean {
  if (input.status !== "CHUA_LAM" || input.assigneeCount <= 0 || !input.plannedStart) return false;
  const d = new Date(input.plannedStart);
  if (Number.isNaN(d.getTime())) return false;
  return d <= startOfToday();
}
