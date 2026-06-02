# Web QLCV - Quản lý công việc phòng

## Mục tiêu
Website quản lý công việc (QLCV) dùng nội bộ cho phòng. Ít người dùng, dữ liệu không lớn.

## Nền tảng đã chốt (100% miễn phí, không cần thẻ tín dụng)

| Thành phần | Dịch vụ | Free tier |
|---|---|---|
| Web hosting | **Vercel** | Miễn phí cho hobby/cá nhân |
| Database + Auth | **Supabase** (PostgreSQL) | 500MB DB, 50.000 user auth, có sẵn API + Auth + Storage |

> **Lý do chọn:** Vercel host phần web (frontend + serverless API) nhưng không có database sẵn,
> nên ghép thêm Supabase. Supabase cung cấp luôn **database + đăng nhập + phân quyền + storage**,
> giảm nhiều công sức code backend.

## Các lựa chọn đã cân nhắc (không dùng)
- **Neon** — PostgreSQL serverless, free 0.5GB (phương án DB thay thế nếu cần).
- **Turso** — SQLite/libSQL, free tier rộng.
- **MongoDB Atlas** — NoSQL, free 512MB.
- **Firebase** — all-in-one (Hosting + Firestore + Auth).
- **PlanetScale** — ❌ đã bỏ free tier (2024), phải trả phí.

## Tech stack đã chốt
Next.js 16 (App Router) + React 19 + TypeScript + Prisma 6 + **Supabase PostgreSQL**
+ shadcn/ui + Tailwind v4 + **NextAuth v5 + bcryptjs** + Zod + Recharts + ExcelJS + dayjs.

## Quyết định kiến trúc (đã chốt)
- **Cách làm:** Lai — học kiến trúc dự án gốc `../web-qlcv`, code lại gọn hơn (bỏ audit log + pivot phức tạp ở v1).
- **Đăng nhập:** NextAuth credentials, hash bằng **bcryptjs** (KHÔNG dùng argon2 — native module lỗi trên Vercel serverless).
- **Mô hình việc:** bám sát Excel — **nhiều người/việc** (bảng `TaskAssignee`), đủ thuộc tính Bộ môn / Giai đoạn / Nhóm CV / Ưu tiên.
- **Lưu ảnh:** Supabase Storage (thay local FS của gốc).
- **DB connection:** dùng *Connection Pooling* (port 6543, `?pgbouncer=true`) cho serverless; `DIRECT_URL` (5432) cho migrate.

## Tham chiếu
- **Dự án gốc:** `../web-qlcv` — hệ QLCV hoàn chỉnh (Next.js + Prisma + MySQL), cùng nghiệp vụ. Tham khảo UI/schema/server actions.
- **Dữ liệu hiện tại:** `WM_New.xlsx` — cách phòng đang quản lý (16 sheet: Data, Bảng 1-7, XD/MEPF/IT, Report 1-4).
- **Lộ trình code:** [PLAN.md](PLAN.md) — 8 phase chi tiết.
- **Thiết kế DB:** [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) — ERD.

## Lưu ý
- Free tier đủ cho dùng nội bộ phòng.
- Nếu dữ liệu nhạy cảm / nhiều người dùng → cân nhắc nâng cấp để đảm bảo backup & bảo mật.

## Trạng thái
- [x] Chốt nền tảng + tech stack + kiến trúc
- [ ] Phase 0 — Khởi tạo dự án + Supabase + Vercel
- [ ] Phase 1-8 — xem [PLAN.md](PLAN.md)
