# SESSION_TRANSFER.md — Bàn giao Session 2026-06-25

> Đọc file này cuối cùng. Mô tả trạng thái hiện tại và việc cần làm tiếp theo.

---

## Trạng thái hiện tại

- **Server:** Đang chạy tại http://localhost:3000 (production build)
- **Git branch:** `vunt38`
- **Uncommitted changes:** Có (session 2026-06-25 — chưa commit)
- **DB:** Local Docker, schema không đổi

---

## Thay đổi trong session 2026-06-25

### `/manage` — Tab "Dự án" (tree view)

**File thay đổi:**
- `src/app/(app)/manage/page.tsx`
- `src/app/(app)/manage/manage-client.tsx`

**Nội dung:**

1. **Thống kê mới trong group row:**
   - g1 (Dự án): hiện `(N loại hình · M quá hạn)` thay vì `(N việc)`
   - g2 (Loại hình): hiện `(N hạng mục · M quá hạn)` thay vì `(N việc)`
   - g3 (Hạng mục): giữ nguyên `(N việc · M quá hạn)`

2. **Nút "+" thêm Hạng mục từ tree:**
   - g1 (Dự án): "+" → dialog chọn Loại hình + nhập tên Hạng mục → `saveCatalogProject`
   - g2 (Loại hình): "+" → dialog nhập tên Hạng mục (Loại hình cố định) → `saveCatalogProject`
   - g3 (Hạng mục): "+" thêm công việc (như cũ)
   - Tạo xong tự đồng bộ Khai báo thông tin (dùng chung `revalidatePath`)

3. **Props mới cho ManageClient:**
   - `constructionTypes: { id, code, name }[]` — dùng trong dropdown dialog

4. **Import mới:** `saveCatalogProject` từ `@/server/actions/projects`

---

## Thay đổi trong session 2026-06-25 (tiếp theo)

### Thống kê group row đơn giản
- g1: `(N loại hình)` — bỏ "· N quá hạn"
- g2: `(N hạng mục)` — bỏ "· N quá hạn"
- g3: `(N việc)` — bỏ "· N quá hạn"

### Hiển thị group kể cả 0 việc
- Thêm `groupWorkGroupId: string | null` vào `ProjectOpt` (assign-client.tsx) và `task-lookups.ts`
- `catalogSeed` useMemo trong manage-client: build từ `projects` prop (đã có tất cả hạng mục), lọc theo `activeWg`
  - `activeWg && p.groupWorkGroupId && p.groupWorkGroupId !== activeWg` → skip
  - null groupWorkGroupId = shared → luôn show
- Pre-seed `byDuAn`, `byLoai`, `byHang` trước khi fill task → g1/g2/g3 với 0 task vẫn xuất hiện
- `effectiveTreeCollapsed` cũng collapse g3 từ catalog (hạng mục 0 việc luôn collapsed ban đầu)

---

### Xóa hạng mục kể cả có công việc (Khai báo thông tin)

**Vấn đề cũ:** `deleteProject` server action throw error khi hạng mục còn task → client hiện `blockMsg` (chỉ có nút "Đóng"), không thể xóa.

**Fix:**
- `src/server/actions/projects.ts` → `deleteProject`: bỏ check taskCount, thay bằng `prisma.task.updateMany({ data: { projectId: null } })` trước khi soft-delete project. Task vẫn tồn tại, chỉ mất liên kết dự án.
- `src/app/(app)/admin/catalog/catalog-client.tsx`: đổi `blockMsg` → `warnMsg` ở 4 chỗ xóa hạng mục (2 chỗ single delete, 2 chỗ bulk delete). Bây giờ dialog hiển thị cảnh báo "X công việc sẽ mất liên kết dự án" nhưng vẫn có nút Xóa.

---

## Việc cần làm tiếp theo (ưu tiên)

1. **Cũ còn:** Fix "Cad" & "CAD" trùng trong CatalogItem PT Level 2
2. **Cũ còn:** Deploy Supabase + Vercel
3. **Cũ còn:** Import "Xuất IFC" vào CatalogItem PT

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
