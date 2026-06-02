# KẾ HOẠCH XÂY DỰNG WEB QLCV PHÒNG BIM

> Tài liệu lộ trình từng phase để tự code web Quản lý công việc.
> **Nguồn tham khảo:** dự án gốc `../web-qlcv` (Next.js + Prisma, đã chạy thật) + file `WM_New.xlsx`.
> Xem thêm: [CLAUDE.md](CLAUDE.md) (nền tảng), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) (ERD).

---

## 0. Quyết định kiến trúc (đã chốt)

| Hạng mục | Lựa chọn | Ghi chú |
|---|---|---|
| Cách làm | **Lai** — học kiến trúc gốc, code lại gọn | Giữ core, bỏ audit log + pivot phức tạp ở v1 |
| Hosting | **Vercel** (free) | Frontend + API serverless |
| Database | **Supabase PostgreSQL** (free) | Đổi Prisma provider `mysql` → `postgresql` |
| Lưu ảnh | **Supabase Storage** (free) | Thay cho local FS của gốc |
| Đăng nhập | **NextAuth v5 (credentials) + bcryptjs** | Thay `argon2` (native, lỗi trên Vercel) |
| Phân quyền | RBAC 4 role: ADMIN / MANAGER / MEMBER / VIEWER | |
| Mô hình việc | **Nhiều người/việc** + đủ thuộc tính Excel | Bộ môn, Giai đoạn, Ưu tiên, Trạng thái |
| Ngôn ngữ UI | **Tiếng Việt** (theo gốc) | Dashboard / Dự án / Công việc / Nhật ký / Báo cáo |

**Tech stack:** Next.js 16 (App Router) + React 19 + TypeScript + Prisma 6 + Supabase Postgres
+ shadcn/ui + Tailwind v4 + NextAuth v5 + bcryptjs + Zod + Recharts + ExcelJS + dayjs.

---

## Sơ đồ luồng dữ liệu (khớp Excel)

```
Danh mục (Data) ─┐
                 ├─► Công việc (Bảng 1-7) ──► Nhật ký giờ (XD/MEPF/IT) ──► Báo cáo (Report 1-4)
Người dùng ──────┘        WBS 5 cấp                theo ngày                  query tự tính
```

---

# PHASE 0 — Khởi tạo dự án & hạ tầng miễn phí
**Mục tiêu:** Có project Next.js chạy local + Supabase DB rỗng + Vercel kết nối.

1. **Tạo project Next.js** trong thư mục này:
   ```bash
   npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*"
   ```
2. **Cài thư viện cốt lõi:**
   ```bash
   npm i prisma @prisma/client next-auth@beta bcryptjs zod react-hook-form @hookform/resolvers \
         recharts dayjs lucide-react clsx tailwind-merge class-variance-authority sonner exceljs
   npm i -D @types/bcryptjs tsx
   ```
3. **Khởi tạo shadcn/ui:** `npx shadcn@latest init` → thêm sẵn: `button card input label select table tabs dialog dropdown-menu badge avatar separator sheet skeleton tooltip sonner`.
4. **Tạo Supabase project** (supabase.com → New project, chọn region Singapore):
   - Lấy **Connection string** (Settings → Database → Connection string → URI, dùng *Connection Pooling* port 6543 cho serverless).
5. **Tạo `.env`:**
   ```env
   DATABASE_URL="postgresql://...@...pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://...@...supabase.com:5432/postgres"   # cho migrate
   AUTH_SECRET="<sinh bằng: npx auth secret>"
   ```
6. **Tạo Git repo + push lên GitHub** (Vercel deploy từ GitHub).
7. **Kết nối Vercel:** vercel.com → Import GitHub repo → thêm env vars → deploy thử (trang mặc định).

✅ **Nghiệm thu:** `npm run dev` chạy localhost:3000; Vercel build xanh; Supabase project sống.

---

# PHASE 1 — Database schema (Prisma + Postgres) + danh mục gốc
**Mục tiêu:** Có đầy đủ bảng khớp Excel, seed sẵn danh mục.

1. **Cấu hình `prisma/schema.prisma`** (provider `postgresql`, `directUrl`). Định nghĩa:
   - **Enums:** `UserRole`, `TaskStatus` (CHUA_LAM / DANG_LAM / HOAN_THANH / TAM_DUNG), `TaskPriority` (CAO / TRUNG_BINH / THAP).
   - **Bảng tra cứu:** `WorkGroup` (Nhóm CV - Level 1, 6 nhóm), `Discipline` (Bộ môn - Level 4: BIM/KT/KC/MEPF/HT/IT/DI/DN), `Phase` (Giai đoạn: Concept→Vận hành), `Project` (dự án, code+name).
   - **Bảng chính:**
     - `User` — username, email, fullName, passwordHash, role, disciplineId, isActive.
     - `Task` — projectId?, workGroupId, sumId, subId, level2, level3, level5, disciplineId, phaseId, priority, status, parentId, wbsPath, level, plannedStart/End, actualEnd, progressPercent.
     - `TaskAssignee` — **bảng nối nhiều-nhiều** (taskId, userId, roleNo 1/2/3). ⭐ điểm khác gốc.
     - `TimeSheetEntry` — userId, taskId, date, hours(Decimal), note.
   - (v2 mới thêm: `TaskUpdate`, `TaskAttachment`, `AuditLog`.)
   > Tham khảo gần như nguyên văn `../web-qlcv/prisma/schema.prisma`, chỉ đổi: provider, gộp 4 role, thêm `TaskAssignee`, thêm `disciplineId`/`phaseId`/`workGroupId`.
2. **Đẩy schema:** `npx prisma db push` → kiểm tra bảng hiện trong Supabase Table Editor.
3. **Prisma client singleton:** `src/server/db/client.ts`.
4. **Seed danh mục** (`prisma/seed.ts`, chạy `npx tsx prisma/seed.ts`):
   - 6 `WorkGroup`, ~8 `Discipline`, 8 `Phase` (từ sheet **Data**).
   - 1 user `admin` (bcrypt hash), vài user demo theo tên trong Excel (Hà Minh Luân, Mai Hồng Hạnh...).

✅ **Nghiệm thu:** Supabase có ~9 bảng; `prisma studio` xem được danh mục đã seed.

---

# PHASE 2 — Đăng nhập + Phân quyền + Khung giao diện (App Shell)
**Mục tiêu:** Đăng nhập được, có sidebar tiếng Việt giống gốc.

1. **NextAuth v5 (credentials):** `src/server/auth/config.ts` — verify bằng `bcryptjs.compare`. JWT session.
   > Tham khảo gốc nhưng đổi `argon2.verify` → `bcrypt.compare`.
2. **Middleware** bảo vệ route `(app)/*`, cho phép `/login`, `/api/auth`.
3. **Trang `/login`** — form username/password (react-hook-form + Zod), `sonner` toast lỗi.
4. **RBAC helper** `src/server/auth/permissions.ts` — `can(user, action, resource)`.
5. **App Shell** (copy cấu trúc gốc, rút gọn):
   - `src/app/(app)/layout.tsx` — grid sidebar 260px + header (breadcrumb, dark mode toggle, avatar, đăng xuất).
   - `src/components/app-shell/sidebar-nav.tsx` — menu:
     - **Chính:** Dashboard · Dự án · Công việc của tôi · Nhật ký · Báo cáo
     - **Quản trị (chỉ ADMIN):** Người dùng · Bộ môn · Dự án · Danh mục
   - Mobile drawer (`sheet`).
6. **Dark mode** (`next-themes`).

✅ **Nghiệm thu:** Login admin → vào Dashboard; sai mật khẩu báo lỗi; sidebar điều hướng OK; responsive mobile.

---

# PHASE 3 — Quản trị danh mục (Admin CRUD)
**Mục tiêu:** Quản lý người dùng và các danh mục nền (thay việc gõ tay trong sheet Data).

1. **Người dùng** `/admin/users` — bảng + dialog thêm/sửa (gán Bộ môn, Role), reset mật khẩu, bật/tắt active.
2. **Bộ môn** `/admin/disciplines` — CRUD đơn giản (mã + tên).
3. **Dự án** `/admin/projects` (hoặc trang `/projects`) — CRUD: mã dự án (B.DSHNQN.DMF), tên, trạng thái.
4. **Danh mục khác** `/admin/catalog` — Nhóm công việc, Giai đoạn (thường cố định, chỉ xem/sửa nhẹ).
5. **Server Actions** trong `src/server/actions/*.ts` (`"use server"`) + Zod validate, có toast kết quả.

✅ **Nghiệm thu:** Thêm/sửa/xóa user, bộ môn, dự án qua UI; dữ liệu lưu vào Supabase.

---

# PHASE 4 — Công việc (Bảng giao việc + WBS) ⭐ trọng tâm
**Mục tiêu:** Tái hiện Bảng 1-7: giao việc 5 cấp, nhiều người/việc, đủ thuộc tính.

1. **Danh sách công việc** `/tasks` — bảng có **bộ lọc**: Nhóm CV, Dự án, Bộ môn, Giai đoạn, Người thực hiện, Trạng thái, Ưu tiên (giống Excel filter). Phân trang.
2. **Cây WBS** (tham khảo `../web-qlcv/src/components/wbs/`) — hiển thị Level 1→5 dạng cây, mã tự sinh `01.02.03`.
3. **Dialog thêm/sửa công việc:**
   - Chọn Nhóm CV (L1), nhập Hạng mục (L2), Chi tiết (L3), chọn Bộ môn (L4), nhập Đầu việc (L5).
   - Chọn Dự án, Giai đoạn, **Mức độ ưu tiên** (Cao/TB/Thấp), Trạng thái.
   - **Người thực hiện 01/02/03** — combobox tìm kiếm (bỏ dấu tiếng Việt), lưu vào `TaskAssignee`.
   - Ngày bắt đầu / kết thúc (dayjs).
4. **Trang công việc của tôi** — lọc task mà user là assignee (qua `TaskAssignee`).
5. **Cập nhật tiến độ/trạng thái** nhanh ngay trên bảng.

✅ **Nghiệm thu:** Tạo 1 công việc gán 2-3 người, hiện đúng trong cây WBS + "Công việc của tôi" của từng người; lọc hoạt động.

---

# PHASE 5 — Nhật ký công việc (Timesheet theo ngày)
**Mục tiêu:** Tái hiện sheet XD/MEPF/IT: mỗi người log giờ theo việc, theo ngày.

1. **Trang `/timesheet`** — xem theo tuần (7 ngày), mỗi dòng = 1 công việc, nhập **số giờ + nội dung** mỗi ngày.
   > Tham khảo `../web-qlcv/src/components/timesheet/` (week-view + entry-dialog).
2. **Thêm/sửa entry** — chọn công việc (từ task được giao), ngày, giờ (0-24), nội dung.
3. **Khóa sửa 2 ngày** (tùy chọn) — chỉ sửa entry trong 2 ngày gần nhất, admin override.
4. **Tổng giờ** theo ngày/tuần hiển thị ở chân bảng (giống dòng tổng trong Excel).

✅ **Nghiệm thu:** Nhập giờ cho vài ngày → tổng giờ đúng; chỉ thấy task của mình.

---

# PHASE 6 — Báo cáo & Dashboard (thay Report 1-4)
**Mục tiêu:** Báo cáo tự tính từ dữ liệu, không nhập tay.

1. **Dashboard** `/dashboard` — Card thống kê: số dự án, công việc của tôi, giờ công 7 ngày, % hoàn thành.
2. **Báo cáo** `/reports` (tham khảo `../web-qlcv/src/app/(app)/reports/`):
   - **Theo nhóm công việc** (Report 1/2): donut/bar — tổng / đang làm / hoàn thành / tạm dừng / **quá hạn**.
     > Quá hạn = `ngay_ket_thuc < hôm nay AND status != HOAN_THANH` (tính trong query, không lưu).
   - **Theo nhân sự** (Report 3): bảng + bar chart số việc mỗi người.
   - **Định mức giờ** (Report 4): tổng giờ theo người × loại đầu việc (từ `TimeSheetEntry`).
   - **Bộ lọc** ngày/phòng/dự án/người/trạng thái.
3. **Biểu đồ** dùng Recharts (`components/charts/`).
4. **Export Excel** `/api/export/tasks` — ExcelJS xuất danh sách đã lọc.

✅ **Nghiệm thu:** Biểu đồ khớp số liệu thực; đổi bộ lọc → cập nhật; tải file Excel ra mở được.

---

# PHASE 7 — Nhập dữ liệu thật từ `WM_New.xlsx`
**Mục tiêu:** Đưa dữ liệu Excel hiện có lên web (không gõ lại tay).

1. **Script import** `prisma/import/` (chạy bằng `tsx`, đọc Excel bằng ExcelJS):
   - `import-catalog.ts` — Nhóm CV, Bộ môn, Giai đoạn, Dự án từ sheet **Data**.
   - `import-users.ts` — danh sách nhân sự (cột Nhân sự), set `mustChangePassword`.
   - `import-tasks.ts` — đọc **Bảng 1-7** → tạo `Task` + `TaskAssignee` (tách cột Nhân sự 01/02/03); parse Sum ID → wbsPath.
   - `import-timesheets.ts` — đọc **XD/MEPF/IT** → `TimeSheetEntry` (mỗi ô Ngày+Giờ+Nội dung = 1 dòng).
2. **Idempotent** — chạy lại không nhân đôi (check theo sumId/username).
3. **Script verify** — đếm số bản ghi, in vài mẫu để đối chiếu Excel.

✅ **Nghiệm thu:** Số task/timesheet trên web khớp Excel; mở vài dự án kiểm tra đúng người + ngày.

---

# PHASE 8 — Hoàn thiện & Deploy chính thức
**Mục tiêu:** Lên Vercel chạy thật, an toàn cơ bản.

1. **Security headers** (next.config: HSTS, X-Frame-Options, Referrer-Policy).
2. **Rate limit** `/api/auth` (chống dò mật khẩu).
3. **Trang đổi mật khẩu** + buộc đổi lần đầu.
4. **Kiểm thử** luồng chính (login → tạo việc → log giờ → xem báo cáo).
5. **Deploy Vercel production** — set env vars (DATABASE_URL pooling, AUTH_SECRET, AUTH_URL), `prisma migrate deploy` hoặc `db push`.
6. **Backup** — bật Point-in-time / scheduled backup của Supabase; export định kỳ.

✅ **Nghiệm thu:** Web chạy trên domain Vercel; nhiều người dùng đăng nhập đồng thời OK; báo cáo đúng.

---

## Ước lượng & thứ tự ưu tiên

| Phase | Nội dung | Độ ưu tiên |
|---|---|---|
| 0-1 | Hạ tầng + Schema | 🔴 Bắt buộc trước |
| 2 | Auth + Shell | 🔴 Bắt buộc |
| 3-4 | Danh mục + Công việc | 🔴 Lõi nghiệp vụ |
| 5 | Nhật ký giờ | 🟠 Quan trọng |
| 6 | Báo cáo | 🟠 Quan trọng |
| 7 | Import Excel | 🟡 Khi cần dữ liệu thật |
| 8 | Hoàn thiện + Deploy | 🔴 Trước khi dùng thật |

**MVP tối thiểu để phòng dùng được:** Phase 0 → 6 (bỏ qua 7 nếu nhập tay dần).

---

## Khác biệt chính so với dự án gốc (cần nhớ khi code)

| Vấn đề | Gốc | Bản này |
|---|---|---|
| Database | MySQL/MariaDB (XAMPP) | PostgreSQL (Supabase) |
| Lưu ảnh | Local filesystem | Supabase Storage |
| Hash mật khẩu | argon2 (native) | bcryptjs (chạy Vercel) |
| Người/việc | 1 assignee | **Nhiều (bảng `TaskAssignee`)** |
| Thuộc tính việc | cơ bản | thêm Bộ môn / Giai đoạn / Nhóm CV |
| Hosting | PM2 + nginx self-host | Vercel serverless |
| Phạm vi v1 | đầy đủ (audit, pivot...) | gọn (bỏ audit log, pivot nâng cao) |

---

## Trạng thái tổng
- [x] Phân tích Excel + dự án gốc
- [x] Chốt kiến trúc
- [x] Phase 0 — Hạ tầng ✅
- [x] Phase 1 — Schema + seed ✅
- [x] Phase 2 — Auth + RBAC + Shell ✅
- [x] Phase 3 — Danh mục ✅
- [x] Phase 4 — Công việc (L1-5, 3 người/việc, bộ lọc) ✅
- [x] Phase 5 — Nhật ký giờ ✅
- [x] Phase 6 — Báo cáo + xuất Excel ✅
- [x] Phase 7 — Import WM_New.xlsx (554 task, 119 nhật ký, 30 dự án) ✅
- [ ] Phase 8 — Deploy Vercel + Supabase (cần tài khoản của bạn)

> **Đã build + chạy thật local:** `pnpm build` PASS · login → /dashboard /tasks /timesheet /reports /admin đều 200 · xuất Excel OK · type-check 0 lỗi.
> Import 2 bước: `python prisma/import/extract.py` (Excel→JSON) → `pnpm import:load` (JSON→DB), hoặc gộp `pnpm import:all`. (ExcelJS treo với file này nên dùng openpyxl để trích xuất.)
