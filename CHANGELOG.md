# CHANGELOG — Web QLCV (BIM)

Lịch sử cập nhật tính năng theo ngày, mới nhất ở trên.

---

## 2026-06-26

### Quản lý công việc (`/manage`)

- **Fix: Hiển thị hạng mục chưa có công việc khi lọc theo Nhóm công việc**
  - Trước: chọn tab nhóm (vd "Khai báo 3D") → chỉ thấy hạng mục đã có việc của nhóm đó, không thể thêm việc vào hạng mục trống
  - Sau: toàn bộ hạng mục từ Khai báo thông tin luôn hiện trong cây, kể cả khi chưa có công việc nào

### Công việc của tôi (`/tasks`)

- **Thêm bộ lọc nhanh "Chờ duyệt khởi tạo"**
  - Thẻ thứ 4 (màu tím) cạnh 3 thẻ KPI hiện có
  - Bấm vào để lọc nhanh tất cả công việc đang chờ quản lý duyệt khởi tạo

---

## 2026-06-25

### Dialog ghi giờ

- Thêm mục nhập **link kết quả** (Link 1 · Link 2 · đường dẫn thư mục)
- Nút mở nhanh link và thư mục ngay trong dialog

### Quản lý công việc (`/manage`) — Tab "Dự án"

- Hiển thị **hạng mục chưa có công việc** (lấy từ Khai báo thông tin)
- Ẩn hạng mục 0 việc khi đang bật filter (người, tình trạng, v.v.) để tập trung kết quả
- Nút "+" thêm hạng mục ngay từ cây (cấp Dự án và Loại hình)
- Thống kê gọn hơn: chỉ hiện số lượng, bỏ "· N quá hạn"

### Inline edit (`/manage`)

- Thêm cột **Giai đoạn** vào form sửa nhanh
- Ô **Tên đầu việc** chuyển sang SearchableCombobox (gõ tìm trong danh mục)

### Khai báo thông tin (`/admin/catalog`)

- Thêm cột **Level 1 — Tên dự án** trong trang chi tiết nhóm công việc (non-BIM)
- **Xóa hạng mục** không còn bị chặn khi hạng mục đang có công việc; công việc sẽ tự động tách liên kết

### Nhật ký giờ (`/timesheet`)

- Đánh dấu "Hoàn thành" dùng đúng ngày đang xem, không lấy ngày hôm nay

---

## 2026-06-23

### Khai báo thông tin — Tab "Dự án"

- Thêm cột **Ngày đóng gói** (packagingDate) vào bảng và form sửa
- Thêm **View Dự án** (cây 2 cấp: Dự án → Hạng mục → Khối/Hệ thống)
- Bulk action: **Đổi Bắt đầu**, **Đổi Đóng gói**, **Nhân bản** hạng mục với Khối mới

### Xóa công việc (luồng duyệt)

- Task **chưa được duyệt**: xóa thẳng (confirm)
- Task **đã được duyệt**: gửi đề xuất xóa → manager duyệt/từ chối
- Badge "Chờ duyệt xóa" hiện trong cột Ghi giờ; assignee có thể tự hủy

---

## 2026-06-18

### Báo cáo (`/reports`)

- Pivot bảng tóm tắt (Bộ môn × Nhóm CV)
- Biểu đồ donut trạng thái + dải tiến độ ngang
- Layout 2 cột trên màn hình rộng

### Công việc của tôi (`/tasks`)

- Toggle **Bảng / Dự án** (tree grouping)
- Thanh thông tin task được chọn (tên, assignee, hạn)

### Nhật ký giờ (`/timesheet`)

- Thẻ thông tin tuần (tổng giờ, số việc ghi)
- Fix lọc kỳ: kỳ tuần hiển thị đúng ngày T2–T7

---

## 2026-06-17

### Báo cáo (`/reports`)

- Lát cắt thời gian (tuần / tháng / quý / năm)
- Timesheet bộ môn: giờ theo tuần của từng thành viên

### Quản lý công việc (`/manage`)

- Điều chỉnh độ rộng cột (kéo tay + nhớ localStorage)
- Nút Expand/Collapse từng cấp cây
