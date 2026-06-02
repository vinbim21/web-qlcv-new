# Web QLCV — Quản lý công việc phòng BIM

Hệ thống quản lý công việc nội bộ, build bằng **Next.js 16 + Prisma + PostgreSQL (Supabase)**, deploy miễn phí trên **Vercel + Supabase**.

> Tài liệu: [PLAN.md](PLAN.md) (lộ trình 8 phase) · [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) (ERD) · [CLAUDE.md](CLAUDE.md) (kiến trúc).

## Tech stack
Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL · NextAuth v5 (bcryptjs) · Tailwind v4 · Recharts · ExcelJS · dayjs.

## Tính năng
- Đăng nhập + phân quyền 4 mức (ADMIN / MANAGER / MEMBER / VIEWER), đổi mật khẩu.
- Quản trị: Người dùng, Bộ môn, Dự án, Danh mục (Nhóm CV / Giai đoạn).
- Công việc: phân cấp Level 1-5, **nhiều người/việc**, đủ thuộc tính (Bộ môn, Giai đoạn, Ưu tiên, Trạng thái), bộ lọc + cập nhật trạng thái nhanh.
- Nhật ký công việc (timesheet) theo ngày/tuần, khóa sửa sau 2 ngày.
- Báo cáo: biểu đồ theo trạng thái / nhóm / nhân sự / giờ công + xuất Excel.
- Import dữ liệu từ `WM_New.xlsx`.

## Chạy local

### 1. Khởi động Postgres (Docker)
```bash
docker compose up -d
```

### 2. Cấu hình `.env`
Copy `.env.example` → `.env` (mặc định đã trỏ tới Postgres Docker local).

### 3. Schema + dữ liệu
```bash
pnpm install
pnpm db:push      # tạo bảng
pnpm db:seed      # danh mục + admin
pnpm import:all   # (tuỳ chọn) import từ WM_New.xlsx
```

### 4. Chạy
```bash
pnpm dev          # http://localhost:3000
```

**Tài khoản:** `admin` / `Admin@12345` · user demo: `Qlcv@12345` (buộc đổi lần đầu).

## Scripts
| Lệnh | Mô tả |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm type-check` | tsc --noEmit |
| `pnpm db:push` / `db:migrate` / `db:studio` / `db:seed` | Prisma |
| `pnpm import:all` | Import WM_New.xlsx |

## Deploy lên Vercel + Supabase
1. Tạo project **Supabase** → lấy Connection string (Pooling 6543 + Direct 5432).
2. Đặt env trên Vercel: `DATABASE_URL` (pooling, `?pgbouncer=true`), `DIRECT_URL` (5432), `AUTH_SECRET`, `AUTH_TRUST_HOST=true`.
3. Push code lên GitHub → Vercel import repo → Deploy.
4. Chạy `pnpm db:push` (hoặc `prisma migrate deploy`) trỏ vào Supabase, rồi `pnpm db:seed`.

Xem chi tiết Phase 8 trong [PLAN.md](PLAN.md).
