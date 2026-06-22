# Tổng hợp thay đổi — 2026-06-22

## Phạm vi

Màn **Khai báo thông tin**.

## Thay đổi chính

### 1. Thêm checkbox chọn nhiều dòng

Các bảng/danh sách trong Khai báo thông tin có thể chọn nhiều dòng bằng checkbox:

- Nhóm công việc
- Dự án
- Dự án BIM Tools
- Công việc
- Giai đoạn
- Bộ môn
- Loại hình công trình

### 2. Chọn nhanh bằng Shift

Có thể chọn một dòng đầu, giữ **Shift**, rồi chọn dòng cuối để chọn hoặc bỏ chọn cả khoảng dòng ở giữa theo thứ tự đang hiển thị.

### 3. Thanh thao tác hàng loạt

Khi chọn ít nhất 1 dòng, thanh thao tác hàng loạt sẽ hiển thị ngay phía trên danh sách.

Các thao tác đã thêm:

- Nhóm công việc: đổi mã, đổi tên, đổi viết tắt, đổi thứ tự
- Dự án: đổi Dự án, đổi Loại hình, đổi Hạng mục
- Dự án BIM Tools: đổi Dự án, đổi Loại hình, đổi Hạng mục
- Công việc: đổi nhóm, đổi tên
- Giai đoạn: đổi mã, đổi tên, đổi thứ tự
- Bộ môn: đổi mã, đổi tên
- Loại hình công trình: đổi mã, đổi tên

### 4. Cập nhật database

Thêm server action để cập nhật nhiều dòng một lần:

- `batchUpdateSimpleCatalog`
- mở rộng `batchUpdateCatalogItems` để đổi nhóm công việc cho nhiều `CatalogItem`

## File thay đổi

- `src/app/(app)/admin/catalog/catalog-client.tsx`
- `src/server/actions/catalog.ts`
- `src/server/actions/projects.ts`

## Database

Không có migration mới.

## Kiểm tra

Đã chạy:

```bash
npm run type-check
```

Kết quả: passed.

Lưu ý: `npm run lint` toàn repo vẫn fail do các lỗi lint có sẵn ngoài phạm vi thay đổi này.
