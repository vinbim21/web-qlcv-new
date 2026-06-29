# SESSION_TRANSFER.md — Bàn giao Session 2026-06-29

> Đọc file này cuối cùng. Mô tả trạng thái hiện tại và việc cần làm tiếp theo.

---

## Trạng thái hiện tại

- **Server:** Đang chạy tại http://localhost:3000 (production build)
- **Git branch:** `vunt38`
- **Uncommitted changes:** Có (chưa commit session 2026-06-29)
- **DB:** Local Docker, schema không đổi

---

## Thay đổi đã làm trong session 2026-06-29

### 1. Tạm dừng task — User (Assignee) cũng được phép

**Files:** `src/server/actions/tasks.ts`, `src/app/(app)/tasks/tasks-client.tsx`

- `setTaskPaused`: bỏ chặn cứng "Chỉ Quản trị/Cấp 1", thay bằng check `t.assignees.length > 0`
- `tasks-client.tsx`: thêm handler `onTogglePause(t, paused)`, pass `canPause` và `onTogglePause` vào `StatusCell`
- `canPause = canManage || t.assigneeIds.includes(currentUserId)` — assignee thấy nút Pause/Play ở cột Trạng thái

### 2. Admin thêm Level 1 cho các nhóm không phải BIM

**File:** `src/server/actions/catalog.ts`

- `VALID_LEVELS` đổi từ `[2, 3, 5]` → `[1, 2, 3, 5]`
- Admin giờ thêm/sửa/xóa Level 1 (Tên dự án) được cho: Đào tạo, Xây dựng HTTC, Quản lý phần mềm, Công việc khác

### 3. KPI card "Chờ duyệt" — gộp 3 loại pending

**File:** `src/app/(app)/tasks/tasks-client.tsx`

- Thêm helper `isAnyPending(t)`:
  - `isPendingApproval(t)` (chờ duyệt khởi tạo)
  - `!!t.pendingPlannedEnd` (đề xuất đổi ngày kết thúc)
  - `!!t.deleteRequestedAt` (chờ duyệt xóa)
- KPI card đổi tên "Chờ duyệt khởi tạo" → **"Chờ duyệt"**
- Quick filter `CHO_DUYET` dùng `isAnyPending` thay `isPendingApproval`

### 4. L1 filter (Tên dự án) trong /manage và /tasks

**Files thay đổi:**
- `src/server/data/task-lookups.ts` — thêm `l1[]` và `l2ByL1: Record<string, string[]>` vào catalog
- `src/app/(app)/admin/catalog/[workGroupId]/page.tsx` — `byLevel()` trả về cả `parentId`
- `src/app/(app)/admin/catalog/[workGroupId]/catalog-detail.tsx`:
  - `Item` type thêm `parentId?: string | null`
  - `LevelColumn` nhận thêm prop `level1Items?: Item[]`
  - Khi `level === 2` và có L1 items: dropdown **"Thuộc dự án"** trên input thêm mới
  - L2 items hiển thị tên L1 cha nhỏ bên dưới; khi sửa có dropdown đổi L1 cha
- `src/app/(app)/tasks/tasks-client.tsx` — `Catalog` type + `activeL1` state + `passL1()` + pills UI
- `src/app/(app)/manage/manage-client.tsx` — tương tự tasks-client

**Cách hoạt động:**
1. Admin vào Khai báo thông tin → chọn nhóm → cột Level 2 → chọn L1 cha → thêm L2
2. Trong /manage và /tasks: chọn tab nhóm có L1 → hiện pills "Dự án: [Tất cả] [HTTC] ..."
3. Click pill → filter `task.level2 ∈ l2ByL1[activeL1]`

---

## Việc cần làm tiếp theo (ưu tiên)

1. **Cũ còn:** Fix "Cad" & "CAD" trùng trong CatalogItem PT Level 2
2. **Cũ còn:** Deploy Supabase + Vercel
3. **Cũ còn:** Import "Xuất IFC" vào CatalogItem PT
4. **Cũ còn:** Level 1 catalog chưa tích hợp vào task form (gợi ý L1 khi tạo việc)

---

## Hướng dẫn bắt đầu session mới

```
1. Đọc PROJECT_CONTEXT.md (mục tiêu, tech stack, build workflow)
2. Đọc ARCHITECTURE.md (cấu trúc code, patterns)
3. Đọc MEMORY.md (quyết định đã chốt)
4. Đọc SESSION_TRANSFER.md này (trạng thái hiện tại)
5. Kiểm tra git status
6. Kill port 3000 nếu cần → npm run build → npm start
```
