import { z } from "zod";

export const timesheetEntrySchema = z.object({
  id: z.string().optional(),
  taskId: z.string().optional().nullable(),
  date: z.string().min(1, "Chọn ngày"),
  hours: z.coerce.number().min(0.25, "Tối thiểu 0.25h").max(24, "Tối đa 24h"),
  note: z.string().optional().nullable(),
});
export type TimesheetEntryInput = z.infer<typeof timesheetEntrySchema>;
