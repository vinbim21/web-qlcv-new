import { z } from "zod";

export const bulkTimesheetEntrySchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1).max(200),
  date: z.string().min(1, "Chọn ngày"),
  hours: z.coerce.number().min(0.25, "Tối thiểu 0.25h").max(24, "Tối đa 24h"),
  note: z.string().optional().nullable(),
});

export const timesheetEntrySchema = z.object({
  id: z.string().optional(),
  taskId: z.string().optional().nullable(),
  date: z.string().min(1, "Chọn ngày"),
  hours: z.coerce.number().min(0.25, "Tối thiểu 0.25h").max(24, "Tối đa 24h"),
  note: z.string().optional().nullable(),
  // Tích "Hoàn thành" trong popup → đặt công việc gắn kèm sang HOAN_THANH khi lưu.
  markComplete: z.boolean().optional().default(false),
});
export type TimesheetEntryInput = z.infer<typeof timesheetEntrySchema>;
