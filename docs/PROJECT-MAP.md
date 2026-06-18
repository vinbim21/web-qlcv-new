# Bản đồ dự án — Web QLCV (BIM)

> Snapshot tạo bởi skill `project-map` (Repomix), ngày 2026-06-17. Cập nhật lại khi code đổi nhiều.
> Quét 117 file `src/` + `prisma/` (~38k token). Chỉ ghi những gì đọc được từ code thực tế.

## 1. Tổng quan & mục tiêu
Hệ quản lý công việc nội bộ phòng BIM. Nghiệp vụ chính:
- Khai báo danh mục (nhóm công việc, bộ môn, giai đoạn, loại hình, dự án/hạng mục).
- Tạo & **giao việc** theo cây WBS, nhiều người/việc.
- Nhân viên **cập nhật tiến độ/trạng thái** việc của mình.
- **Duyệt việc** (cổng khởi tạo trước khi làm + cổng hoàn thành).
- **Timesheet** (nhật ký giờ công theo ngày/việc/dự án).
- **Báo cáo** (6 tab: tổng quan, theo dự án, pivot, theo người, theo thời gian, định mức) + export Excel.
- **Thông báo in-app** (chuông): được giao việc, dời hạn, đổi ưu tiên, sắp đến hạn, chờ duyệt.

Đã deploy: Vercel + Supabase, có dữ liệu thật, RLS bật.

## 2. Tech stack & dependencies
- **Framework:** Next.js 16.2 (App Router, React Server Components + Server Actions), React 19.2, TS 5.
- **DB/ORM:** Prisma 6 + PostgreSQL (Supabase). Pooling 6543 runtime, DIRECT_URL 5432 migrate.
- **Auth:** NextAuth v5 beta (Credentials), JWT session 8h, hash `bcryptjs`.
- **UI:** Tailwind v4, shadcn/ui-style + `@base-ui-components/react`, `lucide-react`, `next-themes`, `sonner` (toast).
- **Form/validate:** `react-hook-form` + `@hookform/resolvers` + Zod v4.
- **Khác:** Recharts (biểu đồ), ExcelJS (export), dayjs, dnd-kit (kéo-thả), `class-variance-authority`.
- **Tooling:** pnpm, ESLint 9 (eslint-config-next), tsx (chạy script TS), python (extract Excel).

## 3. Cây thư mục (chú thích vai trò)
```
prisma/
  schema.prisma            # 12 model + 5 enum — nguồn sự thật DB
  seed.ts, seed-construction-types.ts
  backfill-*.ts            # backfill 1 lần: status, ids, sumid, loai-hinh, project-group, du-an-map
  import/                  # extract.py (Excel→JSON) + run-all.ts, add-missing.ts, update-l3.ts, sync-b3-assignees.ts, backup.ts
  verify-*.ts              # script kiểm tra: export, reports, time, notifications, norm-e2e
src/
  app/
    (app)/                 # route group SAU đăng nhập — có layout.tsx (sidebar + header)
      dashboard/           # Tổng quan (KPI)
      tasks/               # "Công việc của tôi" (NV tự cập nhật + tự tạo việc)
      manage/              # "Quản lý công việc" (Admin/Cấp1/Cấp2): bảng lớn, bulk ops, thêm/giao việc
      assign/              # Giao việc (lưới nhập)
      timesheet/           # Nhật ký giờ công
      reports/             # 6 tab báo cáo + biểu đồ (report-data.ts, *-report.tsx, reports-tabs.tsx)
      account/             # Đổi mật khẩu
      admin/               # Khu quản trị (layout riêng)
        users/             # Quản lý người dùng
        projects/          # Quản lý dự án
        catalog/           # "Khai báo thông tin" — danh mục, có [workGroupId]/ chi tiết
    (auth)/login/          # Đăng nhập
    api/
      auth/[...nextauth]/  # NextAuth handler
      export/reports|tasks # Export Excel (route.ts)
    layout.tsx, page.tsx, globals.css
  components/
    app-shell/             # sidebar-nav, mobile-sidebar, notification-bell, breadcrumbs, user-menu
    ui/                    # primitives: button, input, select, modal, table, badge, portal-dropdown...
    charts/                # bar / donut / stacked-bar (bọc Recharts)
    task-form, task-row-editor, task-combobox, user-multi-select, searchable-combobox, timesheet-entry-dialog
  server/
    actions/               # *** SERVER ACTIONS — mọi nghiệp vụ ghi/đọc ***
    auth/                  # config.base.ts (edge), config.ts (node), permissions.ts
    data/task-lookups.ts   # getTaskLookups() gom danh mục cho form
    db/client.ts           # Prisma singleton
    notifications/service.ts
  lib/
    schemas/               # Zod: auth, task, project, timesheet, admin
    labels.ts              # enum → nhãn tiếng Việt + badge variant
    task-status.ts         # effectiveStatus, isOverdue, shouldAutoStart, isStartGateLocked...
    dept-map.ts, report-period.ts, timesheet.ts, utils.ts
  proxy.ts                 # middleware Next 16 (auth guard, matcher)
  types/next-auth.d.ts     # mở rộng session (id, role, fullName)
```

## 4. Các module chính
### 4.1 Server Actions (`src/server/actions/`) — trái tim nghiệp vụ
Mọi mutation bọc `runAction()` → trả `{ ok, data } | { ok, error }`. Check quyền + Zod đầu hàm.
- **tasks.ts** (lớn nhất): `saveTask`, `saveTasksBatch`, `saveMyTasks`, `updateTaskStatus`,
  `setTaskCompletion`, `setTaskPaused`, `setTaskApproval`, `setTaskStartApproval`,
  `bulkSetStatus/Priority/MeasureNorm/Deadline/Approval`, `bulkReassign`, `bulkDelete`, `deleteTask`.
- **projects.ts:** `saveProject`, `saveBimProject`, `saveProjectGroup`, `saveCatalogProject`,
  `batchSaveCatalogProjects`, `deleteProject/ProjectGroup`.
- **catalog.ts:** `saveWorkGroup`, `savePhase`, `addCatalogValue`, `updateCatalogValue`,
  `deleteCatalogValue`, `batchReorderItems` (kéo-thả thứ tự).
- **users.ts:** `createUser`, `updateUser`, `resetUserPassword`, `toggleUserActive`.
- **timesheet.ts:** `saveTimesheetEntry`, `bulkSaveTimesheetEntry`, `deleteTimesheetEntry`.
- **disciplines.ts / construction-types.ts:** save/delete danh mục bộ môn & loại hình.
- **notifications.ts:** `getUnreadCount`, `getNotifications`, `markRead`, `markAllRead`.
- **auth.ts:** `loginAction`, `logoutAction`, `changePasswordAction`.
- **_helpers.ts:** `runAction()` + type `Result<T>`.

### 4.2 Auth & phân quyền (`src/server/auth/`)
- `config.base.ts` — edge-safe (callbacks authorized/jwt/session, KHÔNG prisma/bcrypt).
- `config.ts` — thêm Credentials provider, verify bcrypt, cập nhật `lastLoginAt`, export `auth/signIn/signOut`.
- `permissions.ts` — `requireUser`, `requireRole`, `isAdmin`, `canManage`, `canAssign`,
  `canViewReports`, `canViewPersonReports`.

### 4.3 Trạng thái việc (`src/lib/task-status.ts`)
Status lưu DB; "Quá hạn" suy diễn. Hàm: `effectiveStatus`, `isOverdue`, `isCompletedLate`,
`shouldAutoStart` (Chưa làm + có người + tới ngày → tự chuyển Đang làm), `isStartGateLocked`
(khóa nhập giờ khi chờ duyệt khởi tạo), `completionDateError` (validate ngày hoàn thành).

### 4.4 Thông báo (`src/server/notifications/service.ts`)
`createNotifications`, `notifyAssignment`, `notifyTasksChange`, `ensureDeadlineReminders`
(sinh lười "sắp đến hạn", chống trùng bằng `dedupeKey`). UI: `app-shell/notification-bell.tsx`.

## 5. Luồng dữ liệu / điều khiển
1. **Request** → `src/proxy.ts` (middleware) kiểm session → chưa login redirect `/login`.
2. **Trang** `(app)/*/page.tsx` (Server Component) gọi `auth()` + Prisma/`getTaskLookups()` lấy data,
   truyền xuống `*-client.tsx` (Client Component).
3. **Tương tác** trong client → gọi **Server Action** (`src/server/actions/*`).
4. Action: `requireRole/canManage` → parse Zod → Prisma (+ `notify*` nếu cần) → `revalidatePath`.
5. **Export:** `api/export/reports|tasks/route.ts` dựng workbook ExcelJS → trả file.

## 6. Entry points & cấu hình quan trọng
- [next.config.ts](../next.config.ts) — `serverExternalPackages: [@prisma/client, exceljs, bcryptjs]`.
- [src/proxy.ts](../src/proxy.ts) — middleware + matcher (loại trừ api/auth, _next, static, .svg).
- [src/app/(app)/layout.tsx](<../src/app/(app)/layout.tsx>) — shell: sidebar (theo quyền) + header (chuông, theme, badge role, user menu).
- `.env` — `DATABASE_URL` (pooling 6543), `DIRECT_URL` (5432), `AUTH_SECRET`, Supabase keys.
- Build Vercel: `prisma generate && next build` (script `build`), có `postinstall: prisma generate`.

## 7. Quy ước code
- **Tiếng Việt** cho UI/label/nhận xét; tên biến/hàm tiếng Anh.
- Server Action = ranh giới duy nhất ghi DB; client không đụng Prisma.
- Validate bằng Zod schema trong `src/lib/schemas/` khớp từng action.
- Enum DB ↔ nhãn ở `src/lib/labels.ts`; badge color qua `statusVariant/priorityVariant`.
- Soft-delete `deletedAt`; thứ tự hiển thị bằng cột `order` (+ kéo-thả dnd-kit → `batchReorderItems`).
- Đặt cuid làm id; materialized path (`wbsPath`) cho cây việc.

## 8. Gotchas & nợ kỹ thuật
- **`middleware.ts` đã xóa**, thay bằng `src/proxy.ts` (đổi tên theo Next 16). Đừng tạo lại middleware.
- Không import prisma/bcrypt vào `config.base.ts` (chạy edge/proxy → sẽ vỡ build).
- `bcryptjs` (KHÔNG argon2) vì native module lỗi trên Vercel serverless.
- "Quá hạn" KHÔNG có trong enum — chỉ là lớp phủ `effectiveStatus`.
- `Project.code` không unique đơn lẻ — unique `(code, name)`; nhớ khi upsert dự án.
- Lưu ý đồng bộ nhãn cấp L2/L3 giữa màn `/manage` và `/admin/catalog` (có ghi chú lệch trong handoff).
- Nhiều `backfill-*.ts` là script chạy 1 lần — không phải logic runtime.

## 9. Điểm chính cần nhớ
- Sửa nghiệp vụ ⇒ tìm trong `src/server/actions/*` trước; UI tương ứng ở `src/app/(app)/<route>/*-client.tsx`.
- Đổi DB ⇒ sửa `prisma/schema.prisma` → `pnpm db:push` (hoặc `db:migrate`) → cập nhật `labels.ts` nếu thêm enum.
- Phân quyền ⇒ `src/server/auth/permissions.ts` (4 vai trò ADMIN/LEVEL_1/2/3).
- Trạng thái & hạn việc ⇒ `src/lib/task-status.ts`.
- App đã LIVE trên prod — cẩn trọng khi đổi schema (xem handoff + memory về quy trình đẩy prod).
