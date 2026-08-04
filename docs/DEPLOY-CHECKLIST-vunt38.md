# Checklist: Đưa code nhánh `vunt38` lên Production

> Mục tiêu: tránh các lỗi đã gặp khi merge/deploy code từ nhánh `vunt38`
> (build fail do lockfile, lỗi runtime do schema chưa lên DB, thiếu dữ liệu danh mục).
> Dùng mỗi khi vunt38 báo "đã push commit ... lên nhánh vunt38".

## ⚠️ Quy tắc vàng
1. **KHÔNG `vercel --prod` / KHÔNG deploy thẳng nhánh `vunt38`.** Nhánh này thiếu bản vá
   `pnpm-lock.yaml` (chỉ có trên `dev`/`main`) → luôn fail `pnpm install`
   (`ERR_PNPM_OUTDATED_LOCKFILE`).
2. **Luồng đúng:** `vunt38` → merge vào `dev` → **PR** `dev`→`main` → Vercel **tự** deploy `main`.
   (`main` là protected branch, bắt buộc qua PR.)
3. **3 thứ dễ sót → phải soát TRƯỚC khi deploy:** (A) Schema DB, (B) Dependencies/lockfile, (C) Dữ liệu danh mục.

---

## Các bước

### 1. Lấy commit mới nhất của vunt38
```bash
git fetch origin --prune
git log --oneline origin/vunt38 -5
# Kiểm tra commit đã có trên main chưa — DÙNG EXIT CODE, không dùng if(lệnh) trong PowerShell:
git merge-base --is-ancestor <sha> origin/main; echo $?   # 0 = đã có, 1 = chưa
```

### 2. Soát thay đổi trước khi merge (QUAN TRỌNG NHẤT)

**(A) Schema DB** — nếu đổi sẽ gây lỗi runtime nếu prod DB chưa cập nhật:
```bash
git diff origin/main origin/vunt38 -- prisma/schema.prisma
```
- Nếu **có** thay đổi → phải đẩy schema lên **prod Supabase** trước/cùng lúc deploy:
  `pnpm db:push` (env trỏ `DIRECT_URL` 5432) **hoặc** migration qua Supabase MCP.
- **Luôn VERIFY** cột đã tồn tại trên prod (đừng tin lời "đã push"):
  query `information_schema.columns`.
- Cột **nullable** thêm vào thì an toàn, **không cần redeploy** (code query DB live).

**(B) Dependencies / lockfile** — nếu lệch sẽ fail build Vercel:
```bash
git diff origin/main origin/vunt38 -- package.json pnpm-lock.yaml
```
- Nếu `package.json` đổi mà `pnpm-lock.yaml` **không** đổi tương ứng → chạy `pnpm install`
  để cập nhật `pnpm-lock.yaml` rồi commit.
- ⚠️ vunt38 hay commit `package-lock.json` (npm) — **dự án dùng pnpm**, file đó vô dụng,
  bản lock thật là `pnpm-lock.yaml`.

**(C) Dữ liệu danh mục / seed (data backfill)** — schema mới thường kèm dữ liệu mới:
```bash
git diff origin/main origin/vunt38 --stat   # xem có đụng prisma/seed*, backfill-*, import/ không
```
- Cột quan hệ mới (vd `CatalogItem.parentId` = "Loại hình", `ProjectGroup.workGroupId`)
  thường cần **backfill dữ liệu** trên prod — kiểm tra prod đã có chưa, nếu thiếu thì
  chạy migration/backfill (cột mới mặc định null → màn hình hiện "—").

### 3. Merge vào dev
```bash
git checkout dev && git pull origin dev
git merge origin/vunt38 --no-ff -m "Merge vunt38 (<sha>): <mô tả>"
```

### 4. Push + PR + merge vào main
```bash
git push origin dev
gh pr create --base main --head dev --title "<...>" --body "<...>"
gh pr merge <PR#> --merge --delete-branch=false
```

### 5. Đợi Vercel build & xác nhận
```bash
vercel ls web-qlcv-new            # tìm Production ● Ready mới nhất (auto-deploy từ main)
vercel inspect <url>              # alias phải có web-qlcv-new.vercel.app
```

### 6. Hậu kiểm
- Mở các trang bị ảnh hưởng (vd `/admin/catalog`, `/manage`, `/reports`) trên
  `web-qlcv-new.vercel.app`, Ctrl+F5.
- Nếu lỗi liên quan cột/bảng → quay lại bước 2(A)/2(C), kiểm tra prod DB.

---

## Prompt copy-paste cho phiên sau

> vunt38 vừa push commit mới lên nhánh `vunt38`, cần đưa lên production.
> Làm theo `docs/DEPLOY-CHECKLIST-vunt38.md`:
> 1. Fetch, tìm commit mới nhất của vunt38, xác nhận chưa có trên main.
> 2. Soát kỹ 3 thứ TRƯỚC khi deploy: (A) `prisma/schema.prisma` đổi gì → cần đẩy lên
>    prod DB không; (B) `package.json` vs `pnpm-lock.yaml` có lệch không; (C) có cần
>    backfill dữ liệu danh mục không.
> 3. Báo cho tôi kết quả soát + nếu phải đụng prod DB thì hỏi tôi xác nhận trước.
> 4. Sau khi tôi OK: merge vunt38 → dev → PR → main, đợi Vercel deploy, rồi VERIFY
>    prod DB + alias web-qlcv-new.vercel.app.
> Tuyệt đối KHÔNG deploy thẳng nhánh vunt38.
