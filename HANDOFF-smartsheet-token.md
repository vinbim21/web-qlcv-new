# HANDOFF — Token & tài khoản Smartsheet (cho tab /smartsheet)

_Phiên 2026-08-12. Tab Smartsheet đã code xong (commit `ff00e3d`, `947631a` trên nhánh `dev`, mới ở LOCAL).
File này chốt riêng phần **token / tài khoản** — thứ duy nhất còn chưa quyết trước khi đưa lên production
và trước khi làm được tính năng quét ngầm ban đêm._

---

## ⚠️ VIỆC CẦN BIẾT NGAY

**Token đang dùng KHÔNG phải "chìa khóa chỉ đọc" — nó là danh tính đầy đủ của một nhân sự.**

Gọi `GET /users/me` bằng token trong `../connect-smartsheet/BaoCao_VienThietKe/scripts/download_sheets.py`:

| Trường | Giá trị |
|---|---|
| Tài khoản | **v.namnh127@vinhomes.vn** — Nam Nguyễn Hải |
| Tổ chức | VinHomes JSC |
| `admin` | false |
| `licensedSheetCreator` | **true** |

Trên workspace "Viện Thiết Kế" (ID `7167964840519556`) anh Nam chỉ được share quyền **Viewer**, nên tab
Smartsheet chỉ đọc được — đúng như thiết kế. Nhưng trong phạm vi tài khoản riêng của anh ấy, token
**tạo / sửa / xóa sheet được**.

> **Sự cố đã xảy ra trong phiên này (ghi lại để ai soi log Smartsheet không hoang mang):**
> lúc kiểm tra quyền, đã gọi `POST /sheets` với dự đoán bị từ chối — **nhưng nó chạy thật**, tạo ra sheet
> `__test_quyen_ghi__` (id `7632326853873540`) trong tài khoản anh Nam. Đã `DELETE` ngay, kiểm chứng lại
> trả `404` và không còn trong danh sách sheet. Có thể còn nằm trong "Deleted Items" của Smartsheet vài
> ngày trước khi tự xóa hẳn. **Bài học: không thử lệnh ghi lên hệ thống thật.**

---

## 1. Kiến trúc token hiện tại trong code (đã chạy)

Mô hình đã chốt với anh Toản: **mỗi người dùng một token riêng**.

| Thành phần | Chỗ nằm |
|---|---|
| Nơi lưu | `User.smartsheetToken` (nullable) |
| Mã hóa | AES-256-GCM, chuỗi `iv.tag.cipher` base64 — [crypto.ts](src/server/smartsheet/crypto.ts) |
| Khóa mã hóa | env `SMARTSHEET_TOKEN_SECRET`, **không có thì fallback `AUTH_SECRET`** |
| Nhập/xóa token | Dialog "Cấu hình token" trên `/smartsheet`; lưu là gọi `GET /users/me` xác thực trước |
| Ai bấm Tải được | Bất kỳ ai đã cấu hình token hợp lệ (mọi vai trò đều xem được tab) |

⚠️ **Bẫy:** nếu chưa đặt `SMARTSHEET_TOKEN_SECRET` mà sau này đổi `AUTH_SECRET` thì **mọi token đã lưu
giải mã lỗi**, tất cả người dùng phải nhập lại. → Nên đặt `SMARTSHEET_TOKEN_SECRET` riêng ngay từ đầu
trên Vercel (Production + Preview).

---

## 2. Vấn đề cần giải: quét ngầm ban đêm không có ai đăng nhập

Lý do cần quét đêm — đo được trong phiên này:

- Workspace có **862 sheet**. Quét toàn bộ mất **~173 giây** (trần cứng do Smartsheet giới hạn
  ~300 request/phút = 5 sheet/giây, code tối ưu mấy cũng không nhanh hơn).
- **716/862 sheet cùng bị đánh dấu sửa lúc 01h sáng (giờ VN)** — cùng một mốc giờ ⇒ là Smartsheet tính
  lại công thức theo ngày (các cột "Số ngày còn lại", "Số ngày chậm" phụ thuộc ngày hiện tại), **không
  phải người sửa**.
- Hệ quả: **sáng nào lần bấm đầu tiên cũng phải quét lại ~700 sheet ≈ 3 phút**; chỉ các lần bấm sau
  trong cùng ngày mới nhanh (~6 giây). Câu "các lần sau chỉ 6 giây" chỉ đúng trong ngày.

Quét đêm xong thì sáng ra dữ liệu đã tươi, người dùng bấm tay chỉ mất vài giây.

**Nhưng job chạy lúc 3h sáng không có session đăng nhập ⇒ không biết lấy token của ai.** Đó chính là
câu hỏi tài khoản cần chốt.

---

## 3. Ba hướng cho token phía server (chọn 1)

### 🟢 Hướng A — Tài khoản dịch vụ riêng (KHUYẾN NGHỊ)

Nhờ admin Smartsheet của VinHomes tạo tài khoản kiểu `bim-sync@vinhomes.vn`, share workspace
"Viện Thiết Kế" quyền **Viewer**, sinh token từ tài khoản đó → cất vào env Vercel.

- ✅ Không phụ thuộc ai nghỉ việc / đổi vai trò.
- ✅ Quyền tối thiểu (chỉ xem) — không tạo/xóa sheet được như token hiện tại.
- ✅ Thu hồi hoặc xoay vòng token không ảnh hưởng công việc của ai.
- ❓ **Cần hỏi admin về license**: tài khoản chỉ-xem thường không tốn license nhưng còn tùy hợp đồng
  VinHomes JSC.

### 🟡 Hướng B — Dùng token cá nhân của một người, cất trong env

Nhanh nhất, không cần xin ai. Đổi lại nhận đủ 4 rủi ro ở mục 4.
Nếu chọn hướng này thì **phải** hiện cảnh báo trên trang khi lần chạy tự động gần nhất lỗi
(bảng `SmartsheetSyncLog` đã có cột `status` + `error`, chỉ cần đọc ra).

### 🔴 Hướng C — OAuth

Đúng bài cho nhiều người dùng, nhưng access token hết hạn sau 7 ngày, phải dựng luồng refresh.
Quá nặng so với nhu cầu (1 job đọc dữ liệu mỗi đêm). **Không khuyến nghị.**

---

## 4. Bốn đường làm token chết (phải lường trước)

1. **Người sở hữu nghỉ việc / tài khoản bị khóa** → token ngừng hoạt động.
2. **Người sở hữu tự thu hồi hoặc sinh lại token** → hỏng.
3. **Admin Smartsheet bật bắt token hết hạn** (tính năng Enterprise, Admin Center → Security & Control).
   Điểm nguy hiểm: **thời hạn tính từ ngày TẠO token, không phải từ ngày bật** → token cũ có thể hết hạn
   gần như ngay. Email báo trước 7 ngày gửi cho **người sở hữu token**, không phải cho hệ thống mình.
4. **Rò rỉ** → ai đọc được env/file đều hành động dưới danh nghĩa người đó (kể cả ghi, như sự cố ở trên).

Mã lỗi tương ứng đã xử lý sẵn trong [client.ts](src/server/smartsheet/client.ts):
`401` → "Token không hợp lệ hoặc đã bị thu hồi", `403` → "Token không có quyền truy cập workspace".

---

## 5. Việc cần làm (checklist)

- [ ] **Chốt hướng A hay B** cho token chạy nền.
- [ ] Nếu hướng A: xin admin Smartsheet tạo tài khoản dịch vụ + share workspace quyền Viewer.
- [ ] Đặt env trên Vercel (Production): `SMARTSHEET_TOKEN_SECRET` (khóa mã hóa) và token chạy nền.
      Đánh dấu **Sensitive** — lưu ý env Sensitive của Vercel **không đọc lại được**, phải cất bản sao
      ở nơi quản lý mật khẩu.
- [ ] **Thu hồi token đang nằm chữ thường** trong `../connect-smartsheet/BaoCao_VienThietKe/scripts/download_sheets.py`
      nếu thư mục đó từng được chia sẻ hay đẩy lên kho mã nào; nhờ anh Nam sinh token mới.
- [ ] Làm endpoint cron + bảo vệ bằng `CRON_SECRET` (Vercel tự gửi header `Authorization: Bearer $CRON_SECRET`).
- [ ] Hiện trạng thái lần chạy tự động gần nhất trên `/smartsheet` (đọc `SmartsheetSyncLog`), báo đỏ khi lỗi.

---

## 6. Ghi chú hạ tầng cho việc quét đêm (đã tra tài liệu Vercel 2026-08-12)

| Giới hạn gói **Hobby** | Giá trị | Đủ chưa |
|---|---|---|
| Số cron job / project | 100 | Thừa (cần 1) |
| Tần suất tối thiểu | **1 lần/ngày** | Đủ |
| Độ chính xác giờ | **±59 phút** | Chấp nhận được lúc 3h sáng |
| Thời gian tối đa 1 lần chạy | **300 giây** (mặc định & tối đa, kèm fluid compute) | Đủ cho ~700 sheet (~150s) |

- **Cron của Vercel chạy theo giờ UTC.** Muốn ~3h sáng VN thì đặt `0 20 * * *` (20:00 UTC hôm trước).
  Phải sau mốc 01h VN — lúc Smartsheet tính lại công thức.
- ⚠️ **Cần xác nhận dự án đã bật fluid compute** mới có 300 giây; dự án tạo lâu rồi có thể vẫn ở mức cũ
  60 giây. Nếu chỉ 60 giây → 1 lần chạy chỉ quét được ~250 sheet, mà Hobby lại chỉ cho 1 lần/ngày ⇒ phải
  chuyển sang **GitHub Actions** hoặc **pg_cron của Supabase** (đều miễn phí, chạy nhiều lần trong đêm được).
- Code đã sẵn sàng chia lô: [smartsheet.ts](src/server/actions/smartsheet.ts) có `prepareSmartsheetSync`
  (tải cây workspace 1 lần, bật cờ `SmartsheetSheet.needsScan`, trả tổng số sheet cần quét) và
  `syncSmartsheetBatch` (quét 40 sheet/lượt). Endpoint cron chỉ cần gọi prepare rồi lặp batch cho tới
  khi `done`, kèm một mốc thời gian tự dừng (~4 phút) để không chạm trần 300 giây.

---

## 7. Tham chiếu nhanh

- Bản đồ tính năng: mục "Tab Smartsheet" trong [CLAUDE.md](CLAUDE.md).
- Nguồn dữ liệu gốc + script Python: `E:\MY WORK\02.VINHOMES\06.Web\connect-smartsheet\BaoCao_VienThietKe\`
- Workspace "Viện Thiết Kế" ID `7167964840519556` — 862 sheet, 48.6k dòng, **56 dòng có Bộ môn chứa "BIM"**
  (54 dòng `BIM` + 2 dòng `P. BIM`, nằm trong 42 sheet). Anh Toản đã chốt: **giữ cả hai**, tức lọc theo
  "chứa BIM" chứ không phải "= BIM".
- Đã đối chiếu với bản xuất Excel ngày 11/08: **56/56 dòng, 0 ô lệch** trên 11 cột.
