import { z } from "zod";

export const projectSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, "Nhập mã dự án"),
  name: z.string().min(1, "Nhập tên dự án"),
  scale: z.string().optional().nullable(),
  status: z.enum(["DANG_THUC_HIEN", "TAM_DUNG", "HOAN_THANH"]).optional(),
  constructionTypeId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});
export type ProjectInput = z.infer<typeof projectSchema>;
