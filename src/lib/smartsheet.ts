/** Số sheet quét mỗi lượt gọi server. Dùng chung server (chia lô) và client (vẽ phần đang quét dở). */
export const SMARTSHEET_BATCH_SIZE = 40;

// Kết quả 2 bước đồng bộ. Đặt Ở ĐÂY (file trung lập, không "use server", không import prisma)
// vì cả client lẫn server đều cần.
//
// ⚠️ TUYỆT ĐỐI KHÔNG tái xuất mấy type này từ file có `"use server"` bằng
// `export type { SyncPrepareResult }`. Turbopack bọc mọi export của file "use server" thành tham
// chiếu server action lúc chạy và KHÔNG nhận ra đây là tái xuất type (lẽ ra bị xóa khi biên dịch)
// → sinh code trỏ tới tên không tồn tại → `ReferenceError: SyncPrepareResult is not defined`, vỡ
// TOÀN BỘ action trong file đó. Đã dính đúng lỗi này trên production 12/08.
// (Khai báo tại chỗ `export type Foo = {...}` trong file "use server" thì vẫn an toàn.)

export type SyncPrepareResult = {
  logId: string;
  /** Tổng số sheet phải quét trong phiên này = mẫu số của thanh phần trăm. */
  total: number;
  /** Tổng số sheet của workspace (để hiện "trong tổng N sheet"). */
  workspaceSheets: number;
  /** Số dòng BIM đang có trong DB trước khi quét. */
  totalRows: number;
};

export type SyncBatchResult = {
  done: boolean;
  /** Số sheet đã quét trong lượt này. */
  processed: number;
  /** Số sheet còn chờ quét sau lượt này. */
  remaining: number;
  /** Tổng dòng BIM hiện có trong DB. */
  totalRows: number;
};
