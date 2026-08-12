import { z } from "zod";

export const smartsheetTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, "Token quá ngắn — hãy dán đúng token API từ Smartsheet")
    .max(500, "Token quá dài"),
});

/** Bước 1 — chuẩn bị: đếm tổng số sheet cần quét (để hiện phần trăm ngay). */
export const smartsheetPrepareSchema = z.object({
  /** true = bỏ qua incremental, đọc lại mọi sheet. */
  full: z.boolean().optional(),
});

/** Bước 2 — quét từng lô cho tới khi hết. */
export const smartsheetBatchSchema = z.object({
  logId: z.string().min(1, "Thiếu mã phiên đồng bộ"),
});
