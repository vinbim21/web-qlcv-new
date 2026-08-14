// Lõi đồng bộ Smartsheet — KHÔNG phụ thuộc session đăng nhập.
//
// Tách khỏi `src/server/actions/smartsheet.ts` vì file đó có `"use server"`: mọi export ở đấy đều
// thành Server Action gọi được từ trình duyệt. Nếu để `runPrepare`/`runBatch` ở đó thì client tự
// gọi được kèm token tùy ý — hở bảo mật. File này không có `"use server"` nên chỉ code phía server
// import được.
//
// Hai nơi dùng chung lõi này:
//   - Server Action (người dùng bấm Tải)  → truyền token của user / token mặc định
//   - Route cron (job chạy đêm)           → truyền thẳng SMARTSHEET_DEFAULT_TOKEN

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import {
  SMARTSHEET_BATCH_SIZE,
  type SyncBatchResult,
  type SyncPrepareResult,
} from "@/lib/smartsheet";
import { fetchSheetBimRows, getWorkspaceSheetMap, mapWithConcurrency } from "./client";

// Số sheet quét mỗi lượt gọi — giữ mỗi lượt < ~30s để né timeout serverless.
export const BATCH_SIZE = SMARTSHEET_BATCH_SIZE;
// Số request Smartsheet chạy song song (giới hạn nguồn ~300 request/phút).
export const CONCURRENCY = 5;
// Phiên RUNNING không có nhịp tim mới hơn ngưỡng này coi như đã chết → không khóa nữa.
export const STALE_LOCK_MS = 3 * 60 * 1000;

/** Chặn 2 phiên chạy song song (phiên mất nhịp tim = crash/timeout thì bỏ qua). */
export async function assertNoOtherRunning(exceptLogId?: string) {
  const running = await findLiveRunningLog(exceptLogId);
  if (running) {
    throw new Error(
      `Đang có phiên đồng bộ khác chạy (${running.userName ?? "?"}) — thử lại sau ít phút`,
    );
  }
}

/** Phiên RUNNING còn nhịp tim (chưa quá STALE_LOCK_MS). Route cron dùng để biết có nên nhường không. */
export async function findLiveRunningLog(exceptLogId?: string) {
  return prisma.smartsheetSyncLog.findFirst({
    where: {
      status: "RUNNING",
      updatedAt: { gte: new Date(Date.now() - STALE_LOCK_MS) },
      ...(exceptLogId ? { id: { not: exceptLogId } } : {}),
    },
  });
}

/**
 * Bước 1: tải cây workspace ĐÚNG 1 LẦN, đồng bộ sổ `SmartsheetSheet`, bật cờ `needsScan` cho sheet
 * cần đọc lại, mở một phiên log RUNNING và trả tổng số sheet phải quét.
 *
 * ⚠️ Hàm này RESET toàn bộ cờ `needsScan` (tắt cờ ở sheet không đổi). Đang quét dở mà gọi lại là
 * mất tiến độ và quay vòng vô tận — muốn chạy tiếp phiên dở thì gọi thẳng `runBatch` với logId cũ.
 */
export async function runPrepare(opts: {
  token: string;
  actorId: string | null;
  actorName: string;
  full?: boolean;
}): Promise<SyncPrepareResult> {
  const { token, actorId, actorName, full = false } = opts;
  await assertNoOtherRunning();

  // Mở log NGAY, TRƯỚC khi làm việc nặng. Trước đây log tạo ở bước cuối nên mọi lỗi trong lúc
  // chuẩn bị (token hỏng, API 401/403, tải cây workspace fail) KHÔNG để lại vết nào trong DB —
  // người dùng thấy toast đỏ còn người soi DB thì thấy sạch bong. Đã mất một lượt chẩn đoán vì
  // chuyện này (12/08), phải mò log Vercel mới ra.
  const log = await prisma.smartsheetSyncLog.create({
    data: { userId: actorId, userName: actorName, status: "RUNNING" },
  });

  try {
    return await prepareInner();
  } catch (e) {
    await prisma.smartsheetSyncLog
      .update({
        where: { id: log.id },
        data: {
          status: "ERROR",
          finishedAt: new Date(),
          error: e instanceof Error ? e.message : String(e),
        },
      })
      .catch(() => {});
    throw e;
  }

  async function prepareInner(): Promise<SyncPrepareResult> {
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

  // Không có sheet nào cần quét → đóng phiên luôn, client hiện "đã là mới nhất".
  if (total === 0) {
    await prisma.smartsheetSyncLog.update({
      where: { id: log.id },
      data: { status: "OK", finishedAt: new Date(), rowCount: totalRows },
    });
  }

  return { logId: log.id, total, workspaceSheets: tree.size, totalRows };
  }
}

/**
 * Bước 2: quét BATCH_SIZE sheet đang bật cờ, lưu dòng Bộ môn BIM rồi tắt cờ.
 * Gọi lặp tới khi `done`. KHÔNG tải lại cây workspace nên rẻ hơn `runPrepare` nhiều.
 */
export async function runBatch(opts: { token: string; logId: string }): Promise<SyncBatchResult> {
  const { token, logId } = opts;
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
}
