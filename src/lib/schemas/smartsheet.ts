import { z } from "zod";

export const smartsheetTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, "Token quá ngắn — hãy dán đúng token API từ Smartsheet")
    .max(500, "Token quá dài"),
});

export const smartsheetSyncSchema = z.object({
  /** ID SyncLog của phiên đang chạy (null = lượt đầu tiên). */
  logId: z.string().nullish(),
  /** true = bỏ qua incremental, tải lại toàn bộ sheet ứng viên. */
  full: z.boolean().optional(),
});
