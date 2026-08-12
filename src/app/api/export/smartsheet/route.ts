import ExcelJS from "exceljs";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";

export const runtime = "nodejs";

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const rows = await prisma.smartsheetRow.findMany({
    orderBy: [{ folderName: "asc" }, { sheetName: "asc" }, { rowNumber: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Smartsheet BIM");
  ws.columns = [
    { header: "Folder dự án", key: "folder", width: 32 },
    { header: "Tên sheet", key: "sheet", width: 36 },
    { header: "ID gói thiết kế", key: "maGoi", width: 16 },
    { header: "Hồ sơ thiết kế", key: "hoSo", width: 40 },
    { header: "Bộ môn", key: "boMon", width: 10 },
    { header: "Bắt đầu", key: "batDau", width: 12 },
    { header: "Ngày phát hành PD", key: "pd", width: 16 },
    { header: "Tình trạng", key: "tinhTrang", width: 12 },
    { header: "Chủ trì", key: "chuTri", width: 20 },
    { header: "CBTH 1", key: "cbth1", width: 20 },
    { header: "CBTH 2", key: "cbth2", width: 20 },
    { header: "Ghi chú", key: "ghiChu", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "L1" };

  for (const r of rows) {
    ws.addRow({
      folder: r.folderName,
      sheet: r.sheetName,
      maGoi: r.maGoi ?? "",
      hoSo: r.hoSo ?? "",
      boMon: r.boMon ?? "",
      batDau: fmtDate(r.batDau),
      pd: fmtDate(r.phatHanhPD),
      tinhTrang: r.tinhTrang ?? "",
      chuTri: r.chuTri ?? "",
      cbth1: r.cbth1 ?? "",
      cbth2: r.cbth2 ?? "",
      ghiChu: r.ghiChu ?? "",
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="smartsheet-bim-${Date.now()}.xlsx"`,
    },
  });
}
