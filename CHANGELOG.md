# CHANGELOG — Web QLCV (BIM)

Lịch sử cập nhật tính năng theo ngày, mới nhất ở trên.

---

## 2026-06-30

### Quản lý công việc (`/manage`) — Cột "Giờ (h)"

- **Thêm cột "Giờ (h)"** — tổng số giờ đã ghi timesheet cho từng công việc
  - Lấy từ `TimeSheetEntry` (groupBy taskId, sum hours), không cần query N+1
  - Hiển thị số nguyên (`8`) hoặc 1 chữ số thập phân (`8.5`), để trống nếu chưa ghi
  - Căn phải, font tabular, rộng 110px — nằm giữa cột "Thực tế hoàn thành" và "Kết quả"
  - Có thể sort; không có filter riêng

### Quản lý công việc (`/manage`) & Công việc của tôi (`/tasks`)

- **Fix: Ngày hạng mục lệch cột Bắt đầu / Kết thúc trong dòng nhóm**
  - Trước: dùng `position: absolute` + tính pixel tay (`colLeft()`) → dễ lệch khi zoom khác 100% hoặc cột resize
  - Sau: đặt ngày trực tiếp vào `<td>` của đúng cột Bắt đầu / Kết thúc, label nhóm dùng `colSpan` đến trước cột đó → browser tự căn, luôn thẳng ở mọi zoom / độ rộng cửa sổ
  - Fix thêm: `labelColSpan` phải cộng 1 cho cột checkbox (`__sel__`) vốn là `<td>` riêng trong data rows

---

## 2026-06-29 (phiên 3)

### Quản lý công việc (`/manage`) & Công việc của tôi (`/tasks`)

- **Fix: Ngày dự án bị lệch cột khi đổi tỷ lệ zoom trình duyệt**
  - Trước: ở 100% zoom ngày thẳng cột, zoom 80-90% thì ngày Bắt đầu/Kết thúc lệch hẳn sang phải
  - Nguyên nhân: table `width: 100%` khiến cột stretch theo viewport CSS pixel (zoom 80% → viewport rộng hơn ~25%), nhưng `colLeft()` vẫn dùng pixel cứng từ `colWidths[]`
  - Sau: dùng `ResizeObserver` đo chiều rộng thực của table, tính hệ số scale (`tableScaleX = actualWidth / totalMinW`), nhân vào `colLeft()` → ngày luôn căn đúng cột ở mọi tỷ lệ zoom

### Timesheet (`/timesheet`)

- **Fix: Hiển thị đúng mã Dự án cho nhóm HTTC BIM trong dialog ghi giờ**
  - Trước: nhóm HTTC BIM (Level 3 gắn `projectGroupId` thay vì `parentId` L2→L1) không tìm được mã dự án
  - Sau: bổ sung tra cứu `L3 → projectGroup.code` song song với tra cứu L2→L1 catalog

- **Dropdown Dự án / Loại hình / Hạng mục trong dialog ghi giờ có thể tìm kiếm**
  - Trước: dùng `<select>` thuần HTML, không gõ tìm được
  - Sau: đổi sang `SearchableCombobox` — gõ để lọc nhanh khi danh sách dài
  - Thêm nút **× Xóa** cạnh nhãn để reset từng bộ lọc một click

---

## 2026-06-29 (phiên 2)

### Giao diện chung — Chọn ngày dd/mm/yyyy

- **Component `DateInput` mới** — thay thế toàn bộ `<input type="date">` trên hệ thống
  - Hiển thị theo định dạng **dd/mm/yyyy** (không phụ thuộc locale trình duyệt)
  - Gõ tay: tự chèn dấu `/` khi nhập số, mask tự động
  - Click **icon lịch** ở góc phải → mở native calendar picker như cũ
  - Áp dụng cho: `/tasks`, `/manage`, `/assign`, `/timesheet`, `/admin/catalog`, `/admin/projects`, form tạo/sửa công việc, dialog ghi giờ

### Công việc của tôi (`/tasks`) & Quản lý công việc (`/manage`)

- **Filter nhanh "Hoàn thành"** — thẻ KPI mới vị trí thứ 2 (sau "Đang làm")
  - Bấm thẻ để chỉ hiện task có trạng thái Hoàn thành
  - Số hiển thị: tổng task đã hoàn thành trong phạm vi lọc hiện tại
  - Màu xanh lá (`border-green-200 bg-green-50 text-green-700`)

- **Thẻ KPI được chọn hiển thị viền xanh lá**
  - Trước: viền xám (`ring-slate-400`) khi chọn thẻ lọc nhanh
  - Sau: viền **xanh lá** (`ring-green-500`) để người dùng nhận ra ngay bộ lọc đang bật

- **Bảng fit toàn chiều rộng** — hết khoảng trắng thừa khi zoom nhỏ
  - Table dùng `width: 100%` + `minWidth` thay vì width pixel cứng
  - Cột "Kết quả" (cột cuối) co giãn hấp thụ phần thừa khi màn hình rộng
  - Vẫn giữ scroll ngang khi thu hẹp xuống dưới độ rộng tối thiểu

### Đề xuất đổi hạn (`/tasks`)

- **Cho phép gửi đề xuất không có ngày mới** (người thực hiện chưa biết tiến độ)
  - Trước: bắt buộc phải chọn ngày → block người dùng
  - Sau: assignee có thể để trống ngày → badge hiển thị "Xin dời hạn (chưa có ngày)"
  - Quản trị/Cấp 1 vẫn bắt buộc chọn ngày khi đổi hạn trực tiếp
  - Nút "Duyệt ngày mới" chỉ hiện khi đề xuất có ngày cụ thể

### Timesheet (`/timesheet`)

- **Cascade dropdown lọc task đúng cho nhóm không có dự án** (HTTC BIM, Đào tạo, ...)
  - Trước: chỉ nhóm QL/TT mới có Dự án → Loại hình → Hạng mục; các nhóm khác để trống
  - Sau: mọi nhóm đều có đủ 3 cấp cascade:
    - **Dự án** = Level 1 catalog (mã, không lấy tên)
    - **Loại hình** = Level 2 catalog (mã)
    - **Hạng mục** = Level 3 catalog (mã)
  - Entry đã ghi giờ cũng hiển thị đúng 3 mã này thay vì để trống

---

## 2026-06-29

### Quản lý công việc (`/manage`) & Công việc của tôi (`/tasks`)

- **Tạm dừng / bỏ tạm dừng — Assignee cũng được phép**
  - Trước: chỉ Quản trị/Cấp 1 mới thấy nút Pause/Play ở cột Trạng thái
  - Sau: người được giao việc (assignee) cũng thấy và dùng được nút này

- **Bộ lọc L1 "Dự án" — pills lọc nhanh theo tên dự án**
  - Khi chọn tab nhóm công việc có Level 1 (vd: Xây dựng HTTC, Đào tạo…) → hàng pills xuất hiện: `Dự án: [Tất cả] [HTTC] [ĐT] …`
  - Bấm pill để lọc chỉ hiện task thuộc Level 2 con của dự án đó
  - Pills reset tự động khi đổi nhóm hoặc bấm Xóa bộ lọc

- **KPI "Chờ duyệt" — gộp 3 loại chờ xử lý**
  - Trước: thẻ chỉ đếm task chờ duyệt khởi tạo
  - Sau: đếm cả 3 loại: chờ duyệt khởi tạo + đề xuất đổi hạn + đề xuất xóa

- **Fix: Inline edit không lưu được Dự án cho task mới chưa gán dự án**
  - Trước: task QL/TT chưa có projectId khi mở inline edit → hiển thị dropdown sai (L1 catalog), chọn dự án và save không ăn
  - Sau: nhận đúng workgroup là project-based → hiển thị đúng dropdown Dự án → Loại hình → Hạng mục → lưu đúng projectId

### Khai báo thông tin (`/admin/catalog`)

- **Thêm / sửa / xóa Level 1 (Tên dự án) cho nhóm non-BIM**
  - Admin giờ khai báo được Level 1 cho: Đào tạo, Xây dựng HTTC, Quản lý phần mềm, Công việc khác
  - Cột Level 2 có dropdown **"Thuộc dự án"** để gán L2 → L1 cha (lưu `parentId`)
  - Mỗi L2 item hiển thị tên L1 cha bên dưới (text nhỏ); khi sửa có dropdown đổi L1 cha

- **Task form / Giao việc** — khi tạo/sửa task thuộc nhóm có L1, chọn L1 trước để lọc danh sách L2 gợi ý

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
