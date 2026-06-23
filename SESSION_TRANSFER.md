# SESSION_TRANSFER.md — Bàn giao Session 2026-06-23

> Đọc file này cuối cùng. Mô tả trạng thái hiện tại và việc cần làm tiếp theo.

---

## Trạng thái hiện tại

- **Server:** Đang chạy tại http://localhost:3000 (production build)
- **Git branch:** `vunt38`
- **Uncommitted changes:** Không (đã commit hết)
- **DB:** Local Docker, schema đã push (có tất cả fields mới của session này)

---

## Commits trong session 2026-06-23

### Commit `a40ac3b`
`feat: packagingDate hạng mục, grouped project view, sticky header, result-cell popup`

### Commit `a60b475`
`feat: bulk Đổi Bắt đầu/Đóng gói + Nhân bản hạng mục`

### Commit mới nhất (session này)
`feat: xóa task với luồng duyệt, filter chờ xóa, date format, duyệt xóa bulk`
- Schema: `deleteRequestedAt`, `deleteRequesterId`, `deleteRequestNote`, `endChangeNote`, `TASK_DELETE_REQUESTED`
- `tasks.ts`: `deleteTask`, `requestDeleteTask`, `approveDeleteTask`, `rejectDeleteTask`, `requestEndDateChange` (+ note)
- `/tasks`: bar Xóa, Dialog xóa/đề xuất, badge Clock chờ duyệt xóa, tên người duyệt trong dialog
- `/manage`: badge xin xóa trong dòng, bulk "Duyệt xóa" trong bar, filter CHUA_GIAO + kpiBase + period bypass cho deleteRequestedAt, date format dd/mm/yyyy

---

## Việc cần làm tiếp theo

### Ngắn hạn
1. **Test kỹ** luồng xóa task:
   - User xóa task chưa duyệt → xóa ngay
   - User xóa task đã duyệt → dialog hiện tên người duyệt → gửi đề xuất → manager thấy badge trong dòng + nút ✓/✗
   - Manager chọn nhiều task chờ xóa → bulk "Duyệt xóa" trong bar
   - Filter "Chưa giao/Chưa duyệt" bắt được task chờ xóa dù ngoài period
2. **Test thông báo sắp đến hạn**: tạo task với `plannedEnd` = ngày mai → đăng nhập assignee → chờ 45s → kiểm tra chuông

### Dài hạn
3. Fix "Cad" & "CAD" trùng trong CatalogItem PT Level 2
4. Deploy Supabase + Vercel
5. Import "Xuất IFC" vào CatalogItem PT

---

## Hướng dẫn bắt đầu session mới

```
1. Đọc PROJECT_CONTEXT.md (mục tiêu, tech stack, build workflow)
2. Đọc ARCHITECTURE.md (cấu trúc code, patterns, luồng xóa task)
3. Đọc MEMORY.md (quyết định đã chốt)
4. Đọc SESSION_TRANSFER.md này (trạng thái hiện tại)
5. Kiểm tra git status để biết uncommitted changes
6. Kill port 3000 nếu cần → npm run build → npm start
```
