# Web QLCV (BIM) — Quản lý công việc phòng

> Hướng dẫn cho Claude khi làm việc trong dự án này. Tự động đọc mỗi phiên.

## Tổng quan
Website quản lý công việc (QLCV) nội bộ phòng BIM: tạo/giao việc theo WBS, cập nhật tiến độ,
nhật ký giờ công (timesheet), duyệt việc và báo cáo. Ít người dùng, dữ liệu không lớn.
Đã deploy thật: **web-qlcv-new.vercel.app** (DB Supabase, có dữ liệu thật, RLS bật).

## Tech stack
Next.js 16 (App Router) + React 19 + TypeScript + Prisma 6 + **Supabase PostgreSQL**
+ shadcn/ui (+ base-ui) + Tailwind v4 + **NextAuth v5 (credentials + bcryptjs)** + Zod
+ Recharts + ExcelJS + dayjs + dnd-kit. Package manager: **pnpm**.

## Nền tảng (đã chốt — 100% free tier)
| Thành phần | Dịch vụ | Ghi chú |
|---|---|---|
| Web hosting | **Vercel** | Hobby free; build = `prisma generate && next build` |
| DB + Auth + Storage | **Supabase** (PostgreSQL) | Pooling port 6543 `?pgbouncer=true` cho runtime; `DIRECT_URL` 5432 cho migrate |

## Cấu trúc chính
| Đường dẫn | Vai trò |
|-----------|---------|
| [prisma/schema.prisma](prisma/schema.prisma) | Nguồn sự thật của DB (12 model, 5 enum) |
| [src/app/(app)/](src/app/(app)/) | Các trang sau đăng nhập (route group có sidebar/layout) |
| [src/app/(auth)/login/](src/app/(auth)/login/) | Trang đăng nhập |
| [src/app/api/](src/app/api/) | Route handlers: NextAuth + export Excel |
| [src/server/actions/](src/server/actions/) | **Server Actions** — toàn bộ ghi/đọc nghiệp vụ (~59 hàm) |
| [src/server/auth/](src/server/auth/) | Cấu hình NextAuth (tách edge-safe / node) + permissions |
| [src/server/db/client.ts](src/server/db/client.ts) | Prisma singleton |
| [src/server/notifications/service.ts](src/server/notifications/service.ts) | Sinh thông báo in-app (chuông) |
| [src/lib/](src/lib/) | Schemas Zod, labels enum→tiếng Việt, logic trạng thái việc |
| [src/components/](src/components/) | UI dùng chung + app-shell (sidebar, bell, breadcrumbs) |
| [prisma/import/](prisma/import/), `prisma/backfill-*.ts` | Script import từ Excel + backfill dữ liệu |

## Kiến trúc & luồng chính
- **Auth tách 2 lớp:** [config.base.ts](src/server/auth/config.base.ts) edge-safe (KHÔNG import
  prisma/bcrypt) cho proxy/middleware; [config.ts](src/server/auth/config.ts) thêm Credentials
  provider (chạy Node, bcrypt). [src/proxy.ts](src/proxy.ts) = middleware Next 16 (đổi tên từ
  `middleware.ts`) bảo vệ mọi route, redirect chưa login → `/login`.
- **Luồng ghi dữ liệu:** Client component → gọi **Server Action** trong `src/server/actions/*`
  → kiểm quyền (`requireRole`/`canManage`...) → validate Zod (`src/lib/schemas/*`) → Prisma →
  `revalidatePath`. Action bọc trong `runAction()` trả `{ ok, data } | { ok, error }`
  ([_helpers.ts](src/server/actions/_helpers.ts)).
- **Mô hình việc (WBS):** `Task` đa cấp (level 1..5, `wbsPath` materialized path, `parentId`).
  Nhiều người/việc qua bảng nối `TaskAssignee`. Phân loại: `WorkGroup`(L1) / `CatalogItem`(L2/3/5)
  / `Discipline`(Bộ môn L4) / `Phase`(Giai đoạn) / `Project`(Hạng mục) ⊂ `ProjectGroup`(Dự án).
- **Trạng thái việc:** lưu thật trong DB (`CHUA_LAM/DANG_LAM/HOAN_THANH/TAM_DUNG`); **"Quá hạn"
  KHÔNG lưu** — suy ra qua [src/lib/task-status.ts](src/lib/task-status.ts) `effectiveStatus()`.
- **Phân quyền** ([permissions.ts](src/server/auth/permissions.ts)): `ADMIN` / `LEVEL_1` (quản lý)
  / `LEVEL_2` (tự cập nhật + tạo việc) / `LEVEL_3` (chỉ xem, báo cáo self-only).
- **Duyệt việc 2 cổng:** duyệt KHỞI TẠO (trước khi làm: `approverId` + `startApprovedAt`, khóa nhập
  giờ khi chờ duyệt) và duyệt HOÀN THÀNH (`approvedById` + `approvedAt`, ký sau khi xong).

## Lệnh hay dùng
```bash
pnpm dev                 # chạy local (next dev)
pnpm build               # prisma generate && next build (đúng lệnh Vercel)
pnpm type-check          # tsc --noEmit
pnpm lint                # eslint
pnpm db:push             # đẩy schema → DB (KHÔNG migration file)
pnpm db:migrate          # tạo migration (prisma migrate dev)
pnpm db:studio           # Prisma Studio
pnpm db:seed             # seed dữ liệu danh mục
pnpm import:all          # extract Excel (python) + load vào DB (tsx)
```

## Quy ước & lưu ý (gotchas)
- **Mọi mutation đi qua Server Action** trong `src/server/actions/*` (KHÔNG gọi Prisma từ client).
  Luôn check quyền đầu hàm và validate bằng Zod schema tương ứng trong `src/lib/schemas/*`.
- **bcryptjs, KHÔNG argon2** (native module lỗi trên Vercel serverless). `bcryptjs/exceljs/@prisma/client`
  khai trong `serverExternalPackages` ([next.config.ts](next.config.ts)).
- **Edge-safe auth:** không import prisma/bcrypt vào `config.base.ts` (chạy ở proxy/edge).
- **Nhãn tiếng Việt** tập trung ở [src/lib/labels.ts](src/lib/labels.ts) (`*_LABEL`, `statusVariant`...).
  Khi thêm enum nhớ cập nhật cả schema lẫn labels.
- **"Quá hạn"** là trạng thái suy diễn, không lưu DB — đừng thêm vào enum `TaskStatus`.
- Soft-delete bằng `deletedAt` ở nhiều model — nhớ filter `deletedAt: null` khi query.
- `Project.code` KHÔNG unique đơn lẻ; unique theo `(code, name)` (nhóm Quản lý BIM mỗi mã+tên là 1 dự án).
- DB connection runtime phải dùng **pooling 6543**; migrate/push dùng **DIRECT_URL 5432**.

## Tham chiếu
- **Bản đồ chi tiết:** [docs/PROJECT-MAP.md](docs/PROJECT-MAP.md) — kiến trúc đầy đủ, danh sách module/luồng.
- **Thiết kế DB:** [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) · **Lộ trình:** [PLAN.md](PLAN.md).
- **Handoff đang dở:** [HANDOFF-phan-quyen.md](HANDOFF-phan-quyen.md), [HANDOFF-duyet-viec.md](HANDOFF-duyet-viec.md).
- **Dự án gốc tham khảo:** `../web-qlcv` (Next + Prisma + MySQL, cùng nghiệp vụ).
- **Dữ liệu nguồn:** `WM_New.xlsx` (16 sheet) — cách phòng đang quản lý bằng Excel.

## Trạng thái
- [x] Chốt nền tảng + tech stack + kiến trúc
- [x] Phase 0 — Khởi tạo + Supabase + Vercel (**đã deploy, có dữ liệu thật**)
- [~] Đang hoàn thiện: phân quyền theo ma trận, duyệt việc, redesign /manage · /reports · /admin/catalog
- [ ] Phần còn lại — xem [PLAN.md](PLAN.md)
