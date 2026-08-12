import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";
import { SmartsheetClient } from "./smartsheet-client";

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function SmartsheetPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [rows, sheets, lastOk, me] = await Promise.all([
    prisma.smartsheetRow.findMany({
      orderBy: [{ folderName: "asc" }, { sheetName: "asc" }, { rowNumber: "asc" }],
    }),
    prisma.smartsheetSheet.findMany({ select: { sheetId: true, permalink: true } }),
    prisma.smartsheetSyncLog.findFirst({
      where: { status: "OK" },
      orderBy: { finishedAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { smartsheetToken: true },
    }),
  ]);

  // Link mở ĐÚNG DÒNG trên Smartsheet: permalink của sheet + ?rowId=...
  // (định dạng do chính API trả về khi gọi include=rowPermalink, nên ghép được từ dữ liệu đã lưu).
  const permalinkBySheet = new Map(sheets.map((s) => [s.sheetId, s.permalink]));

  return (
    <SmartsheetClient
      hasToken={!!me?.smartsheetToken}
      // Truyền ngày từ server để client không phải đọc đồng hồ lúc render.
      todayISO={new Date().toISOString().slice(0, 10)}
      lastSync={
        lastOk?.finishedAt
          ? {
              at: lastOk.finishedAt.toISOString(),
              userName: lastOk.userName,
              sheetCount: lastOk.sheetCount,
              rowCount: lastOk.rowCount,
            }
          : null
      }
      rows={rows.map((r) => {
        const base = permalinkBySheet.get(r.sheetId) ?? null;
        return {
          id: r.id,
          folderName: r.folderName,
          sheetName: r.sheetName,
          maGoi: r.maGoi,
          hoSo: r.hoSo,
          boMon: r.boMon,
          batDau: fmtDate(r.batDau),
          phatHanhPD: fmtDate(r.phatHanhPD),
          tinhTrang: r.tinhTrang,
          chuTri: r.chuTri,
          cbth1: r.cbth1,
          cbth2: r.cbth2,
          ghiChu: r.ghiChu,
          link: base ? `${base}?rowId=${r.rowId}` : null,
        };
      })}
    />
  );
}
