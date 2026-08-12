# HANDOFF — Tab Smartsheet (đồng bộ dữ liệu Viện Thiết Kế)

_Cập nhật 2026-08-12. Tính năng **ĐÃ LÊN PRODUCTION** (PR #49 merge lúc 07:26 UTC)._

> Phần **token / tài khoản Smartsheet** tách riêng ở [HANDOFF-smartsheet-token.md](HANDOFF-smartsheet-token.md).

---

## 1. Trạng thái

| | |
|---|---|
| Code | Đã merge vào `main` (PR #49) → Vercel tự deploy |
| Schema prod | Đã áp: 3 bảng `SmartsheetRow`/`SmartsheetSheet`/`SmartsheetSyncLog` + cột `User.smartsheetToken`, RLS bật không policy (khớp 13 bảng nghiệp vụ sẵn có) |
| Kiểm tra | `pnpm type-check`, `pnpm lint` (file mới), `pnpm build` — đều sạch |
| Dữ liệu | Đối chiếu bản xuất Excel 11/08: **56 dòng BIM / 42 sheet, 0 ô lệch** trên 11 cột |

⚠️ **Nhánh `main` ở máy rất cũ** (PR #6) so với `origin/main`. Luôn dùng `origin/main` làm mốc.

---

## 2. Tính năng

**Sidebar:** mục **Smartsheet** ngang cấp, ngay sau Timesheet. Mọi vai trò đều thấy và đều bấm Tải được — không có gate theo role ở bất kỳ tầng nào.

**Đồng bộ THỦ CÔNG** — nút *Tải từ Smartsheet*, chạy 2 bước:
1. `prepareSmartsheetSync` — tải cây workspace **đúng 1 lần/phiên**, ghi mọi sheet vào sổ
   `SmartsheetSheet`, bật cờ `needsScan` cho sheet cần đọc lại, trả về **tổng số sheet cần quét**.
2. `syncSmartsheetBatch` — mỗi lượt lấy 40 sheet đang bật cờ **từ DB** (không tải lại cây), đọc song
   song 5 request, lưu dòng Bộ môn BIM rồi tắt cờ. Client gọi lặp tới khi hết.

`assertNoOtherRunning()` chặn 2 phiên chạy song song — người thứ hai nhận lỗi kèm tên người đang
chạy. Phiên mất nhịp tim quá 3 phút coi như đã chết, không khóa nữa.

**Thanh tiến trình:** phần trăm trong nút + thanh chi tiết (đậm = đã lưu, mờ = lô đang chạy) + thời
gian còn lại. ~6 giây đầu chưa biết mẫu số nên chạy vô định kèm chữ "Đang chuẩn bị…".

**Bảng** (bám sát /manage): cây 3 cấp Dự án → Sheet → Gói thiết kế, ghim 3 cột trái, thu–xổ từng cấp,
pill trạng thái, KPI bấm lọc nhanh, ô tìm kiếm, chip Chủ trì, kéo giãn mọi cột (nhấp đúp đặt lại,
nhớ qua localStorage), sắp xếp A-Z/Z-A, lọc theo từng cột (cột ngày chọn-một theo mốc thời gian),
cột link mở đúng dòng trên Smartsheet, xuất Excel 12 cột.

**Dãy KPI:** Tổng gói thiết kế · Hoàn thành · Sắp đến hạn (≤3 ngày) · Quá hạn.

---

## 3. Token — mặc định hệ thống + ghi đè theo người

Thứ tự ưu tiên trong `getTokenOrThrow()` ([smartsheet.ts](src/server/actions/smartsheet.ts)):

```
User.smartsheetToken (DB, mã hóa AES)  →  SMARTSHEET_DEFAULT_TOKEN (env)  →  báo lỗi
```

- **Token mặc định** = token của anh Nam (`v.namnh127@vinhomes.vn`), cất trong env. Ai chưa cấu hình
  gì thì vào là tải được ngay. Token mặc định KHÔNG qua lớp mã hóa AES vì env vốn đã là kho bí mật.
- **Token riêng** ai nhập thì chỉ áp cho tài khoản người đó, lưu vĩnh viễn trong DB, không ảnh hưởng
  người khác. Nút "Xóa token" đổi nghĩa thành **"Quay về token mặc định"**.
- Dialog có băng trạng thái 3 màu: đang dùng token riêng (xanh lá) / token mặc định (xanh dương) /
  chưa có token nào (vàng).

**2 env cần có trên Vercel — KHÁC NHAU, đừng dùng chung một chuỗi:**

| Biến | Giá trị | Vai trò |
|---|---|---|
| `SMARTSHEET_DEFAULT_TOKEN` | Token API Smartsheet thật | Gọi API |
| `SMARTSHEET_TOKEN_SECRET` | Chuỗi ngẫu nhiên ≥32 byte | Khóa AES mã hóa token riêng trong DB |

Lấy token làm luôn khóa mã hóa thì vẫn "chạy" (code băm SHA-256 nên chuỗi nào cũng hợp lệ), nhưng
khi anh Nam đổi token là **mọi token riêng trong DB giải mã lỗi hết**.
Không đặt `SMARTSHEET_TOKEN_SECRET` thì fallback `AUTH_SECRET` — sau này đổi `AUTH_SECRET` cũng hỏng
y hệt.

---

## 4. Quyết định nghiệp vụ đã chốt với anh Toản

1. **Lọc "chứa BIM"**, giữ cả `BIM` (54 dòng) và `P. BIM` (2 dòng) — KHÔNG phải `= BIM`.
   Toàn workspace chỉ tồn tại đúng 2 giá trị này.
2. Chỉ lưu vào DB dòng có Bộ môn chứa BIM (không lưu 48.6k dòng của mọi bộ môn).
3. **Mọi user đều refresh được**, dùng chung token mặc định của anh Nam. Ai muốn chạy dưới danh
   nghĩa mình thì nhập token riêng.
4. Smartsheet là mục **ngang cấp** trong sidebar.
5. Nguồn chỉ có "Xong"/"Quá hạn"/trống → **"Sắp đến hạn" và phần "Quá hạn" còn thiếu được SUY RA từ
   Ngày phát hành PD**. Cột Tình trạng dùng chung quy tắc với KPI. DB **giữ nguyên** giá trị gốc.
6. **CÓ quét ngầm ban đêm** — GitHub Actions 03:00 giờ VN (chốt lại 2026-08-12, sau khi token mặc
   định trong env gỡ được nút thắt "job không có session thì dùng token của ai"). Chọn Actions thay
   vì Vercel Cron vì Hobby chỉ cho 1 cron/ngày, chạy không xong là kẹt tới hôm sau.

---

## 5. BẪY — đừng lặp lại

- **KHÔNG dùng Smartsheet Search API để khoanh vùng sheet.** Search trả tối đa ~100 kết quả nên bỏ
  sót sheet có dòng BIM (đo thực tế: ra 47/56 dòng, thiếu 9). Phải quét cây workspace rồi lọc theo
  `modifiedAt`.
- **Sổ `SmartsheetSheet` phải ghi MỌI sheet đã quét, kể cả sheet 0 dòng BIM**, nếu không lần sau quét
  lại từ đầu.
- **Tách 2 bước KHÔNG làm nhanh hơn** (173s so với 172s). Nút thắt là thời gian đọc từng sheet +
  trần ~300 request/phút của Smartsheet (≈5 sheet/giây). Lợi ích thật là có phần trăm chính xác và
  giảm 22 lần tải cây xuống 1.
- **716/862 sheet cùng bị đánh dấu sửa lúc 01h sáng** do Smartsheet tính lại công thức theo ngày
  ("Số ngày còn lại", "Số ngày chậm") — không phải người sửa. Vì vậy job đêm **phải chạy sau 01h VN**,
  và câu "các lần sau chỉ 6 giây" chỉ đúng **trong cùng ngày**.
- **Cron: `api/cron` phải nằm ngoài matcher của [src/proxy.ts](src/proxy.ts)** — không thì NextAuth
  đá về `/login` và job im lặng không chạy. Đã vá.
- **Chỉ gọi `runPrepare` khi hết sạch cờ `needsScan`.** Hàm đó tải lại cây workspace VÀ reset toàn bộ
  cờ; gọi giữa chừng là mất tiến độ, lượt sau làm lại từ đầu, không bao giờ xong.
- **React 19:** không được gọi `e.currentTarget.getBoundingClientRect()` **bên trong hàm cập nhật
  state** — React đã xóa `currentTarget` trước khi hàm đó chạy → crash trắng trang. Phải đo ngay
  trong handler.
- **Sắp xếp trong bảng cây phải áp cho TOÀN BẢNG rồi mới gom nhóm.** Nếu chỉ sắp trong từng sheet thì
  bấm A→Z gần như không thấy gì đổi vì đa số sheet chỉ có 1 dòng.
- **Lint dự án bắt khá gắt** (`react-hooks/purity`, `set-state-in-effect`, `immutability`): không đọc
  `Date.now()` khi render (truyền `todayISO` từ server), không `setState` trong effect (bề rộng cột
  đọc qua `useSyncExternalStore`), không mutate biến ngoài trong `.map()`.
- **Windows:** `prisma generate` báo EPERM nếu dev server đang chạy. Nhưng nếu client đã generate sẵn
  và schema không đổi thì **chạy thẳng `tsc`/`next build` được**, không cần tắt dev server.
- Lint toàn repo vốn đã đỏ sẵn (~90 vấn đề trong `src/`) — chỉ lint file mình sửa để đánh giá.
- **Push repo này cần tài khoản `vinbim21`** — máy có 2 tài khoản gh, GCM hay phục vụ `toanlh34` →
  403. Xem memory `git-auth-hai-tai-khoan-gh`.

---

## 6. Bản đồ file

| File | Vai trò |
|---|---|
| [src/server/smartsheet/client.ts](src/server/smartsheet/client.ts) | Gọi Smartsheet REST API 2.0: cây workspace, tải + parse sheet (match cột **theo tên**), tự retry 429, chạy song song có giới hạn |
| [src/server/smartsheet/crypto.ts](src/server/smartsheet/crypto.ts) | Mã hóa/giải mã token AES-256-GCM |
| [src/server/actions/smartsheet.ts](src/server/actions/smartsheet.ts) | 4 server action: lưu/xóa token, chuẩn bị, quét lô + `getTokenOrThrow` (thứ tự ưu tiên token) |
| [src/lib/schemas/smartsheet.ts](src/lib/schemas/smartsheet.ts) | Zod schema |
| [src/lib/smartsheet.ts](src/lib/smartsheet.ts) | Hằng số dùng chung server/client (kích thước lô) |
| [src/app/(app)/smartsheet/page.tsx](src/app/(app)/smartsheet/page.tsx) | Server page: đọc DB, ghép link `permalink?rowId=`, truyền `todayISO` + 2 cờ token |
| [src/app/(app)/smartsheet/smartsheet-client.tsx](src/app/(app)/smartsheet/smartsheet-client.tsx) | Toàn bộ UI (~1400 dòng): KPI, tìm kiếm, bảng cây, sắp xếp/lọc/resize, thanh %, dialog token |
| [src/app/api/export/smartsheet/route.ts](src/app/api/export/smartsheet/route.ts) | Xuất Excel 12 cột |

**Nguồn dữ liệu tham khảo:** `E:\MY WORK\02.VINHOMES\06.Web\connect-smartsheet\BaoCao_VienThietKe\`
(báo cáo + script Python đã crawl toàn bộ workspace ngày 11/08 — dùng để đối chiếu).
Workspace "Viện Thiết Kế" ID `7167964840519556`, 862 sheet, 48.6k dòng, 102 folder.
