# ARCHITECTURE.md — Kiến trúc code Web QLCV

> Cập nhật: 2026-06-23

---

## Cấu trúc thư mục

```
src/
  app/(app)/
    assign/           Giao việc (ADMIN/LEVEL_1/LEVEL_2)
    manage/           Quản lý công việc (bảng đầy đủ, manager view)
    tasks/            Công việc của tôi (member view)
    reports/          Báo cáo
    timesheet/        Nhật ký giờ
    admin/
      catalog/        Khai báo danh mục (7 tab master data)
      projects/       Quản lý dự án
      users/          Quản lý người dùng

  server/
    actions/          Server Actions (Next.js "use server")
      tasks.ts        CRUD task, duyệt, ghi giờ, xóa, đề xuất xóa/đổi ngày
      projects.ts     CRUD project/catalog-project, batch update/duplicate
      timesheet.ts    Ghi giờ, getTaskWeekEntries
      catalog.ts      CRUD catalog items (CatalogItem)
    data/
      task-lookups.ts getTaskLookups() — dùng chung assign/manage/tasks
    auth/
      config.ts       NextAuth config
      permissions.ts  requireRole(), canAssign(), canManage()
    db/
      client.ts       PrismaClient singleton

  components/
    result-cell.tsx   Cell hiển thị + edit URL kết quả (popup 300px absolute)
    app-shell/        Layout components (sidebar, header, breadcrumbs)

prisma/
  schema.prisma       DB schema (source of truth)
```

---

## Data model chính (schema.prisma)

### Task — công việc

```prisma
model Task {
  id              String    // cuid
  title           String
  plannedStart    DateTime?
  plannedEnd      DateTime?
  actualEnd       DateTime?
  status          TaskStatus  // CHUA_BAT_DAU | DANG_LAM | HOAN_THANH | TAM_DUNG
  priority        Priority?   // THAP | TRUNG_BINH | CAO | KHAN
  projectId       String?     // FK -> Project (hạng mục)
  level3          String?     // tên hạng mục (denormalized, sync khi đổi)
  workGroupId     String?     // FK -> WorkGroup
  phaseId         String?
  disciplineId    String?
  result          String?     // URL kết quả
  note            String?
  approverId      String?     // manager duyệt start
  startApproved   Boolean     @default(false)

  // Đề xuất đổi ngày kết thúc
  pendingPlannedEnd    DateTime?
  endChangeRequesterId String?
  endChangeNote        String?   // Lý do đề xuất dời hạn

  // Đề xuất xóa (khi task đã được duyệt khởi tạo)
  deleteRequestedAt    DateTime?
  deleteRequesterId    String?
  deleteRequestNote    String?   // Lý do đề xuất xóa
}
```

**Luồng duyệt task (startApproval):**
```
User tạo task → approverId set, startApprovedAt=null → badge "Chờ duyệt"
User VẪN có thể ghi giờ khi đang chờ duyệt (đã bỏ lock)
User VẪN có thể sửa plannedStart inline (không cần duyệt)
Manager click ShieldCheck → startApprovedAt=now → task unlocked hoàn toàn
```

**Luồng xóa task:**
```
Chưa duyệt (startApprovedAt null):
  User/Manager click Xóa → confirm → deleteTask() → soft delete ngay

Đã duyệt (startApprovedAt != null):
  User click Xóa → dialog nhập lý do → requestDeleteTask() → set deleteRequestedAt
  Manager thấy badge "Chờ duyệt xóa" + nút ✓/✗ trong cột Clock của /tasks và /manage
  Manager ✓ → approveDeleteTask() → soft delete + notify user
  Manager ✗ → rejectDeleteTask() → xóa request + notify user
  User tự hủy → rejectDeleteTask() → xóa request (không notify)
```

**Luồng đề xuất đổi ngày:**
```
User chọn task → bar → Đề xuất đổi hạn → nhập ngày + lý do → requestEndDateChange()
Manager thấy badge "Xin dời → [ngày]" (tooltip: lý do) + nút ✓/✗
```

### Project — hạng mục dự án

```prisma
model Project {
  id                String
  code              String      // = ProjectGroup.code
  name              String      // tên hạng mục
  groupId           String?     // FK -> ProjectGroup (dự án cha)
  blockSystem       String?     // Khối/Hệ thống (VD: "HA", "I9A")
  constructionTypeId String?    // Loại hình (FK -> ConstructionType)
  startDate         DateTime?   // Ngày bắt đầu
  packagingDate     DateTime?   // Ngày đóng gói/bàn giao  ← mới 2026-06-23
  endDate           DateTime?
  scale             String?     // Quy mô m² sàn
}
```

**Sync ngày:** Khi lưu `startDate`/`packagingDate` cho 1 hạng mục, tự động sync sang tất cả hạng mục cùng `groupId + name` khác `blockSystem` (trong `saveCatalogProject` và `batchUpdateCatalogProjects`).

### CatalogItem — danh mục phân cấp

```prisma
// 5 cấp, phân biệt bởi level + workGroupId
// Level 2 = Loại hình, Level 3 = Hạng mục, Level 5 = Đầu việc
// WorkGroup có abbr="PT" = BIM Tools (phân cấp riêng)
```

---

## Pages chính

### /admin/catalog (catalog-client.tsx)

7 tab master data:
1. **Nhóm công việc** — WorkGroup
2. **Dự án** — Project (Quản lý BIM & Thanh tra BIM)
   - Toggle: **Bảng** (FilterTable với cột Dự án/Loại hình/Hạng mục/Khối/Bắt đầu/Đóng gói/Quy mô)
   - Toggle: **Dự án** (groupedProjectsView — tree 2 cấp: Dự án → Hạng mục → Khối)
   - **Bulk bar:** Đổi Dự án / Loại hình / Hạng mục / Khối / **Bắt đầu** / **Đóng gói** / **Nhân bản** / Xóa
3. **Dự án BIM Tools** — CatalogItem (PT) Level 3, grouped by Level 2
4. **Công việc** — CatalogItem Level 5
5. **Giai đoạn** — Phase
6. **Bộ môn** — Discipline
7. **Loại hình công trình** — ConstructionType

**FilterTable component** (trong catalog-client.tsx):
- Internal scroll: `flex flex-col overflow-hidden` + `maxHeight: calc(100vh - 240px)`
- Header (tiêu đề + buttons + infoBar + filter chips) là `shrink-0` — không scroll
- Table body: `flex-1 overflow-auto` — scroll bên trong card
- `<th>` cells: `sticky top-0 z-20` — ghim trong scroll container

### /tasks (tasks-client.tsx) & /manage (manage-client.tsx)

**Tree grouping 4 cấp:** g1=WorkGroup → g2=Phase → g3=Project(Hạng mục) → g4=BlockSystem

**Tại g3 row (Hạng mục):** Hiển thị `projectStartDate` + `projectPackagingDate` căn thẳng với cột Bắt đầu/Kết thúc bằng `absolute` positioning tính `left` pixel theo `colLeft()`.

**Expand row (/tasks):** Click chevron mở sub-row hiện note + bảng giờ tuần.

**Bar hành động (bottom fixed)** — hiện khi chọn ≥1 task:
- Ghi nhận giờ, Đặt ngày bắt đầu, Đề xuất đổi hạn (có ô lý do cho non-manager)
- Thêm tương tự (chỉ khi chọn 1)
- **Xóa** (chỉ khi chọn 1, user là assignee hoặc manager, task chưa trong hàng chờ xóa)

**Badge "Chờ duyệt xóa"** hiện trong cột Clock khi task có `deleteRequestedAt`:
- Assignee: badge + nút × hủy
- Manager: badge + nút ✓ duyệt / ✗ từ chối

---

## Server Actions quan trọng

### tasks.ts

| Action | Mô tả |
|---|---|
| `deleteTask(id)` | Manager xóa mọi lúc; Assignee chỉ xóa được khi chưa duyệt |
| `requestDeleteTask(id, note)` | Assignee đề xuất xóa task đã duyệt → notify manager |
| `approveDeleteTask(id)` | Manager duyệt → soft delete + notify requester |
| `rejectDeleteTask(id)` | Manager từ chối / User hủy → clear request |
| `requestEndDateChange({ids, plannedEnd, note})` | Đề xuất đổi hạn — có trường lý do |

### projects.ts

| Action | Mô tả |
|---|---|
| `saveCatalogProject(input)` | Lưu hạng mục, sync ngày sang cùng nhóm |
| `batchUpdateCatalogProjects(ids, patch)` | Patch groupId/name/blockSystem/startDate/packagingDate |
| `batchDuplicateCatalogProjects(ids, blockSystem)` | Nhân bản hạng mục với Khối/Hệ thống mới |

---

## Patterns quan trọng

### Server Action

```typescript
"use server";
import { runAction } from "./_helpers";  // wrap try/catch → Result<T>
import { requireRole } from "@/server/auth/permissions";

export async function myAction(input: unknown) {
  return runAction(async () => {
    await requireRole("ADMIN");
    // ... logic
    revalidatePath("/admin/catalog", "layout");
  });
}
// Return type: Promise<Result<T>> = { ok: true, data: T } | { ok: false, error: string }
```

### getTaskLookups()

```typescript
// src/server/data/task-lookups.ts
// Dùng chung cho assign/manage/tasks pages
// Trả về tasks kèm projectStartDate, projectPackagingDate (từ Project đầu tiên cùng groupId+name)
```

### Decimal từ Prisma

```typescript
// hours là Decimal — PHẢI convert
const hours = Number(entry.hours);  // KHÔNG dùng entry.hours trực tiếp
```

---

## Ràng buộc kỹ thuật

| Vấn đề | Quyết định |
|---|---|
| Auth hash | bcryptjs (KHÔNG argon2) |
| DB migrate | `prisma db push` (KHÔNG `migrate dev`) |
| Build | Kill port 3000 → `npm run build` → `npm start` |
| prisma generate | Kill port 3000 trước (DLL lock) |
| DB URL | DATABASE_URL port 6543 (pooling) + DIRECT_URL port 5432 |
| `Decimal` Prisma | Luôn `Number(x)` khi serialize ra JSON |
