# HANDOFF — Token & tài khoản Smartsheet (cho tab /smartsheet)

_Cập nhật 2026-08-12. Phương án token **đã chốt và đã code**: token mặc định cấp hệ thống,
cho phép ghi đè theo từng người._

---

## ⚠️ VIỆC CẦN BIẾT NGAY

**Token đang dùng KHÔNG phải "chìa khóa chỉ đọc" — nó là danh tính đầy đủ của một nhân sự.**

Gọi `GET /users/me` bằng token đang đặt làm mặc định:

| Trường | Giá trị |
|---|---|
| Tài khoản | **v.namnh127@vinhomes.vn** — Nam Nguyễn Hải |
| Tổ chức | VinHomes JSC |
| `admin` | false |
| `licensedSheetCreator` | **true** |

Trên workspace "Viện Thiết Kế" (ID `7167964840519556`) anh Nam chỉ được share quyền **VIEWER**
(đã kiểm chứng lại 12/08: đọc được workspace, 102 folder), nên tab Smartsheet chỉ đọc được — đúng
như thiết kế. Nhưng trong phạm vi tài khoản riêng của anh ấy, token **tạo / sửa / xóa sheet được**.

> **Sự cố đã xảy ra (ghi lại để ai soi log Smartsheet không hoang mang):** lúc kiểm tra quyền, đã gọi
> `POST /sheets` với dự đoán bị từ chối — **nhưng nó chạy thật**, tạo ra sheet `__test_quyen_ghi__`
> (id `7632326853873540`) trong tài khoản anh Nam. Đã `DELETE` ngay, kiểm chứng lại trả `404`.
> **Bài học: không thử lệnh ghi lên hệ thống thật.**

---

## 1. Phương án đã chốt

**Token mặc định cấp hệ thống + ghi đè theo người** (chốt với anh Toản 2026-08-12).

| Thành phần | Chỗ nằm |
|---|---|
| Token mặc định | env `SMARTSHEET_DEFAULT_TOKEN` (token của anh Nam) — dùng chung cho mọi người |
| Token riêng | `User.smartsheetToken` (nullable), mã hóa AES-256-GCM chuỗi `iv.tag.cipher` base64 |
| Khóa mã hóa | env `SMARTSHEET_TOKEN_SECRET`, **không có thì fallback `AUTH_SECRET`** |
| Nhập/xóa token riêng | Dialog "Token Smartsheet" trên `/smartsheet`; lưu là gọi `GET /users/me` xác thực trước |
| Ai bấm Tải được | **Bất kỳ ai đã đăng nhập**, mọi vai trò — không có gate theo role ở tầng nào |

Thứ tự ưu tiên trong `getTokenOrThrow()`:

```
User.smartsheetToken (DB, giải mã AES)  →  SMARTSHEET_DEFAULT_TOKEN (env)  →  báo lỗi
```

Token riêng ai nhập chỉ áp cho tài khoản người đó, lưu vĩnh viễn, không đụng người khác.
Nút "Xóa token" đổi nghĩa thành **"Quay về token mặc định"** khi hệ thống có mặc định.

⚠️ **Hai biến env phải là HAI chuỗi khác nhau.** Lấy token API làm luôn khóa mã hóa thì vẫn "chạy"
(code băm SHA-256 nên chuỗi nào cũng ra khóa hợp lệ), nhưng khi anh Nam đổi token là **mọi token
riêng trong DB giải mã lỗi hết**. Tương tự, chưa đặt `SMARTSHEET_TOKEN_SECRET` mà sau này đổi
`AUTH_SECRET` cũng hỏng y hệt.

---

## 2. Vì sao chọn hướng này (thay vì tài khoản dịch vụ)

Bản trước khuyến nghị xin tài khoản dịch vụ `bim-sync@vinhomes.vn` quyền Viewer. Anh Toản chọn
**dùng tạm token cá nhân của anh Nam** để chạy được ngay, không phải chờ admin Smartsheet.

Đây là đánh đổi có ý thức — nhận 4 rủi ro ở mục 3. Khi ổn định thì vẫn nên chuyển sang tài khoản
dịch vụ: chỉ cần đổi giá trị env `SMARTSHEET_DEFAULT_TOKEN`, **không phải sửa dòng code nào**.

---

## 3. Bốn đường làm token chết (phải lường trước)

1. **Anh Nam nghỉ việc / tài khoản bị khóa** → token ngừng hoạt động. Vì đây là token mặc định dùng
   chung nên **cả phòng mất đồng bộ**, không riêng anh ấy.
2. **Anh Nam tự thu hồi hoặc sinh lại token** → hỏng, hệ quả như trên.
3. **Admin Smartsheet bật bắt token hết hạn** (tính năng Enterprise, Admin Center → Security &
   Control). Điểm nguy hiểm: **thời hạn tính từ ngày TẠO token, không phải từ ngày bật** → token cũ
   có thể hết hạn gần như ngay. Email báo trước 7 ngày gửi cho **người sở hữu token**.
4. **Rò rỉ** → ai đọc được env đều hành động dưới danh nghĩa anh Nam (kể cả ghi, như sự cố ở trên).

Mã lỗi tương ứng đã xử lý sẵn trong [client.ts](src/server/smartsheet/client.ts):
`401` → "Token không hợp lệ hoặc đã bị thu hồi", `403` → "Token không có quyền truy cập workspace".

**Truy vết:** `SmartsheetSyncLog` lưu `userId` + `userName` nên bên mình vẫn biết chính xác ai bấm
đồng bộ. Chỉ log phía Smartsheet là hiện tên anh Nam cho mọi lượt.

---

## 4. Việc còn lại

- [ ] Đặt 2 env trên Vercel (Production): `SMARTSHEET_DEFAULT_TOKEN` và `SMARTSHEET_TOKEN_SECRET`.
      Vercel **mặc định đánh dấu Sensitive** cho Production/Preview — lưu ý env Sensitive
      **không đọc lại được**, phải cất bản sao ở nơi quản lý mật khẩu.
- [ ] **Thu hồi token đang nằm chữ thường** trong
      `../connect-smartsheet/BaoCao_VienThietKe/scripts/download_sheets.py` nếu thư mục đó từng được
      chia sẻ hay đẩy lên kho mã nào; nhờ anh Nam sinh token mới.
- [ ] (Lâu dài) Xin admin Smartsheet tạo tài khoản dịch vụ chỉ-xem, thay giá trị env — không sửa code.

**Quét ngầm ban đêm — ĐÃ LÀM** (chốt lại 2026-08-12). Chính token mặc định trong env đã gỡ nút thắt
"job 3h sáng không có session thì dùng token của ai".

- Endpoint: `GET /api/cron/smartsheet`, đọc thẳng `SMARTSHEET_DEFAULT_TOKEN`, bảo vệ bằng `CRON_SECRET`
- Kích hoạt: GitHub Actions `0 20 * * *` UTC = **03:00 giờ VN** (phải sau mốc 01h)
- Nếu token của anh Nam chết thì job hỏng → trang `/smartsheet` **hiện băng đỏ** đọc từ
  `SmartsheetSyncLog` (chỉ báo khi lần lỗi mới hơn lần thành công gần nhất)

---

## 5. Tham chiếu nhanh

- Bản đồ tính năng: [HANDOFF-smartsheet-tab.md](HANDOFF-smartsheet-tab.md) và mục "Tab Smartsheet"
  trong [CLAUDE.md](CLAUDE.md).
- Nguồn dữ liệu gốc + script Python: `E:\MY WORK\02.VINHOMES\06.Web\connect-smartsheet\BaoCao_VienThietKe\`
- Workspace "Viện Thiết Kế" ID `7167964840519556` — 862 sheet, 102 folder, 48.6k dòng,
  **56 dòng có Bộ môn chứa "BIM"** (54 dòng `BIM` + 2 dòng `P. BIM`, nằm trong 42 sheet).
  Anh Toản đã chốt: **giữ cả hai**, tức lọc "chứa BIM" chứ không phải "= BIM".
- Đã đối chiếu với bản xuất Excel ngày 11/08: **56/56 dòng, 0 ô lệch** trên 11 cột.
