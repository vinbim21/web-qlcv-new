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

/**
 * Cổng "duyệt khởi tạo" (luồng mới): việc đang BỊ KHÓA nhập thời gian khi
 * đã chỉ định người duyệt (approverId) NHƯNG chưa được duyệt (startApprovedAt null).
 */
export function isStartGateLocked(input: {
  approverId?: string | null;
  startApprovedAt?: Date | string | null;
}): boolean {
  return !!input.approverId && !input.startApprovedAt;
}

/** Chuẩn ngày về mốc 00:00 local (so theo ngày, bỏ giờ). null nếu thiếu/sai. */
function toDay(v: Date | string | null | undefined): number | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Kiểm tra ngày Thực tế hoàn thành hợp lệ: KHÔNG được trước ngày bắt đầu
 * (cho phép bằng — xong trong ngày là bình thường).
 * Trả về thông báo lỗi tiếng Việt nếu sai, ngược lại null. Thiếu dữ liệu → không chặn.
 */
export function completionDateError(
  actualEnd: Date | string | null | undefined,
  plannedStart: Date | string | null | undefined,
): string | null {
  const a = toDay(actualEnd);
  const s = toDay(plannedStart);
  if (a === null || s === null) return null;
  if (a < s) return "Ngày hoàn thành không được trước ngày bắt đầu";
  return null;
}

/** Hoàn thành TRỄ HẠN: đã hoàn thành, có hạn, và ngày hoàn thành > hạn. */
export function isCompletedLate(input: {
  status: string;
  actualEnd?: Date | string | null;
  plannedEnd?: Date | string | null;
}): boolean {
  if (input.status !== "HOAN_THANH") return false;
  const a = toDay(input.actualEnd);
  const e = toDay(input.plannedEnd);
  if (a === null || e === null) return false;
  return a > e;
}

/** Quá hạn: có hạn, hạn < hôm nay, và chưa hoàn thành. */
export function isOverdue(input: { status: string; plannedEnd?: string | null }): boolean {
  if (!input.plannedEnd || input.status === "HOAN_THANH") return false;
  return new Date(input.plannedEnd) < startOfToday();
}

/** Trạng thái hiển thị/đếm: status thật + lớp phủ Quá hạn (KHÔNG phủ lên việc Tạm dừng). */
export function effectiveStatus(input: StatusInput): EffectiveStatus {
  if (input.status === "HOAN_THANH") return "HOAN_THANH";
  // Tạm dừng là chủ đích của quản lý → không tính Quá hạn.
  if (input.status === "TAM_DUNG") return "TAM_DUNG";
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
