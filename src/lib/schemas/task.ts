import { z } from "zod";

export const taskSchema = z.object({
  id: z.string().optional(),
  workGroupId: z.string().min(1, "Chọn nhóm công việc"),
  projectId: z.string().optional().nullable(),
  disciplineId: z.string().optional().nullable(),
  phaseId: z.string().optional().nullable(),
  sumId: z.string().optional().nullable(),
  subId: z.string().optional().nullable(),
  level1: z.string().optional().nullable(),
  level2: z.string().optional().nullable(),
  level3: z.string().optional().nullable(),
  level5: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  priority: z.enum(["CAO", "TRUNG_BINH", "THAP"]).optional(),
  status: z.enum(["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG"]).optional(),
  measureNorm: z.boolean().optional(),
  progressPercent: z.coerce.number().int().min(0).max(100).optional(),
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  result: z.string().optional().nullable(),
  // Người duyệt khởi tạo (luồng "Thêm công việc"). null = việc không cần duyệt khởi tạo.
  approverId: z.string().optional().nullable(),
  // nhiều người thực hiện; roleNo = vị trí + 1
  assigneeIds: z.array(z.string()).optional(),
  // Dùng khi gõ mới hạng mục (isB3): auto-upsert Project nếu projectId trống
  projectGroupCode: z.string().optional().nullable(),
  // Khối/Hệ thống — dùng khi find-or-create Project để phân biệt hạng mục cùng tên khác khối
  blockSystem: z.string().optional().nullable(),
});
export type TaskInput = z.infer<typeof taskSchema>;

// Một dòng trên lưới Giao việc: trường phân loại (WBS) + người/ưu tiên/ngày (theo cột Excel từng bảng).
export const taskBatchRowSchema = taskSchema.pick({
  workGroupId: true,
  projectId: true,
  projectGroupCode: true,
  disciplineId: true,
  phaseId: true,
  level1: true,
  level2: true,
  level3: true,
  level5: true,
  priority: true,
  plannedStart: true,
  plannedEnd: true,
  approverId: true,
  assigneeIds: true,
});
export const taskBatchSchema = z.array(taskBatchRowSchema).min(1).max(200);
export type TaskBatchRow = z.infer<typeof taskBatchRowSchema>;

export const taskStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG"]),
  progressPercent: z.coerce.number().int().min(0).max(100).optional(),
});

// Đánh dấu hoàn thành bằng ngày Thực tế hoàn thành (null = bỏ hoàn thành). Trạng thái tự suy.
export const taskCompletionSchema = z.object({
  id: z.string().min(1),
  actualEnd: z.string().nullable(),
});

// Tạm dừng / bỏ tạm dừng (chỉ Quản trị/Cấp 1).
export const taskPausedSchema = z.object({
  id: z.string().min(1),
  paused: z.boolean(),
});

// Duyệt / bỏ duyệt việc (chỉ Quản trị/Cấp 1, chỉ với việc đã hoàn thành).
export const taskApprovalSchema = z.object({
  id: z.string().min(1),
  approved: z.boolean(),
});

// Duyệt KHỞI TẠO (luồng mới): mở/khóa cổng cho phép nhập thời gian.
export const taskStartApprovalSchema = z.object({
  id: z.string().min(1),
  approved: z.boolean(),
});

// "Cập nhật công việc": làm tiếp việc đã Hoàn thành (đầu việc có thay đổi) — đặt lại ngày,
// gửi người duyệt (giống duyệt khởi tạo), lưu mốc hoàn thành cũ vào lịch sử.
export const taskUpdateRequestSchema = z.object({
  id: z.string().min(1),
  plannedStart: z.string().min(1, "Chọn ngày bắt đầu"),
  plannedEnd: z.string().min(1, "Chọn ngày kết thúc"),
  approverId: z.string().min(1, "Chọn người duyệt"),
  note: z.string().max(500).optional(),
});

// ---- Thao tác hàng loạt (tab Quản lý công việc) ----
const taskIds = z.array(z.string().min(1)).min(1, "Chưa chọn công việc").max(2000);

export const bulkStatusSchema = z.object({
  ids: taskIds,
  status: z.enum(["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG"]),
});
export const bulkPrioritySchema = z.object({
  ids: taskIds,
  priority: z.enum(["CAO", "TRUNG_BINH", "THAP"]),
});
export const bulkMeasureNormSchema = z.object({
  ids: taskIds,
  measureNorm: z.boolean(),
});
export const bulkDeadlineSchema = z.object({
  ids: taskIds,
  plannedEnd: z.string().min(1, "Chọn ngày hạn"),
});
export const bulkReassignSchema = z.object({
  ids: taskIds,
  assigneeIds: z.array(z.string()).max(50),
  // replace = thay toàn bộ người cũ (mặc định); add = thêm vào danh sách hiện có.
  mode: z.enum(["replace", "add"]).default("replace"),
});
export const bulkApprovalSchema = z.object({
  ids: taskIds,
  approved: z.boolean(),
});
export const bulkDeleteSchema = z.object({ ids: taskIds });
