import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";
import { SmartsheetClient } from "./smartsheet-client";

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function SmartsheetPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [rows, lastOk, me] = await Promise.all([
    prisma.smartsheetRow.findMany({
      orderBy: [{ folderName: "asc" }, { sheetName: "asc" }, { rowNumber: "asc" }],
    }),
    prisma.smartsheetSyncLog.findFirst({
      where: { status: "OK" },
      orderBy: { finishedAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { smartsheetToken: true },
    }),
  ]);

  return (
    <SmartsheetClient
      hasToken={!!me?.smartsheetToken}
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
      rows={rows.map((r) => ({
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
      }))}
    />
  );
}
