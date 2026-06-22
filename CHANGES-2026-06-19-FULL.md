# Tổng hợp thay đổi — 2026-06-19

Nhánh: `vunt38`  
Commits: `a086aba` → `d66f32d`

---

## Thay đổi Database

**Không có migration mới.**

> Không cần chạy `npx prisma migrate deploy`.

---

## Thay đổi Code

### 1. Lát cắt thời gian — Tuần / Tháng / Quý / Năm / Tất cả

**Ảnh hưởng:** Tab **Công việc của tôi** và **Quản lý công việc**

- Thêm bộ nút lọc theo kỳ ngay phía trên danh sách công việc. Mặc định chọn **Tuần**.
- Logic hiển thị dùng **overlap**: task xuất hiện nếu `[bắt đầu, kết thúc]` giao với kỳ đang chọn — không bỏ sót task bắt đầu trong tuần nhưng kết thúc tuần sau.
- Bấm **Tất cả** để xem toàn bộ không lọc.

**File:** `src/app/(app)/tasks/tasks-client.tsx`, `src/app/(app)/manage/manage-client.tsx`

---

### 2. Thêm tương tự (khi chọn đúng 1 công việc)

**Ảnh hưởng:** Tab **Công việc của tôi**

- Khi checkbox đúng **1 công việc**, thanh bulk action hiện thêm nút **"Thêm tương tự"**.
- Bấm nút này (hoặc bấm **"Thêm công việc"** khi đang chọn 1 việc) → mở form Giao việc với dòng đầu điền sẵn: Dự án, Loại hình, Hạng mục, Bộ môn, Giai đoạn, Ưu tiên, Ngày bắt đầu/kết thúc.
- Fix: `projectGroupId` tự tra ngược từ `projectId` → dropdown Dự án hiện đúng; `level2` lấy từ `constructionTypeCode` thay vì giá trị raw trong DB.

**File:** `src/app/(app)/tasks/tasks-client.tsx`, `src/app/(app)/assign/assign-client.tsx`

---

### 3. Báo cáo — thứ tự kỳ và mặc định

**Ảnh hưởng:** Tab **Báo cáo**

Thứ tự mới: **Tuần / Tháng / Quý / Năm / Tất cả**, mặc định **Tuần**.

**File:** `src/app/(app)/reports/reports-tabs.tsx`

---

### 4. Quản lý công việc — sắp xếp KPI cards

**Ảnh hưởng:** Tab **Quản lý công việc** — hàng thẻ KPI

Thứ tự mới: **Đang làm → Sắp đến hạn → Quá hạn → Chưa giao/chưa duyệt**

**File:** `src/app/(app)/manage/manage-client.tsx`

---

### 5. Dropdown Bộ môn hiển thị mã thay tên đầy đủ

**Ảnh hưởng:** Mọi nơi chọn Bộ môn (Quản lý, Giao việc, Sửa công việc)

Dropdown bộ môn hiện **mã ngắn** (BIM, TKCS, MEP…) thay vì tên đầy đủ.

**File:** `src/app/(app)/manage/manage-client.tsx`, `src/components/task-row-editor.tsx`, `src/app/(app)/assign/assign-client.tsx`, `src/components/task-form.tsx`

---

### 6. Cột Giai đoạn trong dòng insert inline (Quản lý — Bảng view)

**Ảnh hưởng:** Tab **Quản lý công việc** → chế độ Bảng → bấm "+ Thêm" trên nhóm

Trước đây cột Giai đoạn bị bỏ trống. Nay có dropdown chọn Giai đoạn.

**File:** `src/app/(app)/manage/manage-client.tsx`

---

### 7. Định dạng ngày dd/mm/yyyy

**Ảnh hưởng:** Cột **Bắt đầu** và **Kết thúc** trong tab Quản lý công việc

Ngày hiển thị `30/06/2026` thay vì `2026-06-30`.

**File:** `src/app/(app)/manage/manage-client.tsx`

---

### 8. Xóa biểu tượng lá chắn (ShieldCheck) khỏi cột Trạng thái

**Ảnh hưởng:** Tab **Công việc của tôi** và **Quản lý công việc**

Bỏ icon lá chắn xanh/xám trong cột Tình trạng. Giao diện gọn hơn.  
Duyệt hàng loạt vẫn được qua bulk action (chọn ≥1 việc → nút **Duyệt**).

**File:** `src/app/(app)/manage/manage-client.tsx`, `src/app/(app)/tasks/tasks-client.tsx`

---

### 9. Duyệt công việc Hoàn thành "Chưa duyệt"

**Ảnh hưởng:** Tab **Quản lý công việc** — cột Tình trạng

**Hai cách duyệt:**

**a) Duyệt per-row (mới):** Nhãn **"Chưa duyệt"** màu vàng trong cột Tình trạng nay là **nút bấm** (với Admin/Quản lý). Bấm thẳng vào → duyệt hoàn thành ngay.

**b) Duyệt hàng loạt (đã fix):** Nút **Duyệt** trong bulk action bar nay set cả `approvedAt` cho task có ngày thực tế hoàn thành → nhãn "Chưa duyệt" biến mất.

> **Lưu ý:** Task phải có **ngày thực tế hoàn thành** (cột "Thực tế hoàn thành") thì mới duyệt được.

**File:** `src/app/(app)/manage/manage-client.tsx`, `src/server/actions/tasks.ts`

---

### 10. Mã dự án BIM Tools xuất hiện trong tab Công việc / Quản lý

**Ảnh hưởng:** Tab **Công việc của tôi** và **Quản lý công việc** — cột **Dự án**

**Vấn đề cũ:** Công việc nhóm **Phát triển BIM Tools** không có `projectId` trực tiếp nên cột Dự án luôn trống.

**Hành vi mới:** Server tự tra ngược `CatalogItem.projectGroupId` theo `(workGroupId + Hạng mục)` → lấy mã nhóm dự án điền vào cột Dự án.

> **Yêu cầu:** Phải khai báo trong **Khai báo thông tin → tab Dự án BIM Tools**, chọn Hạng mục và liên kết Dự án trước. Sau đó reload trang là thấy ngay.

**File:** `src/app/(app)/manage/page.tsx`, `src/app/(app)/tasks/page.tsx`

---

## Cách deploy

```bash
git pull origin vunt38
npm run build
pm2 restart qlcv   # hoặc: npm start
```

Không cần migrate DB. Xem hướng dẫn đầy đủ tại [DEPLOY.md](DEPLOY.md).
