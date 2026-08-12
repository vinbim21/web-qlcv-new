# HANDOFF — Tab Smartsheet (đồng bộ dữ liệu Viện Thiết Kế)

_Phiên 2026-08-12. Tính năng **đã code xong và chạy được**, nhưng mới chỉ ở LOCAL:
5 commit trên nhánh `dev`, **chưa push, chưa đụng production**._

> Phần **token / tài khoản Smartsheet** tách riêng ở [HANDOFF-smartsheet-token.md](HANDOFF-smartsheet-token.md)
> — đọc file đó trước khi triển khai, vì nó quyết định job chạy nền ban đêm dùng token của ai.

---

## 1. Trạng thái hiện tại

| | |
|---|---|
| Nhánh | `dev` (local) — hơn `origin/main` và `origin/dev` **đúng 5 commit** |
| Kiểm tra | `pnpm type-check`, `pnpm lint` (các file mới), `pnpm build` — **đều sạch** |
| Dữ liệu | Local DB đã có **56 dòng BIM / 42 sheet / 16 dự án**, đối chiếu bản xuất Excel 11/08: **0 ô lệch** trên 11 cột |
| Production | **Chưa động tới** — chưa push, chưa áp schema, chưa set env |

⚠️ **Nhánh `main` ở máy đang rất cũ** (18/06, PR #6) so với `origin/main` (PR #48). Đừng lấy `main`
local làm mốc so sánh — luôn dùng `origin/main`.

### 5 commit của phiên

| Commit | Nội dung |
|---|---|
| `ff00e3d` | Dựng tab: 3 model DB, client Smartsheet API, server actions, trang + bảng cây, dialog token, xuất Excel |
| `947631a` | Thanh phần trăm khi tải (phương án C) + tách đồng bộ thành 2 bước chuẩn bị/quét lô |
| `3d72554` | Tài liệu handoff phần token/tài khoản |
| `2985fb0` | Bảng: cột link Smartsheet, kéo giãn cột, sắp xếp A-Z/Z-A, lọc theo cột; đổi dãy KPI |
| `68c5de6` | Lọc theo mốc thời gian cho 2 cột ngày (giống phiếu lọc ngày của /manage) |

---

## 2. Tính năng đã có

**Sidebar:** mục **Smartsheet** ngang cấp, ngay sau Timesheet (không phải menu con).

**Đồng bộ thủ công** — nút *Tải từ Smartsheet*, chạy 2 bước:
1. `prepareSmartsheetSync` — tải cây workspace **đúng 1 lần/phiên**, ghi mọi sheet vào sổ
   `SmartsheetSheet`, bật cờ `needsScan` cho sheet cần đọc lại, trả về **tổng số sheet cần quét**
   (mẫu số của thanh phần trăm).
2. `syncSmartsheetBatch` — mỗi lượt lấy 40 sheet đang bật cờ **từ DB** (không tải lại cây), đọc song
   song 5 request, lưu dòng Bộ môn BIM rồi tắt cờ. Client gọi lặp tới khi hết.

**Thanh tiến trình (phương án C):** phần trăm ngay trong nút + thanh chi tiết bên dưới (đậm = đã lưu
xong, mờ = lô đang chạy dở) + thời gian còn lại. ~6 giây đầu chưa biết mẫu số nên chạy vô định kèm
chữ "Đang chuẩn bị…".

**Bảng** (bám sát bảng /manage): cây 3 cấp Dự án → Sheet → Gói thiết kế, thụt dòng, ghim 3 cột trái,
Collapse/Expand thu–xổ từng cấp, pill trạng thái, KPI bấm lọc nhanh, ô tìm kiếm, chip Chủ trì,
**kéo giãn mọi cột** (nhấp đúp đặt lại, nhớ qua localStorage), **sắp xếp A-Z/Z-A**, **lọc theo từng
cột** (chọn-nhiều theo giá trị; cột ngày chọn-một theo mốc thời gian), **cột link mở đúng dòng trên
Smartsheet**, xuất Excel 12 cột.

**Dãy KPI:** Tổng gói thiết kế · Hoàn thành · Sắp đến hạn (≤3 ngày) · Quá hạn.

---

## 3. Quyết định nghiệp vụ đã chốt với anh Toản

1. **Lọc "chứa BIM"**, giữ cả `BIM` (54 dòng) và `P. BIM` (2 dòng) — KHÔNG phải `= BIM`.
   Toàn workspace chỉ tồn tại đúng 2 giá trị này.
2. Chỉ lưu vào DB dòng có Bộ môn chứa BIM (không lưu 48.6k dòng của mọi bộ môn).
3. **Token riêng từng người**, chưa có token thì nút Tải khóa lại. Mọi vai trò xem được tab.
4. Smartsheet là mục **ngang cấp** trong sidebar.
5. Nguồn chỉ có "Xong"/"Quá hạn"/trống → **"Sắp đến hạn" và phần "Quá hạn" còn thiếu được SUY RA từ
   Ngày phát hành PD**. Cột Tình trạng dùng chung quy tắc với KPI để hai chỗ không nói khác nhau;
   tooltip vẫn hiện giá trị gốc. DB **giữ nguyên** giá trị gốc.

---

## 4. BẪY — đừng lặp lại

- **KHÔNG dùng Smartsheet Search API để khoanh vùng sheet.** Search trả tối đa ~100 kết quả nên bỏ
  sót sheet có dòng BIM (đo thực tế: ra 47/56 dòng, thiếu 9). Phải quét cây workspace rồi lọc theo
  `modifiedAt`.
- **Sổ `SmartsheetSheet` phải ghi MỌI sheet đã quét, kể cả sheet 0 dòng BIM**, nếu không lần sau quét
  lại từ đầu.
- **Tách 2 bước KHÔNG làm nhanh hơn** (173 giây so với 172 giây trước đó). Nút thắt là thời gian đọc
  từng sheet + trần ~300 request/phút của Smartsheet (≈5 sheet/giây), không phải việc tải cây. Lợi ích
  thật là có phần trăm chính xác và giảm 22 lần tải cây xuống 1.
- **Đồng bộ "6 giây" chỉ đúng trong cùng ngày.** 716/862 sheet cùng bị đánh dấu sửa lúc 01h sáng do
  Smartsheet tính lại công thức theo ngày ("Số ngày còn lại", "Số ngày chậm") → **sáng nào lần bấm đầu
  tiên cũng mất ~3 phút**. Cách xử lý: quét ngầm ban đêm (xem mục 6).
- **React 19:** không được gọi `e.currentTarget.getBoundingClientRect()` **bên trong hàm cập nhật
  state** — React đã xóa `currentTarget` trước khi hàm đó chạy → crash trắng trang. Phải đo ngay
  trong handler.
- **Sắp xếp trong bảng cây phải áp cho TOÀN BẢNG rồi mới gom nhóm.** Nếu chỉ sắp trong từng sheet thì
  bấm A→Z gần như không thấy gì đổi vì đa số sheet chỉ có 1 dòng.
- **Lint dự án bắt khá gắt** (`react-hooks/purity`, `set-state-in-effect`, `immutability`): không đọc
  `Date.now()` khi render (truyền `todayISO` từ server), không `setState` trong effect (bề rộng cột
  đọc qua `useSyncExternalStore`), không mutate biến ngoài trong `.map()`.
- **Windows:** `prisma generate` báo EPERM nếu dev server đang chạy → phải kill tiến trình giữ cổng
  3000 kèm `/T` rồi mới push/generate.
- Lint toàn repo vốn đã đỏ sẵn (~90 vấn đề trong `src/`) — chỉ lint file mình sửa để đánh giá.

---

## 5. Việc còn lại để lên production

- [ ] **Áp schema additive lên Supabase prod TRƯỚC khi merge** (qua Supabase MCP, đúng quy trình các
      lần đổi schema trước): 3 bảng `SmartsheetRow` / `SmartsheetSheet` / `SmartsheetSyncLog` + cột
      `User.smartsheetToken`.
      Tất cả đều additive, không đụng dữ liệu cũ.
- [ ] Đặt env trên Vercel: **`SMARTSHEET_TOKEN_SECRET`** (đánh dấu Sensitive).
      ⚠️ Không đặt thì rơi về `AUTH_SECRET` — sau này đổi `AUTH_SECRET` là **mọi token đã lưu giải mã
      lỗi**, tất cả người dùng phải nhập lại.
- [ ] Push `dev` → PR vào `main` → Vercel tự deploy prod (KHÔNG `vercel --prod` thủ công).
- [ ] Sau khi lên prod: mỗi người tự nhập token trong dialog "Cấu hình token", rồi bấm Tải lần đầu
      (~3 phút quét 862 sheet).
- [ ] Cập nhật [docs/PROJECT-MAP.md](docs/PROJECT-MAP.md) (CLAUDE.md đã cập nhật rồi).

---

## 6. Hướng làm tiếp (anh Toản đã hỏi, chưa code)

**Quét ngầm ban đêm** để sáng ra dữ liệu tươi sẵn, người dùng bấm tay chỉ mất vài giây:

| Giới hạn Vercel Hobby | Giá trị |
|---|---|
| Số cron job | 100 |
| Tần suất tối thiểu | 1 lần/ngày |
| Độ chính xác giờ | ±59 phút |
| Thời gian tối đa 1 lần chạy | **300 giây** (đủ cho ~700 sheet ≈ 150 giây) |

- Cron của Vercel chạy **theo giờ UTC**: muốn ~3h sáng VN thì đặt `0 20 * * *`. Phải sau mốc 01h VN.
- ⚠️ Cần **xác nhận dự án đã bật fluid compute** mới có 300 giây; dự án cũ có thể vẫn 60 giây → khi đó
  dùng GitHub Actions hoặc pg_cron của Supabase (đều miễn phí, chạy nhiều lần trong đêm được).
- Endpoint cron chỉ cần gọi `prepareSmartsheetSync` rồi lặp `syncSmartsheetBatch` tới khi `done`, kèm
  mốc tự dừng ~4 phút. Bảo vệ bằng `CRON_SECRET`.
- **Vướng mắc phải giải trước:** job không có session đăng nhập nên chưa biết dùng token của ai —
  xem [HANDOFF-smartsheet-token.md](HANDOFF-smartsheet-token.md), khuyến nghị tài khoản dịch vụ riêng.
- Nên hiện trạng thái lần chạy tự động gần nhất trên trang (đọc `SmartsheetSyncLog`), báo đỏ khi lỗi.

---

## 7. Bản đồ file

| File | Vai trò |
|---|---|
| [src/server/smartsheet/client.ts](src/server/smartsheet/client.ts) | Gọi Smartsheet REST API 2.0: cây workspace, tải + parse sheet (match cột **theo tên**), tự retry 429, chạy song song có giới hạn |
| [src/server/smartsheet/crypto.ts](src/server/smartsheet/crypto.ts) | Mã hóa/giải mã token AES-256-GCM |
| [src/server/actions/smartsheet.ts](src/server/actions/smartsheet.ts) | 4 server action: lưu/xóa token, chuẩn bị, quét lô |
| [src/lib/schemas/smartsheet.ts](src/lib/schemas/smartsheet.ts) | Zod schema |
| [src/lib/smartsheet.ts](src/lib/smartsheet.ts) | Hằng số dùng chung server/client (kích thước lô) |
| [src/app/(app)/smartsheet/page.tsx](src/app/(app)/smartsheet/page.tsx) | Server page: đọc DB, ghép link `permalink?rowId=`, truyền `todayISO` |
| [src/app/(app)/smartsheet/smartsheet-client.tsx](src/app/(app)/smartsheet/smartsheet-client.tsx) | Toàn bộ UI (~1380 dòng): KPI, tìm kiếm, bảng cây, sắp xếp/lọc/resize, thanh %, dialog token |
| [src/app/api/export/smartsheet/route.ts](src/app/api/export/smartsheet/route.ts) | Xuất Excel 12 cột |

**Nguồn dữ liệu tham khảo:** `E:\MY WORK\02.VINHOMES\06.Web\connect-smartsheet\BaoCao_VienThietKe\`
(báo cáo + script Python đã crawl toàn bộ workspace ngày 11/08 — dùng để đối chiếu).
Workspace "Viện Thiết Kế" ID `7167964840519556`, 862 sheet, 48.6k dòng.
