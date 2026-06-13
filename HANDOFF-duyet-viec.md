# HANDOFF — Tính năng Duyệt việc + sửa UI bảng /manage

_Phiên 2026-06-08. Tiếp tục tối nay._

## ⏳ BƯỚC CÒN LẠI (làm đầu tiên khi quay lại)

`prisma generate` đang **lỗi EPERM** vì dev server `npm run dev` đang giữ file engine. Phải:

```powershell
# 1. Tắt dev server (Ctrl+C ở terminal npm run dev)
npx prisma generate
npm run dev
```

Chưa generate xong thì app **chưa nhận field mới** (approvedAt/approvedById) → nút Duyệt sẽ lỗi runtime. Đây là việc bắt buộc trước khi test.

## ✅ ĐÃ XONG trong phiên này

### A. Sửa cột "Thực tế ht" (ngày hoàn thành) bị che + UI
File: `src/app/(app)/manage/manage-client.tsx`
- localStorage width key `v2 → v3` (xoá width cũ hẹp gây cắt chữ).
- Sàn riêng cột ngày `MANAGE_COL_MIN_W = { actualEnd: 120 }`; `clampManageW(n, key?)` dùng sàn riêng.
- Default `actualEnd: 130`; input `px-2` + icon lịch `mr-15`.

### B. Cuộn ngang + chiều cao bảng
- `src/components/ui/table.tsx`: `Table` thêm prop `wrapperClassName`.
- Bảng /manage: `wrapperClassName="max-h-[calc(100svh-80px)] overflow-auto rounded-lg border"` (khung cuộn duy nhất, cao sát đáy màn hình).
- `TableHeader` dính: `sticky top-0 z-10 bg-background`.
- Root div: `pb-24 → pb-4`.

### C. Tính năng DUYỆT VIỆC (Approve)
Quy tắc đã chốt: **canManage (ADMIN + LEVEL_1)** duyệt; **chỉ duyệt việc đã hoàn thành**; **lưu approvedById**.

- `prisma/schema.prisma`: Task thêm `approvedAt DateTime?`, `approvedById String?`, quan hệ `approvedBy User? @relation("TaskApprover")`; User thêm `approvedTasks Task[] @relation("TaskApprover")`.
- `src/lib/schemas/task.ts`: `taskApprovalSchema { id, approved }`.
- `src/server/actions/tasks.ts`: `setTaskApproval` — chỉ canManage, chặn duyệt việc chưa hoàn thành, set approvedAt/approvedById = now/user (hoặc null khi bỏ duyệt).
- `src/app/(app)/manage/page.tsx`: include `approvedBy {fullName}`, serialize `approved`, `approvedByName`.
- `manage-client.tsx`:
  - TaskRow type thêm `approved`, `approvedByName`.
  - import `CheckCircle2`, `setTaskApproval`; handler `toggleApprove`.
  - Cột Thao tác: nút ✔ Duyệt (xanh khi đã duyệt, disable nếu chưa hoàn thành & chưa duyệt). `MANAGE_ACT_PX 96 → 132`.
  - Ô Trạng thái: bố cục **2 hàng dọc** — hàng 1 badge trạng thái + nút Pause; hàng 2 badge **Đã duyệt/Chưa duyệt**.

### D. Database — CHỈ LOCAL DOCKER (qlcv-db), CHƯA đụng Supabase prod
- `prisma db push` lên local: cột approvedAt/approvedById đã có (đã verify).
- Backfill: `prisma/import/backfill-task-approval.sql` đã chạy local → **673/673 việc** đánh dấu đã duyệt, người duyệt = Quản trị viên (ADMIN).

## 🚀 KHI DEPLOY PROD (chưa làm — theo quy trình repo)
1. Tạm đổi `DATABASE_URL`/`DIRECT_URL` trong `.env` sang Supabase.
2. `npx prisma db push` (thêm cột approvedAt/approvedById).
3. Chạy `prisma/import/backfill-task-approval.sql` trên Supabase (psql DIRECT_URL hoặc Supabase MCP execute_sql).
4. Trả `.env` về Docker local.
5. Push code → Vercel deploy.

## ⚠️ Lưu ý / điểm có thể chỉnh tối nay
- Backfill phạm vi **tất cả việc** (kể cả chưa hoàn thành) → có việc "đã duyệt nhưng chưa hoàn thành". Nếu bỏ duyệt 1 việc chưa xong thì server chặn duyệt lại (rule chỉ-duyệt-việc-hoàn-thành). Cân nhắc nới rule nếu thấy vướng.
- Các con số UI dễ tinh chỉnh: chiều cao bảng `80px`, default cột ngày `130`, `MANAGE_ACT_PX 132`, icon `mr-15`.
- Có thể bổ sung sau: filter "Chưa duyệt", duyệt hàng loạt (bulk), cột/sort theo trạng thái duyệt.

## Chưa commit
Tất cả thay đổi đang ở working tree (branch `dev`), chưa commit.
