"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireUser } from "@/server/auth/permissions";
import { encryptToken, decryptToken } from "@/server/smartsheet/crypto";
import { validateToken } from "@/server/smartsheet/client";
import {
  type SyncBatchResult,
  type SyncPrepareResult,
  runBatch,
  runPrepare,
} from "@/server/smartsheet/sync-core";
import {
  smartsheetBatchSchema,
  smartsheetPrepareSchema,
  smartsheetTokenSchema,
} from "@/lib/schemas/smartsheet";
import { runAction } from "./_helpers";

// ---------- Token cá nhân ----------

/** Lưu token Smartsheet của CHÍNH user hiện tại (validate với API trước khi lưu). */
export async function saveSmartsheetToken(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { token } = smartsheetTokenSchema.parse(input);
    const email = await validateToken(token); // ném lỗi nếu token sai/không có quyền
    await prisma.user.update({
      where: { id: user.id },
      data: { smartsheetToken: encryptToken(token) },
    });
    revalidatePath("/smartsheet");
    return { email };
  });
}

/** Xóa token đã lưu của user hiện tại. */
export async function clearSmartsheetToken() {
  return runAction(async () => {
    const user = await requireUser();
    await prisma.user.update({ where: { id: user.id }, data: { smartsheetToken: null } });
    revalidatePath("/smartsheet");
  });
}

// ---------- Đồng bộ (2 bước: chuẩn bị → quét từng lô) ----------

/**
 * Đồng bộ chạy 2 bước để hiện được PHẦN TRĂM thật và không lãng phí request:
 *
 *   B1 `prepareSmartsheetSync` — tải cây workspace ĐÚNG 1 LẦN cho cả phiên, ghi mọi sheet vào sổ
 *      `SmartsheetSheet`, bật cờ `needsScan` cho sheet cần đọc lại, trả về TỔNG số sheet phải quét.
 *   B2 `syncSmartsheetBatch` — lặp tới khi done: mỗi lượt lấy BATCH_SIZE sheet đang bật cờ từ DB,
 *      đọc song song CONCURRENCY request, lưu dòng Bộ môn BIM rồi tắt cờ.
 *
 * Vì bước 2 KHÔNG tải lại cây workspace (~6 giây/lượt) nên lần quét đầu ~862 sheet nhanh gần gấp
 * đôi so với cách gộp 1 bước, và client biết mẫu số ngay từ giây thứ ~6 để vẽ thanh phần trăm.
 *
 * KHÔNG dùng Search API để khoanh vùng: search giới hạn ~100 kết quả nên bỏ sót sheet có dòng BIM.
 */

/**
 * Token dùng để gọi Smartsheet, theo thứ tự ưu tiên:
 *   1. Token RIÊNG của người dùng (`User.smartsheetToken`, mã hóa trong DB) — chỉ áp cho chính họ.
 *   2. Token MẶC ĐỊNH của hệ thống (`SMARTSHEET_DEFAULT_TOKEN` trong env) — dùng chung cho mọi
 *      người chưa cấu hình gì, để vào là tải được ngay.
 * Token mặc định nằm trong env nên KHÔNG qua lớp mã hóa AES (env vốn đã là kho bí mật);
 * `SMARTSHEET_TOKEN_SECRET` chỉ dùng cho token riêng lưu ở DB.
 */
async function getTokenOrThrow(userId: string) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { smartsheetToken: true, fullName: true },
  });
  if (!dbUser) throw new Error("Không tìm thấy tài khoản");

  // Token riêng có thể thành RÁC nếu khóa mã hóa đã đổi kể từ lúc lưu (thêm SMARTSHEET_TOKEN_SECRET
  // khi trước đó fallback AUTH_SECRET, hoặc xoay vòng một trong hai). Khi đó decrypt ném
  // "Unsupported state or unable to authenticate data" — KHÔNG được để lỗi đó nổi lên làm chết
  // nút Tải. Coi như chưa có token riêng, tự dọn bản ghi rác, rồi rơi về token mặc định.
  let own: string | null = null;
  if (dbUser.smartsheetToken) {
    try {
      own = decryptToken(dbUser.smartsheetToken);
    } catch {
      await prisma.user.update({ where: { id: userId }, data: { smartsheetToken: null } });
    }
  }

  const token = own ?? process.env.SMARTSHEET_DEFAULT_TOKEN ?? null;
  if (!token) {
    throw new Error("Chưa có token Smartsheet — bấm 'Cấu hình token' để nhập");
  }
  return { token, fullName: dbUser.fullName };
}

// ---------- Đồng bộ (2 bước: chuẩn bị → quét từng lô) ----------
// Lõi thật nằm ở `@/server/smartsheet/sync-core` (không phụ thuộc session) để route cron dùng chung.
// Hai action dưới đây chỉ làm đúng một việc: lấy session + token rồi ủy quyền cho lõi.

export type { SyncPrepareResult, SyncBatchResult };

export async function prepareSmartsheetSync(input: unknown) {
  return runAction(async (): Promise<SyncPrepareResult> => {
    const user = await requireUser();
    const { full } = smartsheetPrepareSchema.parse(input ?? {});
    const { token, fullName } = await getTokenOrThrow(user.id);
    return runPrepare({ token, actorId: user.id, actorName: fullName, full });
  });
}

export async function syncSmartsheetBatch(input: unknown) {
  return runAction(async (): Promise<SyncBatchResult> => {
    const user = await requireUser();
    const { logId } = smartsheetBatchSchema.parse(input);
    const { token } = await getTokenOrThrow(user.id);
    return runBatch({ token, logId });
  });
}
