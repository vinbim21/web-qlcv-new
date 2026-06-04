import { z } from "zod";

export const userCreateSchema = z.object({
  username: z
    .string()
    .min(3, "Tối thiểu 3 ký tự")
    .regex(/^[a-z0-9._-]+$/, "Chỉ chữ thường, số, . _ -"),
  fullName: z.string().min(1, "Nhập họ tên"),
  email: z.string().email("Email không hợp lệ"),
  role: z.enum(["ADMIN", "LEVEL_1", "LEVEL_2", "LEVEL_3"]),
  disciplineId: z.string().optional().nullable(),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").optional(),
  isActive: z.boolean().optional(),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

// Khi sửa: KHÔNG đổi username/password ở đây (ô tài khoản bị khóa).
export const userUpdateSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1, "Nhập họ tên"),
  email: z.string().email("Email không hợp lệ"),
  role: z.enum(["ADMIN", "LEVEL_1", "LEVEL_2", "LEVEL_3"]),
  disciplineId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const disciplineSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, "Nhập mã"),
  name: z.string().min(1, "Nhập tên"),
  order: z.coerce.number().int().min(0).optional(),
});
export type DisciplineInput = z.infer<typeof disciplineSchema>;

export const catalogItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nhập tên"),
  order: z.coerce.number().int().min(0).optional(),
});

// Nhóm công việc (Level 1) & Giai đoạn — CRUD đầy đủ (mã + tên + thứ tự)
// `abbr` (viết tắt) chỉ dùng cho Nhóm công việc — làm tiền tố Id (vd "XD" → XD-001).
export const catalogCrudSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, "Nhập mã"),
  name: z.string().min(1, "Nhập tên"),
  abbr: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,6}$/, "2–6 ký tự chữ/số")
    .optional()
    .or(z.literal("")),
  order: z.coerce.number().int().min(0).optional(),
});
export type CatalogCrudInput = z.infer<typeof catalogCrudSchema>;
