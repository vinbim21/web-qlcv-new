// Endpoint đồng bộ Smartsheet chạy ngầm — không có session đăng nhập.
//
// Dùng token MẶC ĐỊNH trong env (`SMARTSHEET_DEFAULT_TOKEN`) nên chạy được lúc 3h sáng khi không ai
// đăng nhập. Bảo vệ bằng `CRON_SECRET` vì mỗi lượt gọi có thể nện Smartsheet vài phút.
//
// Gọi LẶP tới khi nhận `done: true` — mỗi lượt tự dừng trước mốc ngân sách để không chạm trần thời
// gian của serverless. Tiến độ nằm ở cờ `SmartsheetSheet.needsScan` trong DB nên dừng giữa chừng
// (kể cả bị nền tảng giết) vẫn quét tiếp được ở lượt sau.

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { findLiveRunningLog, runBatch, runPrepare } from "@/server/smartsheet/sync-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Giữ ở 60s cho chắc — gói Vercel chưa xác nhận có fluid compute (300s) hay không. Không sao:
// bộ kích hoạt gọi lặp nên tổng thời gian không bị chặn bởi con số này.
export const maxDuration = 60;

/** Nhãn người chạy trong `SmartsheetSyncLog` — để phân biệt với người bấm tay. */
const CRON_ACTOR = "Tự động (cron)";
/** Tự dừng trước trần 60s, chừa chỗ cho lô đang chạy dở kịp ghi DB. */
const BUDGET_MS = Number(process.env.SMARTSHEET_CRON_BUDGET_MS ?? 45_000);

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/** So sánh chống dò theo thời gian phản hồi. */
function secretMatches(header: string | null, secret: string): boolean {
  const got = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const started = Date.now();

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Thiếu CRON_SECRET trong env" },
      { status: 500 },
    );
  }
  if (!secretMatches(req.headers.get("authorization"), secret)) return unauthorized();

  const token = process.env.SMARTSHEET_DEFAULT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Thiếu SMARTSHEET_DEFAULT_TOKEN trong env" },
      { status: 500 },
    );
  }

  try {
    // ---- Chọn phiên: nối tiếp chỗ dở hay mở phiên mới ----
    // CHỈ gọi runPrepare khi KHÔNG còn sheet nào chờ quét. runPrepare tải lại cây workspace và
    // RESET toàn bộ cờ needsScan — gọi giữa chừng là mất tiến độ, lượt sau lại làm lại từ đầu,
    // không bao giờ xong.
    const live = await findLiveRunningLog();
    const pending = await prisma.smartsheetSheet.count({ where: { needsScan: true } });

    let logId: string;
    let mode: "prepare" | "resume";

    if (live) {
      // Người dùng đang bấm Tải → nhường, để không tranh khóa và không đốt hạn mức API.
      if (live.userName !== CRON_ACTOR) {
        return NextResponse.json(
          { ok: false, busy: true, error: `Đang có phiên đồng bộ của ${live.userName ?? "?"}` },
          { status: 409 },
        );
      }
      // Phiên cron của chính mình ở lượt gọi trước — nối tiếp.
      if (pending === 0) {
        return NextResponse.json({ ok: true, mode: "noop", done: true, elapsedMs: Date.now() - started });
      }
      logId = live.id;
      mode = "resume";
    } else if (pending > 0) {
      // Phiên trước đứt hẳn (log hết nhịp tim) nhưng còn cờ tồn đọng → mở log mới, quét tiếp.
      const log = await prisma.smartsheetSyncLog.create({
        data: { userId: null, userName: CRON_ACTOR, status: "RUNNING" },
      });
      logId = log.id;
      mode = "resume";
    } else {
      const prep = await runPrepare({ token, actorId: null, actorName: CRON_ACTOR });
      // Không có sheet nào đổi → runPrepare đã tự đóng log OK, khỏi quét.
      if (prep.total === 0) {
        return NextResponse.json({
          ok: true, mode: "prepare", done: true, processed: 0, remaining: 0,
          totalRows: prep.totalRows, workspaceSheets: prep.workspaceSheets,
          logId: prep.logId, elapsedMs: Date.now() - started,
        });
      }
      logId = prep.logId;
      mode = "prepare";
    }

    // ---- Quét từng lô tới khi xong hoặc hết ngân sách thời gian ----
    const deadline = started + BUDGET_MS;
    let processed = 0;
    let remaining = pending;
    let totalRows = 0;
    let done = false;

    do {
      const r = await runBatch({ token, logId });
      processed += r.processed;
      remaining = r.remaining;
      totalRows = r.totalRows;
      if (r.done) {
        done = true;
        break;
      }
    } while (Date.now() < deadline);

    return NextResponse.json({
      ok: true, mode, done, processed, remaining, totalRows, logId,
      elapsedMs: Date.now() - started,
    });
  } catch (e) {
    // runBatch đã tự ghi status ERROR + nội dung lỗi vào SmartsheetSyncLog trước khi ném.
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        elapsedMs: Date.now() - started,
      },
      { status: 500 },
    );
  }
}
