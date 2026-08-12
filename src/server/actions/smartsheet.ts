"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireUser } from "@/server/auth/permissions";
import { encryptToken, decryptToken } from "@/server/smartsheet/crypto";
import {
  fetchSheetBimRows,
  getWorkspaceSheetMap,
  mapWithConcurrency,
  validateToken,
} from "@/server/smartsheet/client";
import {
  smartsheetBatchSchema,
  smartsheetPrepareSchema,
  smartsheetTokenSchema,
} from "@/lib/schemas/smartsheet";
import { SMARTSHEET_BATCH_SIZE } from "@/lib/smartsheet";
import { runAction } from "./_helpers";

// Số sheet quét mỗi lượt gọi — giữ mỗi lượt < ~30s để né timeout serverless (Vercel ~60s).
const BATCH_SIZE = SMARTSHEET_BATCH_SIZE;
// Số request Smartsheet chạy song song (giới hạn nguồn ~300 request/phút).
const CONCURRENCY = 5;
// Phiên RUNNING không có nhịp tim mới hơn ngưỡng này coi như đã chết → không khóa nữa.
const STALE_LOCK_MS = 3 * 60 * 1000;

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
  const own = dbUser.smartsheetToken ? decryptToken(dbUser.smartsheetToken) : null;
  const token = own ?? process.env.SMARTSHEET_DEFAULT_TOKEN ?? null;
  if (!token) {
    throw new Error("Chưa có token Smartsheet — bấm 'Cấu hình token' để nhập");
  }
  return { token, fullName: dbUser.fullName };
}

/** Chặn 2 phiên chạy song song (phiên mất nhịp tim = crash/timeout thì bỏ qua). */
async function assertNoOtherRunning(exceptLogId?: string) {
  const running = await prisma.smartsheetSyncLog.findFirst({
    where: {
      status: "RUNNING",
      updatedAt: { gte: new Date(Date.now() - STALE_LOCK_MS) },
      ...(exceptLogId ? { id: { not: exceptLogId } } : {}),
    },
  });
  if (running) {
    throw new Error(
      `Đang có phiên đồng bộ khác chạy (${running.userName ?? "?"}) — thử lại sau ít phút`,
    );
  }
}

export type SyncPrepareResult = {
  logId: string;
  /** Tổng số sheet phải quét trong phiên này = mẫu số của thanh phần trăm. */
  total: number;
  /** Tổng số sheet của workspace (để hiện "trong tổng N sheet"). */
  workspaceSheets: number;
  /** Số dòng BIM đang có trong DB trước khi quét. */
  totalRows: number;
};

export async function prepareSmartsheetSync(input: unknown) {
  return runAction(async (): Promise<SyncPrepareResult> => {
    const user = await requireUser();
    const { full } = smartsheetPrepareSchema.parse(input ?? {});
    const { token, fullName } = await getTokenOrThrow(user.id);
    await assertNoOtherRunning();

    const [tree, known] = await Promise.all([
      getWorkspaceSheetMap(token),
      prisma.smartsheetSheet.findMany(),
    ]);
    const knownById = new Map(known.map((s) => [s.sheetId, s]));

    // Sheet đã bị xóa khỏi workspace → dọn cả dòng lẫn sổ theo dõi.
    const goneIds = known.filter((s) => !tree.has(s.sheetId)).map((s) => s.sheetId);
    if (goneIds.length) {
      await prisma.$transaction([
        prisma.smartsheetRow.deleteMany({ where: { sheetId: { in: goneIds } } }),
        prisma.smartsheetSheet.deleteMany({ where: { sheetId: { in: goneIds } } }),
      ]);
    }

    // Sheet mới (chưa có trong sổ) → tạo với cờ needsScan bật sẵn.
    const fresh = [...tree.values()].filter((s) => !knownById.has(s.sheetId));
    if (fresh.length) {
      await prisma.smartsheetSheet.createMany({
        data: fresh.map((s) => ({
          sheetId: s.sheetId,
          name: s.name,
          folderName: s.folderName,
          permalink: s.permalink,
          needsScan: true,
        })),
        skipDuplicates: true,
      });
    }

    // Sheet đã biết: bật cờ nếu chưa từng quét, hoặc nguồn có sửa đổi mới hơn lần quét trước.
    const staleIds = known
      .filter((s) => {
        if (goneIds.includes(s.sheetId)) return false;
        if (full || !s.lastSourceModifiedAt) return true;
        const mod = tree.get(s.sheetId)?.modifiedAt;
        return !!mod && mod.getTime() > s.lastSourceModifiedAt.getTime();
      })
      .map((s) => s.sheetId);
    if (staleIds.length) {
      await prisma.smartsheetSheet.updateMany({
        where: { sheetId: { in: staleIds } },
        data: { needsScan: true },
      });
    }
    // Sheet đã quét xong và không đổi → tắt cờ (dọn cờ thừa của phiên trước bị đứt).
    const cleanIds = known
      .filter((s) => !goneIds.includes(s.sheetId) && !staleIds.includes(s.sheetId))
      .map((s) => s.sheetId);
    if (cleanIds.length) {
      await prisma.smartsheetSheet.updateMany({
        where: { sheetId: { in: cleanIds } },
        data: { needsScan: false },
      });
    }

    const [total, totalRows] = await Promise.all([
      prisma.smartsheetSheet.count({ where: { needsScan: true } }),
      prisma.smartsheetRow.count(),
    ]);

    const log = await prisma.smartsheetSyncLog.create({
      data: { userId: user.id, userName: fullName, status: "RUNNING" },
    });

    // Không có sheet nào cần quét → đóng phiên luôn, client hiện "đã là mới nhất".
    if (total === 0) {
      await prisma.smartsheetSyncLog.update({
        where: { id: log.id },
        data: { status: "OK", finishedAt: new Date(), rowCount: totalRows },
      });
    }

    return { logId: log.id, total, workspaceSheets: tree.size, totalRows };
  });
}

export type SyncBatchResult = {
  done: boolean;
  /** Số sheet đã quét trong lượt này. */
  processed: number;
  /** Số sheet còn chờ quét sau lượt này. */
  remaining: number;
  /** Tổng dòng BIM hiện có trong DB. */
  totalRows: number;
};

export async function syncSmartsheetBatch(input: unknown) {
  return runAction(async (): Promise<SyncBatchResult> => {
    const user = await requireUser();
    const { logId } = smartsheetBatchSchema.parse(input);
    const { token } = await getTokenOrThrow(user.id);
    await assertNoOtherRunning(logId);

    try {
      const batch = await prisma.smartsheetSheet.findMany({
        where: { needsScan: true },
        orderBy: { folderName: "asc" },
        take: BATCH_SIZE,
        select: { sheetId: true, folderName: true },
      });

      const folderById = new Map(batch.map((s) => [s.sheetId, s.folderName]));
      const fetched = await mapWithConcurrency(batch, CONCURRENCY, (s) =>
        fetchSheetBimRows(token, s.sheetId),
      );

      for (const sheet of fetched) {
        const folderName = folderById.get(sheet.sheetId) ?? "(Ngoài folder)";
        await prisma.$transaction([
          prisma.smartsheetRow.deleteMany({ where: { sheetId: sheet.sheetId } }),
          ...(sheet.bimRows.length
            ? [
                prisma.smartsheetRow.createMany({
                  data: sheet.bimRows.map((r) => ({
                    sheetId: sheet.sheetId,
                    rowId: r.rowId,
                    rowNumber: r.rowNumber,
                    folderName,
                    sheetName: sheet.name,
                    maGoi: r.maGoi,
                    hoSo: r.hoSo,
                    boMon: r.boMon,
                    batDau: r.batDau,
                    phatHanhPD: r.phatHanhPD,
                    tinhTrang: r.tinhTrang,
                    chuTri: r.chuTri,
                    cbth1: r.cbth1,
                    cbth2: r.cbth2,
                    ghiChu: r.ghiChu,
                  })),
                }),
              ]
            : []),
          prisma.smartsheetSheet.update({
            where: { sheetId: sheet.sheetId },
            data: {
              name: sheet.name,
              permalink: sheet.permalink,
              lastSourceModifiedAt: sheet.modifiedAt,
              lastSyncedAt: new Date(),
              bimRowCount: sheet.bimRows.length,
              needsScan: false,
            },
          }),
        ]);
      }

      const [remaining, totalRows] = await Promise.all([
        prisma.smartsheetSheet.count({ where: { needsScan: true } }),
        prisma.smartsheetRow.count(),
      ]);
      const done = remaining === 0;

      // Mỗi lô ghi log → updatedAt tự cập nhật = nhịp tim giữ khóa phiên.
      await prisma.smartsheetSyncLog.update({
        where: { id: logId },
        data: {
          sheetCount: { increment: fetched.length },
          rowCount: totalRows,
          ...(done ? { status: "OK", finishedAt: new Date() } : {}),
        },
      });

      if (done) revalidatePath("/smartsheet");
      return { done, processed: fetched.length, remaining, totalRows };
    } catch (e) {
      await prisma.smartsheetSyncLog
        .update({
          where: { id: logId },
          data: {
            status: "ERROR",
            finishedAt: new Date(),
            error: e instanceof Error ? e.message : String(e),
          },
        })
        .catch(() => {});
      throw e;
    }
  });
}
