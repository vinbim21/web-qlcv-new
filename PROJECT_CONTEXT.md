# PROJECT_CONTEXT.md — Web QLCV (BIM)

> Cập nhật: 2026-06-29. Đọc file này đầu tiên khi bắt đầu session mới.

---

## Mục tiêu

Website **quản lý công việc nội bộ** thay thế Excel `WM_New.xlsx` cho Phòng BIM.  
~20 người dùng. Không phải sản phẩm thương mại — dùng nội bộ.

---

## Tech stack (đã chốt, không thay đổi)

| Layer | Công nghệ |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| ORM | Prisma 6 |
| Database | PostgreSQL (Supabase production / Docker local) |
| Auth | NextAuth v5 + bcryptjs (**KHÔNG** argon2 — lỗi Vercel native module) |
| UI | shadcn/ui + Tailwind v4 |
| Utilities | dayjs, ExcelJS, Recharts, Zod |

---

## Hosting

- **Production:** Vercel (web) + Supabase PostgreSQL
- **Dev local:** Docker PostgreSQL `postgresql://qlcv:qlcv@localhost:5432/qlcv`
- **URL local:** http://localhost:3000

---

## Workflow build (QUAN TRỌNG)

User **luôn dùng production build**, không dùng `npm run dev`.

```powershell
# 1. Kill server đang chạy (DLL lock khi build)
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess |
  ForEach-Object { taskkill /PID $_ /F }
Start-Sleep -Seconds 2

# 2. Build
cd "c:\setups\VinCode\web-ifc-shared\1.Source Code\web-qlcv-new"
npm run build

# 3. Start (background)
npm start   # chạy background, chờ log "✓ Ready"
```

---

## Database migration

```powershell
# LUÔN dùng db push, KHÔNG dùng migrate dev
npx prisma db push
npx prisma generate
```

> **Lưu ý:** Kill server trước khi `prisma generate` — DLL bị lock khi server đang chạy.

---

## Roles

```
ADMIN > LEVEL_1 > LEVEL_2 > LEVEL_3
```

- ADMIN: toàn quyền, quản lý danh mục, duyệt task
- LEVEL_1/2: giao việc (canAssign), quản lý (canManage)
- LEVEL_3: xem task của mình, ghi giờ, đề xuất đổi ngày/xóa

---

## Tham chiếu dự án gốc

`../web-qlcv` — hệ QLCV hoàn chỉnh khác (Next.js + MySQL), cùng nghiệp vụ.  
Tham khảo UI/schema/logic khi cần.
