# SESSION_TRANSFER.md — Bàn giao Session 2026-06-26

> Đọc file này cuối cùng. Mô tả trạng thái hiện tại và việc cần làm tiếp theo.

---

## Trạng thái hiện tại

- **Server:** Đang chạy tại http://localhost:3000 (production build)
- **Git branch:** `vunt38`
- **Uncommitted changes:** Không (đã commit session 2026-06-26)
- **DB:** Local Docker, schema không đổi

---

## Thay đổi đã commit trong session 2026-06-26

### `/manage` — Tree view "Dự án"

1. **Fix: Hạng mục 0 việc hiển thị đúng khi lọc tab Nhóm công việc**
   - Bỏ filter `groupWorkGroupId !== activeWg` khỏi `catalogSeed`
   - Trước: chọn tab nhóm (vd "Khai báo 3D") → catalog seed chỉ lấy hạng mục của ProjectGroup có `workGroupId` đó → ẩn toàn bộ hạng mục không có task
   - Sau: catalog seed luôn lấy toàn bộ hạng mục từ projects prop; workgroup tab chỉ lọc task bên trong hạng mục, không ẩn hạng mục

### `/tasks` — Công việc của tôi

2. **Thêm KPI card "Chờ duyệt khởi tạo"**
   - Bấm card để lọc nhanh toàn bộ task đang chờ manager duyệt khởi tạo (`approverId != null && !startApproved`)
   - Grid KPI đổi từ `grid-cols-3` → `grid-cols-2 md:grid-cols-4`
   - Card màu tím (`violet`) để phân biệt với 3 card hiện có

---

## Việc cần làm tiếp theo (ưu tiên)

1. **Cũ còn:** Fix "Cad" & "CAD" trùng trong CatalogItem PT Level 2
2. **Cũ còn:** Deploy Supabase + Vercel
3. **Cũ còn:** Import "Xuất IFC" vào CatalogItem PT
4. **Cũ còn:** Level 1 trong catalog hiện chỉ là UI — cân nhắc tích hợp vào task form (gợi ý L1 khi tạo việc)

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
