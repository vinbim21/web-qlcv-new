# SESSION_TRANSFER.md — Bàn giao Session 2026-06-25

> Đọc file này cuối cùng. Mô tả trạng thái hiện tại và việc cần làm tiếp theo.

---

## Trạng thái hiện tại

- **Server:** Đang chạy tại http://localhost:3000 (production build)
- **Git branch:** `vunt38`
- **Uncommitted changes:** Không (đã commit session 2026-06-25)
- **DB:** Local Docker, schema không đổi

---

## Thay đổi đã commit trong session 2026-06-25

### `/manage` — Tab "Dự án" (tree view)

1. **Thống kê group row đơn giản** — bỏ "· N quá hạn", chỉ hiện số lượng
2. **Hiển thị group kể cả 0 việc** — pre-seed từ `catalogSeed` (projects prop)
3. **Ẩn group 0 việc khi có filter** — `hasActiveFilter` → bỏ catalog seed
4. **Nút "+" thêm Hạng mục** từ tree (g1/g2 level)

### Timesheet
5. **Đánh dấu hoàn thành dùng ngày đã chọn** — dùng `date` thay vì `new Date()`

### `/manage` inline edit
6. **Thêm cột Giai đoạn** vào `InlineTaskEditRow`

### Catalog
7. **Xóa hạng mục kể cả có task** — unlink `projectId` thay vì block

---

## Thay đổi thêm trong session 2026-06-25 (sau handover đầu)

### Dialog ghi giờ — nhập link kết quả (items 7)
- `result` field trong timesheet schema + server action
- `result-cell.tsx`: 2 link (Link1·Link2), file path mở thư mục
- `timesheet-entry-dialog.tsx`: section Kết quả + nút + link2
- `tasks-client.tsx`: truyền `result` vào `lockedTask`

### /manage filter structural cols (item 8)
- `hasActiveFilter` chỉ true cho non-structural filters
- Catalog seed vẫn dùng khi filter Dự án/Loại hình/Hạng mục, nhưng lọc theo giá trị

### /manage inline edit Tên đầu việc (item 9)
- Đổi `<input>+<datalist>` → `SearchableCombobox`

### Modal scroll fix (item 10)
- Bỏ `sm:items-center` → `px-4 py-8`, luôn items-start

### Khai báo thông tin Level 1 (item 11)
- Thêm cột "Level 1 — Tên dự án" vào trang catalog chi tiết non-BIM
- Grid 3 cột → 4 cột

---

## Việc cần làm tiếp theo (ưu tiên)

1. **Cũ còn:** Fix "Cad" & "CAD" trùng trong CatalogItem PT Level 2
2. **Cũ còn:** Deploy Supabase + Vercel
3. **Cũ còn:** Import "Xuất IFC" vào CatalogItem PT
4. **Mới:** Level 1 trong catalog hiện chỉ là UI — cân nhắc tích hợp vào task form (gợi ý L1 khi tạo việc)

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
