import { z } from "zod";

export const userCreateSchema = z.object({
  username: z
    .string()
    .min(3, "Tối thiểu 3 ký tự")
    .regex(/^[a-z0-9._-]+$/, "Chỉ chữ thường, số, . _ -"),
  fullName: z.string().min(1, "Nhập họ tên"),
  email: z.string().email("Email không hợp lệ"),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER", "VIEWER"]),
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
  role: z.enum(["ADMIN", "MANAGER", "MEMBER", "VIEWER"]),
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
export const catalogCrudSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1, "Nhập mã"),
  name: z.string().min(1, "Nhập tên"),
  order: z.coerce.number().int().min(0).optional(),
});
export type CatalogCrudInput = z.infer<typeof catalogCrudSchema>;
