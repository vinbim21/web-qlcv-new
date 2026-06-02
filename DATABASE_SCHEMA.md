# Sơ đồ Database — Web QLCV phòng BIM

> Thiết kế dựa trên file `WM_New.xlsx` (cách phòng đang quản lý bằng Excel).
> Nền tảng: **Supabase (PostgreSQL)**. Xem preview Mermaid bằng cách mở file này → nút Preview của VSCode.

---

## 1. Sơ đồ quan hệ (ERD)

```mermaid
erDiagram
    NHAN_SU ||--o{ CONG_VIEC_NHAN_SU : "được giao"
    CONG_VIEC ||--o{ CONG_VIEC_NHAN_SU : "có người làm"
    CONG_VIEC ||--o{ NHAT_KY : "ghi nhận"
    NHAN_SU  ||--o{ NHAT_KY : "log giờ"

    NHOM_CONG_VIEC ||--o{ CONG_VIEC : "phân loại (Level 1)"
    BO_MON         ||--o{ CONG_VIEC : "bộ môn (Level 4)"
    DU_AN          ||--o{ CONG_VIEC : "thuộc dự án"
    GIAI_DOAN      ||--o{ CONG_VIEC : "giai đoạn"
    BO_MON         ||--o{ NHAN_SU   : "thuộc tổ"

    NHAN_SU {
        uuid     id PK
        text     ho_ten
        text     email
        uuid     bo_mon_id FK
        text     chuc_vu
        boolean  dang_lam_viec
    }

    NHOM_CONG_VIEC {
        int   id PK
        text  ten "6 nhóm: HTTC, Đào tạo, Quản lý, Thanh tra, BIM Tools, QL phần mềm"
        int   thu_tu
    }

    BO_MON {
        int   id PK
        text  ma  "BIM, KT, KC, MEPF, HT, IT, DI, DN..."
        text  ten
    }

    DU_AN {
        int   id PK
        text  ma  "vd: B.DSHNQN.DMF"
        text  ten "vd: Bãi đỗ tàu Cổ Loa"
        numeric dien_tich_san
    }

    GIAI_DOAN {
        int   id PK
        text  ten "Concept, TKCS, FEED, TKKT, TKBVTC, Thi công, Hoàn công, Vận hành"
        int   thu_tu
    }

    CONG_VIEC {
        uuid    id PK
        text    sum_id  "vd: 3.B.DSHNQN.DMF.101"
        text    sub_id
        int     nhom_cv_id FK
        text    level_2 "Hạng mục"
        text    level_3 "Chi tiết / tên hạng mục"
        text    level_5 "Đầu việc cụ thể"
        uuid    bo_mon_id FK
        int     du_an_id FK
        int     giai_doan_id FK
        text    muc_do_uu_tien "Cao / Trung bình / Thấp"
        text    trang_thai "Chưa làm / Đang làm / Hoàn thành / Tạm dừng"
        date    ngay_bat_dau
        date    ngay_ket_thuc
        date    ngay_hoan_thanh_tt
    }

    CONG_VIEC_NHAN_SU {
        uuid  id PK
        uuid  cong_viec_id FK
        uuid  nhan_su_id FK
        int   vai_tro "1=chính, 2/3=phối hợp"
    }

    NHAT_KY {
        uuid    id PK
        uuid    cong_viec_id FK
        uuid    nhan_su_id FK
        date    ngay
        text    noi_dung
        numeric so_gio "Thời gian (h)"
    }
```

---

## 2. Giải thích ánh xạ từ Excel → Database

| Trong Excel | Trong Database |
|---|---|
| Sheet **Data** (danh mục) | Các bảng tra cứu: `NHOM_CONG_VIEC`, `BO_MON`, `DU_AN`, `GIAI_DOAN` |
| **Bảng 1–7** (giao việc) | Bảng `CONG_VIEC` + `CONG_VIEC_NHAN_SU` |
| Cột "Nhân sự thực hiện 01/02/03" | `CONG_VIEC_NHAN_SU` (quan hệ nhiều-nhiều, `vai_tro` 1/2/3) |
| Sheet **XD / MEPF / IT** (log ngày) | Bảng `NHAT_KY` (mỗi dòng = 1 người + 1 việc + 1 ngày + số giờ) |
| **Report 1–4** (tổng hợp) | **Không cần bảng riêng** → dùng VIEW/query tự tính |

### Vì sao thiết kế thế này
- **Level 1 / 4 / Dự án / Giai đoạn** = giá trị lặp lại nhiều → tách thành bảng tra cứu (tránh gõ tay sai như `4..003` trong Excel).
- **Level 2 / 3 / 5** = mô tả chi tiết, ít chuẩn hóa → để dạng text trong `CONG_VIEC` cho linh hoạt.
- **Nhân sự ↔ Công việc** là nhiều-nhiều (1 việc nhiều người, 1 người nhiều việc) → bảng nối `CONG_VIEC_NHAN_SU`.
- **Timesheet ngày** tách riêng (`NHAT_KY`) thay vì trải cột theo ngày như Excel → dễ tổng hợp, không giới hạn số ngày.

---

## 3. Report tự động (thay cho sheet Report 1–4)

Các báo cáo sẽ là **truy vấn**, không lưu trữ:

- **Report 1/2** — Thống kê theo nhóm: `COUNT` công việc theo `nhom_cv_id` × `trang_thai` (+ đếm quá hạn = `ngay_ket_thuc < today AND trang_thai != 'Hoàn thành'`).
- **Report 3** — Theo nhân sự: join `CONG_VIEC_NHAN_SU`, group theo `nhan_su_id`.
- **Report 4** — Định mức: `SUM(so_gio)` từ `NHAT_KY` group theo nhân sự × loại đầu việc.

---

## 4. Trạng thái triển khai
- [x] Phân tích nghiệp vụ từ Excel
- [x] Thiết kế ERD
- [ ] Chọn frontend (Next.js / React / HTML thuần)
- [ ] Tạo bảng trên Supabase (SQL migration)
- [ ] Dựng giao diện + deploy Vercel
