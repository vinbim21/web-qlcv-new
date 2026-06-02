import { z } from "zod";

export const taskSchema = z.object({
  id: z.string().optional(),
  workGroupId: z.string().min(1, "Chọn nhóm công việc"),
  projectId: z.string().optional().nullable(),
  disciplineId: z.string().optional().nullable(),
  phaseId: z.string().optional().nullable(),
  sumId: z.string().optional().nullable(),
  subId: z.string().optional().nullable(),
  level2: z.string().optional().nullable(),
  level3: z.string().optional().nullable(),
  level5: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  priority: z.enum(["CAO", "TRUNG_BINH", "THAP"]).optional(),
  status: z.enum(["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG"]).optional(),
  progressPercent: z.coerce.number().int().min(0).max(100).optional(),
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  // tối đa 3 người thực hiện; roleNo = vị trí + 1
  assigneeIds: z.array(z.string()).max(3).optional(),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const taskStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG"]),
  progressPercent: z.coerce.number().int().min(0).max(100).optional(),
});
