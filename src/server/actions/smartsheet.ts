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
import { smartsheetSyncSchema, smartsheetTokenSchema } from "@/lib/schemas/smartsheet";
import { runAction } from "./_helpers";

// Số sheet tải mỗi lượt gọi — giữ mỗi lượt < ~30s để né timeout serverless (Vercel ~60s).
const BATCH_SIZE = 40;
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

// ---------- Đồng bộ ----------

export type SyncBatchResult = {
  logId: string;
  done: boolean;
  /** Số sheet đã xử lý trong lượt này. */
  processed: number;
  /** Số sheet còn chờ ở các lượt sau. */
  remaining: number;
  /** Tổng dòng BIM hiện có trong DB sau lượt này. */
  totalRows: number;
};

/**
 * Đồng bộ theo LÔ (client gọi lặp tới khi done=true):
 * 1. Cây workspace (1 request) → tên/folder/modifiedAt của MỌI sheet.
 * 2. Sheet cần tải = chưa từng quét, hoặc modifiedAt mới hơn lần quét trước (full=true → tải lại hết).
 * 3. Mỗi lượt tải tối đa BATCH_SIZE sheet (song song CONCURRENCY request), lưu dòng Bộ môn BIM,
 *    ghi sổ theo dõi cho MỌI sheet đã quét (kể cả sheet 0 dòng BIM) để lượt sau không quét lại.
 *
 * Lần đầu quét hết ~860 sheet (vài phút, có thanh tiến trình); các lần sau chỉ vài sheet có sửa đổi.
 * KHÔNG dùng Search API để khoanh vùng: search giới hạn ~100 kết quả nên bỏ sót sheet có dòng BIM.
 */
export async function syncSmartsheet(input: unknown) {
  return runAction(async (): Promise<SyncBatchResult> => {
    const user = await requireUser();
    const data = smartsheetSyncSchema.parse(input ?? {});

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { smartsheetToken: true, fullName: true },
    });
    if (!dbUser?.smartsheetToken) {
      throw new Error("Bạn chưa cấu hình token Smartsheet — bấm 'Cấu hình token' để nhập");
    }
    const token = decryptToken(dbUser.smartsheetToken);

    // Khóa chống 2 phiên chạy song song (bỏ qua phiên RUNNING mất nhịp tim = crash/timeout).
    const running = await prisma.smartsheetSyncLog.findFirst({
      where: {
        status: "RUNNING",
        updatedAt: { gte: new Date(Date.now() - STALE_LOCK_MS) },
        ...(data.logId ? { id: { not: data.logId } } : {}),
      },
    });
    if (running) {
      throw new Error(`Đang có phiên đồng bộ khác chạy (${running.userName ?? "?"}) — thử lại sau ít phút`);
    }

    // Lượt đầu: tạo log RUNNING.
    let logId = data.logId ?? null;
    if (!logId) {
      const log = await prisma.smartsheetSyncLog.create({
        data: { userId: user.id, userName: dbUser.fullName, status: "RUNNING" },
      });
      logId = log.id;
    }

    try {
      // --- Khám phá: mọi sheet trong workspace + sổ theo dõi ---
      const [tree, knownSheets] = await Promise.all([
        getWorkspaceSheetMap(token),
        prisma.smartsheetSheet.findMany(),
      ]);
      const knownById = new Map(knownSheets.map((s) => [s.sheetId, s]));

      // Dọn sheet đã bị xóa khỏi workspace (chỉ làm ở lượt đầu cho nhẹ).
      if (!data.logId) {
        const goneIds = knownSheets.filter((s) => !tree.has(s.sheetId)).map((s) => s.sheetId);
        if (goneIds.length) {
          await prisma.$transaction([
            prisma.smartsheetRow.deleteMany({ where: { sheetId: { in: goneIds } } }),
            prisma.smartsheetSheet.deleteMany({ where: { sheetId: { in: goneIds } } }),
          ]);
        }
      }

      // Sheet cần quét = chưa từng quét, hoặc nguồn có sửa đổi mới hơn lần quét trước.
      const stale = [...tree.keys()].filter((id) => {
        if (data.full) return true;
        const known = knownById.get(id);
        if (!known?.lastSourceModifiedAt) return true;
        const treeMod = tree.get(id)?.modifiedAt;
        return !!treeMod && treeMod.getTime() > known.lastSourceModifiedAt.getTime();
      });

      // --- Tải 1 lô: fetch song song, ghi DB tuần tự ---
      const batch = stale.slice(0, BATCH_SIZE);
      const fetchedSheets = await mapWithConcurrency(batch, CONCURRENCY, (sheetId) =>
        fetchSheetBimRows(token, sheetId),
      );

      for (const fetched of fetchedSheets) {
        const info = tree.get(fetched.sheetId)!;
        const sheetMeta = {
          name: fetched.name,
          folderName: info.folderName,
          permalink: fetched.permalink,
          lastSourceModifiedAt: fetched.modifiedAt ?? info.modifiedAt,
          lastSyncedAt: new Date(),
          bimRowCount: fetched.bimRows.length,
        };
        await prisma.$transaction([
          prisma.smartsheetRow.deleteMany({ where: { sheetId: fetched.sheetId } }),
          ...(fetched.bimRows.length
            ? [
                prisma.smartsheetRow.createMany({
                  data: fetched.bimRows.map((r) => ({
                    sheetId: fetched.sheetId,
                    rowId: r.rowId,
                    rowNumber: r.rowNumber,
                    folderName: info.folderName,
                    sheetName: fetched.name,
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
          prisma.smartsheetSheet.upsert({
            where: { sheetId: fetched.sheetId },
            create: { sheetId: fetched.sheetId, ...sheetMeta },
            update: sheetMeta,
          }),
        ]);
      }

      const processed = fetchedSheets.length;
      const done = stale.length <= batch.length;
      const totalRows = await prisma.smartsheetRow.count();
      // Mỗi lô ghi DB → updatedAt của log tự cập nhật = nhịp tim giữ khóa.
      await prisma.smartsheetSyncLog.update({
        where: { id: logId },
        data: {
          sheetCount: { increment: processed },
          rowCount: totalRows,
          ...(done ? { status: "OK", finishedAt: new Date() } : {}),
        },
      });

      if (done) revalidatePath("/smartsheet");
      return {
        logId,
        done,
        processed,
        remaining: Math.max(0, stale.length - batch.length),
        totalRows,
      };
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
