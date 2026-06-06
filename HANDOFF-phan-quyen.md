# HANDOFF — Phân quyền + 2 tab công việc

> Tạm dừng ngày 2026-06-05. File này để mai làm tiếp ngay không cần nhớ lại.
> Nhánh: `dev`.

---

## A. ĐÃ XONG trong phiên này (đang nằm ở working tree, CHƯA commit)

### 1. `/tasks` → worklist cá nhân thật sự ("Công việc của tôi")
- **`src/app/(app)/tasks/page.tsx`**: query thêm `assignees: { some: { userId: session.user.id } }`
  → chỉ tải việc của chính mình (không kéo 2000 dòng cả phòng).
- **`src/app/(app)/tasks/tasks-client.tsx`**:
  - Tiêu đề đổi thành **"Công việc của tôi"**, subtitle "… việc được giao · N quá hạn".
  - Bỏ checkbox "Chỉ việc của tôi" (đã thừa), bỏ field `f.mine`.
  - Thêm helper `effOf()` dùng `effectiveStatus` → trạng thái KHỚP với `/manage` (sửa lỗi nhất quán).
  - Thêm `overdueCount` (đếm quá hạn trên toàn bộ việc của tôi).

### 2. Tab "Quản lý công việc" chỉ cho Admin / Cấp 1 / Cấp 2
- **`src/components/app-shell/sidebar-nav.tsx`**: tách `MANAGE_NAV` ra, chỉ chèn vào menu khi `canAssign`.
- **`src/app/(app)/manage/page.tsx`**: `if (!canAssign(...)) redirect("/tasks")` — chặn cả vào bằng URL.

> ✅ Cả 2 phần trên đã `tsc --noEmit` sạch.

---

## B. ĐANG LÀM DỞ — Refactor phân quyền theo ma trận (ĐÃ DUYỆT, CHƯA bắt đầu code)

### Ma trận chốt
| Quyền | Admin | Cấp 1 | Cấp 2 | Cấp 3 |
|---|:--:|:--:|:--:|:--:|
| Thêm thành viên | ✅ | ✅ | ❌ | ❌ |
| Set quyền | ✅ | ✅ | ❌ | ❌ |
| Thêm mục (danh mục) | ✅ | ✅ | ❌ | ❌ |
| Giao việc | ✅ | ✅ | ✅ | ❌ |
| Khai báo công việc | ✅ | ❌ | ✅ | ✅ |
| Xem báo cáo | ✅ | ✅ | ✅ | ✅ |

### Predicate đích (sửa `src/server/auth/permissions.ts`)
```ts
canAdminister(role)  = ADMIN | LEVEL_1            // gộp: Thêm thành viên + Set quyền + Thêm mục
canAssign(role)      = ADMIN | LEVEL_1 | LEVEL_2  // giữ nguyên — Giao việc + sửa/xóa task
canReportWork(role)  = ADMIN | LEVEL_2 | LEVEL_3  // MỚI — Khai báo công việc (Cấp 1 KHÔNG)
canViewReports(role) = ADMIN | LEVEL_1 | LEVEL_2 | LEVEL_3   // tất cả
// canManage và canViewPersonReports → BỎ (xem ánh xạ bên dưới)
```

### 2 lưu ý an toàn ĐÃ DUYỆT (phải làm)
1. **Set quyền:** Cấp 1 được sửa user, nhưng **chỉ ADMIN mới được gán role = ADMIN** (chặn leo thang quyền). Đặt guard trong `users.ts` (createUser/updateUser/setRole).
2. **Cấp 2 giao việc toàn phòng** (mặc định, không giới hạn phạm vi).

### Danh sách điểm sửa (file:line — từ grep)

**`src/server/auth/permissions.ts`**
- Thêm `canAdminister`, `canReportWork`; sửa `canViewReports` = tất cả; bỏ/deprecate `canManage` + `canViewPersonReports`.

**Quyền quản trị → mở cho Cấp 1 (hiện đang chỉ ADMIN):**
- `src/server/actions/users.ts` (L12, L33, L51, L64): `requireRole("ADMIN")` → `requireRole("ADMIN","LEVEL_1")` **+ guard: chỉ ADMIN set role=ADMIN**.
- `src/server/actions/disciplines.ts` (L11, L29): `requireRole("ADMIN")` → `+ "LEVEL_1"`.
- `src/server/actions/construction-types.ts` (L11, L29): tương tự.
- `src/server/actions/catalog.ts` (L13,34,47,65,79,95,106): tương tự.
- `src/server/actions/projects.ts` (L17 đã ADMIN|LEVEL_1 ✅; L39 `requireRole("ADMIN")` → `+ "LEVEL_1"`).
- **Menu Quản trị** `src/components/app-shell/sidebar-nav.tsx` L72 `isAdmin ?` → đổi sang cờ `canAdminister`.
  Kéo theo `src/app/(app)/layout.tsx` L38-39: truyền thêm `canAdminister` (hiện chỉ có `isAdmin`).

**Task CRUD: `canManage` → `canAssign` (để Cấp 2 sửa/xóa được):**
- `src/server/actions/tasks.ts`:
  - L65 update task: `canManage` → `canAssign`.
  - L249, L293, L308, L333, L348, L379, L462 (bulk + delete): `canManage` → `canAssign`. Sửa luôn message "Chỉ Quản trị/Cấp 1…".
- `src/app/(app)/manage/page.tsx` L17 + `manage-client.tsx` (prop `canManage`, nhiều chỗ): đổi sang `canAssign`.
- `src/app/(app)/tasks/page.tsx` L14 + `tasks-client.tsx`: nút sửa/xóa/Thêm dùng `canAssign`.

**Khai báo công việc (đổi trạng thái) → `canReportWork || isAssignee`:**
- `tasks.ts` updateTaskStatus (quanh L162 dùng canAssign? kiểm tra lại) — gate đổi status nên là `canReportWork(role) || isAssignee`. ⚠️ Cấp 1 KHÔNG tự khai báo.
- `manage-client.tsx` L672 + `tasks-client.tsx` L399: `disabled={!canManage && !isAssignee}` → `disabled={!canReportWork && !isAssignee}`.

**Báo cáo → Cấp 3 SELF-ONLY (PA1 — ĐÃ CHỐT LẠI 2026-06-06, thay quyết định "mở mọi báo cáo" cũ):**
- Cấp 3 vào được /reports nhưng **chỉ thấy dữ liệu của chính mình**; mốc "TB phòng" (định mức) vẫn hiện (ẩn danh). Tab cho Cấp 3: **Tổng quan / Định mức / Thời gian theo việc** (ẩn Theo nhóm/Theo phòng/Theo nhân sự).
- ✅ ĐÃ LÀM (working tree, chưa commit):
  - `permissions.ts`: thêm `canViewReports` (mọi role). `canViewPersonReports` giữ = ADMIN|L1|L2 (= cờ "xem toàn phòng").
  - `reports/page.tsx`: `selfOnly = !canViewPerson`; lọc `tasks`/`hoursByUser`/`normRows`/`timeEntries`/`unattributed` theo `userId`; `byDept` (TB phòng) vẫn toàn phòng.
  - `reports-tabs.tsx` / `reports-client.tsx` / `time-by-task.tsx`: ẩn tab + 2 card cross-person + ô lọc Nhân sự khi `selfOnly`.
  - `api/export/reports/route.ts` + `api/export/tasks/route.ts`: ép scope theo `userId` cho Cấp 3 (server-side, không phụ thuộc URL).

### ⚠️ Thay đổi hành vi cần test
- Cấp 2 vào `/manage` giờ **sửa/xóa/thao tác hàng loạt được** (trước chỉ xem).
- Cấp 1 **không** đổi trạng thái việc được (trừ khi là người được giao).
- Cấp 1 vào được `/admin/*` (trước chỉ Admin).
- Cấp 3 xem được mọi báo cáo, kể cả theo người/định mức.

---

## C. Việc dang dở khác (không liên quan, có sẵn từ trước)
- Tính năng **notifications** đang làm dở (untracked): `src/server/notifications/`, `src/server/actions/notifications.ts`, `src/components/app-shell/notification-bell.tsx`, `prisma/verify-notifications.ts`, sửa `prisma/schema.prisma`. Chưa đụng tới trong phiên này.

## D. Lệnh kiểm tra nhanh khi tiếp tục
```
npx tsc --noEmit -p tsconfig.json
```
