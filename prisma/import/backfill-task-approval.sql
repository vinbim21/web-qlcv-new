-- Backfill cờ "đã duyệt" cho toàn bộ dữ liệu việc hiện có.
-- Lý do: trước khi có tính năng duyệt, mọi việc đều do Admin tạo → coi như đã được duyệt.
-- Chạy 1 LẦN, SAU KHI `prisma db push` đã thêm cột approvedAt / approvedById.
-- Chạy trên CẢ Docker local lẫn Supabase prod.
--
-- Người duyệt = tài khoản Admin cũ nhất (tra theo role, không hardcode id).
-- Phạm vi = tất cả việc chưa xoá mềm (kể cả việc chưa hoàn thành) — theo yêu cầu.

UPDATE "Task"
SET
  "approvedAt"   = NOW(),
  "approvedById" = (
    SELECT "id" FROM "User"
    WHERE "role" = 'ADMIN' AND "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
WHERE "deletedAt" IS NULL
  AND "approvedAt" IS NULL; -- không đụng việc đã được duyệt thủ công (an toàn khi lỡ chạy lại)
