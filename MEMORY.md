# MEMORY.md — Quyết định & Kinh nghiệm tích lũy

> Cập nhật: 2026-06-23. Ghi lại các quyết định đã chốt và bài học từ các session trước.

---

## Quy tắc làm việc với Claude Code

### Build workflow
- **LUÔN** kill server trước khi build (DLL lock trên Windows)
- **LUÔN** dùng `npm run build` + `npm start` — KHÔNG dùng `npm run dev`
- User xem kết quả tại http://localhost:3000

### DB migration
- **LUÔN** `prisma db push` — **KHÔNG BAO GIỜ** `prisma migrate dev`
- Sau khi push schema: `npx prisma generate` để regenerate client

### Code style
- Không thêm comment giải thích "WHAT" — chỉ comment "WHY" nếu không rõ ràng
- Không tạo file `.md` trừ khi user yêu cầu tường minh
- Không refactor code không liên quan đến task

---

## Quyết định kiến trúc đã chốt

### Auth
- **bcryptjs** — KHÔNG argon2 (argon2 là native module, lỗi khi deploy Vercel serverless)

### Decimal từ Prisma
- Cột `hours` kiểu `Decimal` → **PHẢI** `Number(e.hours)` khi serialize JSON
- Nếu quên: client nhận `{}` thay vì số → bugs khó trace

### CatalogItem cascade
- Nhóm thường (non-PT): cascade L2→L3 dùng `l3ByL2` (by workGroupId)
- Nhóm PT (BIM Tools): cascade dùng `constructionTypeCode` (projectGroupId-based)

### Task ghi giờ khi pending
- User **CÓ THỂ** ghi giờ dù task đang "Chờ duyệt" — đã bỏ lock `isStartGateLocked`
- Lý do: lock làm phiền workflow thực tế, manager duyệt sau không ảnh hưởng giờ đã ghi

### plannedStart inline edit
- Assignee hoặc manager có thể sửa `plannedStart` trực tiếp (không cần duyệt)
- `plannedEnd` vẫn chỉ manager sửa qua TaskDialog

### packagingDate sync
- Khi sửa `startDate`/`packagingDate` của 1 hạng mục → tự động cập nhật tất cả hạng mục cùng `groupId + name` (khác `blockSystem`)
- Logic trong `saveCatalogProject` (projects.ts)

---

## Bugs đã biết (chưa fix)

### CRITICAL
- **"Cad" & "CAD" trùng lặp** trong CatalogItem PT Level 2 (Loại hình BIM Tools)
  - Cần: chọn tên chuẩn, migrate parentId của Level 3 items, xóa bản trùng

### MINOR (file rác)
- `export-bimtools.mjs`, `BIMTools-export.xlsx`, `BIMTools-catalog.xlsx`
- `CHANGES-2026-06-17.md`, `CHANGES-2026-06-17.patch`
- `local-backup-20260616.sql`
- → Có thể xóa an toàn

---

## DB State quan trọng

```
CatalogItem PT (BIM Tools):
  Level 2 (Loại hình): CAD/Cad (trùng!), Civil3D, Desktop App, NavisWorks, Revit, Web App
  Level 3 (Hạng mục): 127 items — tất cả có parentId (OK)
  Level 5 (Đầu việc): 7 items

Project (Hạng mục): ~128 items (tab Dự án, nhóm Quản lý BIM + Thanh tra BIM)
ProjectGroup (Dự án cha): ~42 items
```

---

## Tính năng chưa implement (backlog)

| Tính năng | Lý do hoãn |
|---|---|
| Request-change workflow cho `plannedEnd` | Phức tạp, bỏ v1 |
| Deploy Supabase + Vercel | Vẫn dev local |
| "Xuất IFC" trong CatalogItem PT | Chưa import từ WM_New |
| Báo cáo nâng cao | Phase sau |
