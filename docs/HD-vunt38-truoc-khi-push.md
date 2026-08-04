# HƯỚNG DẪN cho vunt38 — Trước khi push lên nhánh `vunt38`

> Mỗi lần push, làm theo file này và **tạo 1 file note** (vd `CHANGES-YYYY-MM-DD.md`)
> kèm theo. Mục tiêu: bên deploy không sót bước nào → không lỗi build / lỗi DB.
> Dự án: Next.js + Prisma + **pnpm** + Supabase, deploy Vercel.

---

## ✅ Kiểm 3 việc trước khi push

### 1. Có đổi schema DB? (`prisma/schema.prisma`)
- Ghi rõ đổi gì: bảng / cột / quan hệ mới.
- DB production phải cập nhật RIÊNG (`pnpm db:push`) — **code không tự đổi DB**.
  → Ghi luôn SQL / migration cần chạy trên prod.
- Ưu tiên cột **nullable** (thêm an toàn, không phải redeploy).

### 2. Có đổi thư viện? (`package.json`)
- Nếu thêm/bớt package → **chạy `pnpm install` và commit luôn `pnpm-lock.yaml`**.
- ⚠️ Dự án dùng **pnpm**, KHÔNG dùng npm. Đừng commit `package-lock.json` (vô dụng).
  Thiếu cập nhật `pnpm-lock.yaml` → Vercel build fail (`ERR_PNPM_OUTDATED_LOCKFILE`).

### 3. Có cần đổ thêm dữ liệu (backfill)?
- Cột quan hệ / danh mục mới (vd Loại hình, `parentId`...) thường cần đổ dữ liệu trên prod.
  → Ghi rõ mapping (giá trị nào → giá trị nào) + file/Excel nguồn nếu có.
- Cột mới mà không đổ dữ liệu sẽ hiện trống ("—") trên giao diện.

---

## 📄 Mẫu file note (copy, điền rồi lưu kèm khi push)

```markdown
# Thay đổi — <ngày>
Commit: <sha> — nhánh vunt38

## Nội dung
- <gạch đầu dòng mô tả tính năng / sửa lỗi>

## Checklist deploy
- Schema DB: [CÓ / KHÔNG]
  - <đổi gì + SQL/migration cần chạy trên prod>
- Dependencies: [CÓ / KHÔNG]
  - <package thêm/bớt — đã chạy pnpm install & commit pnpm-lock.yaml: rồi/chưa>
- Backfill dữ liệu: [CÓ / KHÔNG]
  - <dữ liệu cần đổ + nguồn>
- Trang ảnh hưởng: </reports, /manage, /admin/catalog, ...>
```

---

## ⛔ Lưu ý quan trọng
- **Không tự deploy nhánh `vunt38`** — bên deploy sẽ merge `vunt38 → dev → main`,
  Vercel tự deploy `main`. (Nhánh vunt38 thiếu vá lockfile nên deploy thẳng sẽ fail.)
- Nếu để trống/sai 1 trong 3 mục trên → dễ gây **lỗi build** hoặc **lỗi DB ở production**.
