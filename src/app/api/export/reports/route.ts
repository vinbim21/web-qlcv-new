import ExcelJS from "exceljs";
import { auth } from "@/server/auth/config";
import { canViewPersonReports } from "@/server/auth/permissions";
import { prisma } from "@/server/db/client";
import { PHONG_LABEL, PHONG_ORDER, phongOf } from "@/lib/dept-map";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import { effectiveStatus } from "@/lib/task-status";

export const runtime = "nodejs";

const STATUS_KEYS = ["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG", "QUA_HAN"] as const;
const PRIORITY_KEYS = ["CAO", "TRUNG_BINH", "THAP"] as const;

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

type Agg = { label: string; order: number; total: number; status: Record<string, number>; priority: Record<string, number> };

function blankAgg(label: string, order: number): Agg {
  return { label, order, total: 0, status: {}, priority: {} };
}

function addPivotSheet(
  wb: ExcelJS.Workbook,
  title: string,
  rowHeader: string,
  aggs: Agg[],
) {
  const ws = wb.addWorksheet(title);
  ws.columns = [
    { header: rowHeader, key: "label", width: 32 },
    { header: "Tổng", key: "total", width: 8 },
    ...STATUS_KEYS.map((k) => ({ header: TASK_STATUS_LABEL[k], key: `s_${k}`, width: 12 })),
    ...PRIORITY_KEYS.map((k) => ({ header: `Ưu tiên ${PRIORITY_LABEL[k]}`, key: `p_${k}`, width: 14 })),
  ];
  ws.getRow(1).font = { bold: true };
  const sorted = [...aggs].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "vi"));
  for (const a of sorted) {
    const row: Record<string, string | number> = { label: a.label, total: a.total };
    for (const k of STATUS_KEYS) row[`s_${k}`] = a.status[k] ?? 0;
    for (const k of PRIORITY_KEYS) row[`p_${k}`] = a.priority[k] ?? 0;
    ws.addRow(row);
  }
  // dòng tổng
  const totalRow: Record<string, string | number> = { label: "TỔNG CỘNG", total: 0 };
  for (const k of STATUS_KEYS) totalRow[`s_${k}`] = 0;
  for (const k of PRIORITY_KEYS) totalRow[`p_${k}`] = 0;
  for (const a of sorted) {
    (totalRow.total as number) += a.total;
    for (const k of STATUS_KEYS) (totalRow[`s_${k}`] as number) += a.status[k] ?? 0;
    for (const k of PRIORITY_KEYS) (totalRow[`p_${k}`] as number) += a.priority[k] ?? 0;
  }
  ws.addRow(totalRow).font = { bold: true };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const canPerson = canViewPersonReports(session.user.role);
  // Cấp 3: chỉ xuất dữ liệu của chính mình (ép theo userId ở server).
  const selfOnly = !canPerson;
  const meId = session.user.id;

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      children: { none: {} },
      ...(selfOnly ? { assignees: { some: { userId: meId } } } : {}),
    },
    select: {
      id: true,
      sumId: true,
      name: true,
      level2: true,
      level3: true,
      level5: true,
      status: true,
      priority: true,
      actualEnd: true,
      deletedAt: true,
      measureNorm: true,
      plannedStart: true,
      plannedEnd: true,
      workGroup: { select: { name: true, order: true } },
      discipline: { select: { code: true, name: true } },
      phase: { select: { code: true, name: true } },
      project: {
        select: {
          name: true,
          group: { select: { code: true, name: true } },
          constructionType: { select: { code: true, name: true, order: true } },
        },
      },
      assignees: { select: { user: { select: { id: true, fullName: true } } }, orderBy: { roleNo: "asc" } },
    },
    take: 10000,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Web QLCV";

  const group = new Map<string, Agg>();
  const phong = new Map<string, Agg>();
  const user = new Map<string, Agg>();

  const bump = (m: Map<string, Agg>, key: string, mk: () => Agg, status: string, priority: string) => {
    let a = m.get(key);
    if (!a) {
      a = mk();
      m.set(key, a);
    }
    a.total += 1;
    a.status[status] = (a.status[status] ?? 0) + 1;
    a.priority[priority] = (a.priority[priority] ?? 0) + 1;
  };

  for (const t of tasks) {
    const eff = effectiveStatus({
      status: t.status,
      plannedStart: iso(t.plannedStart),
      plannedEnd: iso(t.plannedEnd),
      assigneeCount: t.assignees.length,
    });
    // BC1 — nhóm
    bump(group, t.workGroup.name, () => blankAgg(t.workGroup.name, t.workGroup.order), eff, t.priority);
    // BC2 — phòng
    const p = phongOf(t.discipline?.code);
    const pLabel = p ? PHONG_LABEL[p] : "Chưa phân phòng";
    const pOrder = p ? PHONG_ORDER.indexOf(p) : 99;
    bump(phong, pLabel, () => blankAgg(pLabel, pOrder), eff, t.priority);
    // BC3 — nhân sự (đếm mọi người được giao)
    if (t.assignees.length === 0) {
      bump(user, "⚠ Chưa giao", () => blankAgg("⚠ Chưa giao", 1e9), eff, t.priority);
    } else {
      for (const a of t.assignees) {
        const n = a.user.fullName;
        bump(user, n, () => blankAgg(n, 0), eff, t.priority);
      }
    }
  }

  addPivotSheet(wb, "BC1 - Theo nhom", "Nhóm công việc", [...group.values()]);
  addPivotSheet(wb, "BC2 - Theo phong", "Phòng", [...phong.values()]);
  addPivotSheet(wb, "BC3 - Theo nhan su", "Nhân sự", [...user.values()]);

  // BC4 — Định mức. Cấp 3 (selfOnly) cũng xuất được, nhưng chỉ dòng của chính mình;
  // mốc "TB phòng" (byDept) vẫn tính trên toàn phòng (ẩn danh).
  if (canPerson || selfOnly) {
    const entries = await prisma.timeSheetEntry.findMany({
      where: { deletedAt: null, task: { is: { measureNorm: true, deletedAt: null } } },
      select: {
        hours: true,
        taskId: true,
        userId: true,
        user: { select: { fullName: true } },
        task: { select: { level5: true, name: true, project: { select: { constructionType: { select: { name: true, order: true } } } } } },
      },
    });
    type N = { user: string; task: string; ct: string; ctOrder: number; hours: number; tasks: Set<string> };
    const byUser = new Map<string, N>();
    const byDept = new Map<string, { hours: number; tasks: Set<string> }>();
    for (const e of entries) {
      const task = e.task?.level5 || e.task?.name || "(không rõ đầu việc)";
      const ct = e.task?.project?.constructionType;
      const ctName = ct?.name ?? "Chưa gán loại hình";
      const tk = e.taskId ?? `${task}|${ctName}`;
      // byUser: bỏ qua người khác khi selfOnly (byDept vẫn cộng đủ phía dưới).
      if (!selfOnly || e.userId === meId) {
        const uk = `${e.user.fullName}|${task}|${ctName}`;
        let a = byUser.get(uk);
        if (!a) {
          a = { user: e.user.fullName, task, ct: ctName, ctOrder: ct?.order ?? 999, hours: 0, tasks: new Set() };
          byUser.set(uk, a);
        }
        a.hours += Number(e.hours);
        a.tasks.add(tk);
      }
      const dk = `${task}|${ctName}`;
      let d = byDept.get(dk);
      if (!d) {
        d = { hours: 0, tasks: new Set() };
        byDept.set(dk, d);
      }
      d.hours += Number(e.hours);
      d.tasks.add(tk);
    }
    // ----- BC4 Định mức — TẠM ẨN, bật lại sau (giữ byUser/byDept ở trên vì byDept còn cấp số liệu cho sheet Thời gian) -----
    // const ws = wb.addWorksheet("BC4 - Dinh muc");
    // ws.columns = [
    //   { header: "Nhân sự", key: "user", width: 22 },
    //   { header: "Đầu việc", key: "task", width: 32 },
    //   { header: "Loại hình CT", key: "ct", width: 22 },
    //   { header: "Số lần", key: "times", width: 8 },
    //   { header: "Tổng giờ", key: "hours", width: 10 },
    //   { header: "Định mức (giờ/lần)", key: "norm", width: 16 },
    //   { header: "TB phòng", key: "dept", width: 12 },
    // ];
    // ws.getRow(1).font = { bold: true };
    // const rows = [...byUser.values()].sort(
    //   (a, b) => a.user.localeCompare(b.user, "vi") || a.ctOrder - b.ctOrder || a.task.localeCompare(b.task, "vi"),
    // );
    // for (const a of rows) {
    //   const times = a.tasks.size || 1;
    //   const d = byDept.get(`${a.task}|${a.ct}`)!;
    //   const dTimes = d.tasks.size || 1;
    //   ws.addRow({
    //     user: a.user,
    //     task: a.task,
    //     ct: a.ct,
    //     times: a.tasks.size,
    //     hours: Number(a.hours.toFixed(1)),
    //     norm: Number((a.hours / times).toFixed(1)),
    //     dept: Number((d.hours / dTimes).toFixed(1)),
    //   });
    // }
    // if (rows.length === 0) ws.addRow({ user: "(Chưa có dữ liệu định mức)" });

    // ----- Thời gian theo việc (2 sheet) -----
    const tsAll = await prisma.timeSheetEntry.findMany({
      where: {
        deletedAt: null,
        taskId: { in: tasks.map((t) => t.id) },
        ...(selfOnly ? { userId: meId } : {}),
      },
      select: { taskId: true, hours: true, date: true, user: { select: { fullName: true } } },
    });
    const tInfo = new Map(tasks.map((t) => [t.id, t]));
    const deptNormOf = (level5: string, ctName: string): number | null => {
      const d = byDept.get(`${level5}|${ctName}`);
      return d && d.tasks.size > 0 ? d.hours / d.tasks.size : null;
    };

    type T = { hours: number; users: Map<string, number>; dates: Set<string>; minD: string; maxD: string };
    const byTask = new Map<string, T>();
    for (const e of tsAll) {
      const id = e.taskId as string;
      const dt = iso(e.date);
      let a = byTask.get(id);
      if (!a) {
        a = { hours: 0, users: new Map(), dates: new Set(), minD: dt, maxD: dt };
        byTask.set(id, a);
      }
      a.hours += Number(e.hours);
      a.users.set(e.user.fullName, (a.users.get(e.user.fullName) ?? 0) + Number(e.hours));
      a.dates.add(dt);
      if (dt < a.minD) a.minD = dt;
      if (dt > a.maxD) a.maxD = dt;
    }

    const wsList = wb.addWorksheet("Danh sach cong viec");
    wsList.columns = [
      { header: "Dự án", key: "maDuAn", width: 16 },
      { header: "Loại hình", key: "maLoaiHinh", width: 14 },
      { header: "Hạng mục", key: "hangMuc", width: 28 },
      { header: "Công việc", key: "congViec", width: 34 },
      { header: "Bộ môn", key: "maBoMon", width: 12 },
      { header: "Giai đoạn", key: "maGiaiDoan", width: 14 },
      { header: "Thực hiện", key: "thucHien", width: 36 },
      { header: "Số người", key: "soNguoi", width: 10 },
      { header: "Số người ghi giờ", key: "soNguoiGhiGio", width: 14 },
      { header: "Ưu tiên", key: "uuTien", width: 12 },
      { header: "Tình trạng", key: "tinhTrang", width: 16 },
      { header: "Bắt đầu", key: "batDau", width: 12 },
      { header: "Kết thúc", key: "ketThuc", width: 12 },
      { header: "Thực tế hoàn thành", key: "thucTe", width: 18 },
      { header: "Tổng giờ", key: "tongGio", width: 10 },
      { header: "Số ngày", key: "soNgay", width: 10 },
      { header: "Định mức đầu việc", key: "dinhMuc", width: 18 },
      { header: "Đo định mức", key: "doDinhMuc", width: 12 },
    ];
    wsList.getRow(1).font = { bold: true };

    const sortedListTasks = [...tasks].sort((a, b) =>
      a.workGroup.order - b.workGroup.order ||
      (a.project?.group?.code ?? "").localeCompare(b.project?.group?.code ?? "", "vi") ||
      (a.project?.constructionType?.order ?? 999) - (b.project?.constructionType?.order ?? 999) ||
      (a.project?.name ?? a.level3 ?? "").localeCompare(b.project?.name ?? b.level3 ?? "", "vi") ||
      (a.level5 ?? a.name).localeCompare(b.level5 ?? b.name, "vi"),
    );
    for (const t of sortedListTasks) {
      const agg = byTask.get(t.id);
      const level5 = t.level5 || t.name;
      const ctName = t.project?.constructionType?.name ?? "Chưa gán loại hình";
      const dn = deptNormOf(level5, ctName);
      const eff = effectiveStatus({
        status: t.status,
        plannedStart: iso(t.plannedStart),
        plannedEnd: iso(t.plannedEnd),
        assigneeCount: t.assignees.length,
      });
      wsList.addRow({
        maDuAn: t.project?.group?.code ?? "",
        maLoaiHinh: t.project?.constructionType?.code ?? "",
        hangMuc: t.project?.name ?? t.level3 ?? "",
        congViec: level5,
        maBoMon: t.discipline?.code ?? "",
        maGiaiDoan: t.phase?.code ?? "",
        thucHien: t.assignees.map((a) => a.user.fullName).join(", "),
        soNguoi: t.assignees.length,
        soNguoiGhiGio: agg?.users.size ?? 0,
        uuTien: PRIORITY_LABEL[t.priority] ?? t.priority,
        tinhTrang: TASK_STATUS_LABEL[eff] ?? eff,
        batDau: iso(t.plannedStart),
        ketThuc: iso(t.plannedEnd),
        thucTe: iso(t.actualEnd),
        tongGio: agg ? Number(agg.hours.toFixed(1)) : 0,
        soNgay: agg?.dates.size ?? 0,
        dinhMuc: dn != null ? Number(dn.toFixed(1)) : "",
        doDinhMuc: t.measureNorm ? "Có" : "",
      });
    }

    const wsT = wb.addWorksheet("Thoi gian theo viec");
    wsT.columns = [
      { header: "Dự án", key: "maDuAn", width: 16 },
      { header: "Loại hình", key: "maLoaiHinh", width: 14 },
      { header: "Hạng mục", key: "hangMuc", width: 28 },
      { header: "Bộ môn", key: "maBoMon", width: 12 },
      { header: "Giai đoạn", key: "maGiaiDoan", width: 14 },
      { header: "Thực hiện", key: "thucHien", width: 36 },
      { header: "Ưu tiên", key: "uuTien", width: 12 },
      { header: "Tình trạng", key: "tinhTrang", width: 16 },
      { header: "Thực tế hoàn thành", key: "thucTe", width: 18 },
      { header: "Đo định mức", key: "doDinhMuc", width: 12 },
      { header: "Công việc", key: "ten", width: 34 },
      { header: "Nhóm", key: "nhom", width: 18 },
      { header: "Tổng giờ", key: "gio", width: 10 },
      { header: "Số người", key: "nguoi", width: 9 },
      { header: "Số ngày", key: "ngay", width: 9 },
      { header: "Đầu", key: "dau", width: 12 },
      { header: "Cuối", key: "cuoi", width: 12 },
      { header: "ĐM đầu việc", key: "dm", width: 12 },
      { header: "Đã xóa", key: "xoa", width: 8 },
    ];
    wsT.getRow(1).font = { bold: true };

    const wsTU = wb.addWorksheet("Thoi gian viec-nguoi");
    wsTU.columns = [
      { header: "Mã dự án", key: "maDuAn", width: 16 },
      { header: "Dự án", key: "duAn", width: 28 },
      { header: "Loại hình", key: "loaiHinh", width: 24 },
      { header: "Hạng mục", key: "hangMuc", width: 28 },
      { header: "Công việc", key: "ten", width: 34 },
      { header: "Bộ môn", key: "boMon", width: 22 },
      { header: "Giai đoạn", key: "giaiDoan", width: 20 },
      { header: "Nhân sự", key: "nguoi", width: 22 },
      { header: "Giờ", key: "gio", width: 10 },
      { header: "% so ĐM", key: "sodm", width: 10 },
    ];
    wsTU.getRow(1).font = { bold: true };

    const sortedTasks = [...byTask.entries()].sort((a, b) => b[1].hours - a[1].hours);
    for (const [id, agg] of sortedTasks) {
      const t = tInfo.get(id);
      if (!t) continue;
      const level5 = t.level5 || t.name;
      const ctName = t.project?.constructionType?.name ?? "Chưa gán loại hình";
      const dn = deptNormOf(level5, ctName);
      const eff = effectiveStatus({
        status: t.status,
        plannedStart: iso(t.plannedStart),
        plannedEnd: iso(t.plannedEnd),
        assigneeCount: t.assignees.length,
      });
      wsT.addRow({
        maDuAn: t.project?.group?.code ?? "",
        maLoaiHinh: t.project?.constructionType?.code ?? "",
        hangMuc: t.project?.name ?? t.level3 ?? "",
        maBoMon: t.discipline?.code ?? "",
        maGiaiDoan: t.phase?.code ?? "",
        thucHien: t.assignees.map((a) => a.user.fullName).join(", "),
        uuTien: PRIORITY_LABEL[t.priority] ?? t.priority,
        tinhTrang: TASK_STATUS_LABEL[eff] ?? eff,
        thucTe: iso(t.actualEnd),
        doDinhMuc: t.measureNorm ? "Có" : "",
        ten: t.name,
        nhom: t.workGroup.name,
        gio: Number(agg.hours.toFixed(1)),
        nguoi: agg.users.size,
        ngay: agg.dates.size,
        dau: agg.minD,
        cuoi: agg.maxD,
        dm: dn != null ? Number(dn.toFixed(1)) : "",
        xoa: t.deletedAt ? "x" : "",
      });
      for (const [name, h] of [...agg.users.entries()].sort((a, b) => b[1] - a[1])) {
        wsTU.addRow({
          maDuAn: t.project?.group?.code ?? "",
          duAn: t.project?.group?.name ?? "",
          loaiHinh: t.project?.constructionType?.name ?? (t.project ? "" : (t.level2 ?? "")),
          hangMuc: t.project?.name ?? t.level3 ?? "",
          ten: t.name,
          boMon: t.discipline?.name ?? "",
          giaiDoan: t.phase?.name ?? "",
          nguoi: name,
          gio: Number(h.toFixed(1)),
          sodm: dn != null && dn > 0 ? Math.round(((h - dn) / dn) * 100) : "",
        });
      }
    }
    if (sortedTasks.length === 0) wsT.addRow({ ma: "(Chưa có timesheet gắn việc)" });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-so-lieu-${Date.now()}.xlsx"`,
    },
  });
}
