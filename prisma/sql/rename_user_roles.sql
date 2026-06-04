-- Đổi tên giá trị enum UserRole, giữ nguyên dữ liệu các hàng hiện có.
-- MANAGER -> LEVEL_1 (Cấp 1), MEMBER -> LEVEL_2 (Cấp 2), VIEWER -> LEVEL_3 (Cấp 3). ADMIN giữ nguyên.
ALTER TYPE "UserRole" RENAME VALUE 'MANAGER' TO 'LEVEL_1';
ALTER TYPE "UserRole" RENAME VALUE 'MEMBER'  TO 'LEVEL_2';
ALTER TYPE "UserRole" RENAME VALUE 'VIEWER'  TO 'LEVEL_3';
