// Báo cáo — kiểu dữ liệu + tổng hợp số liệu (client). Mirror design_files/baocao-data.js.
import { effectiveStatus, isOverdue as isOverdueLib } from "@/lib/task-status";

export type EffStatus = "CHUA_LAM" | "DANG_LAM" | "HOAN_THANH" | "TAM_DUNG" | "QUA_HAN";

// Mốc "Cập nhật công việc" (làm tiếp việc đã hoàn thành) — xem báocao-client modal chi tiết.
export type CompletionHistoryEntry = {
  plannedStart: string;
  plannedEnd: string;
  actualEnd: string;
  note: string | null;
};

// 1 dòng = 1 việc lá. Đủ field cho mọi tab báo cáo.
export type TaskRow = {
  id: string;
  ma: string | null; // sumId
  duAn: string; // mã Dự án (ProjectGroup), "—" nếu không thuộc dự án
  loaiHinh: string; // mã Loại hình công trình, "" nếu chưa gán
  hangMuc: string; // tên Hạng mục (Project)
  khoi: string; // Khối/Hệ thống trong hạng mục, "" nếu không có
  congViec: string; // tên công việc (đầu việc)
  giaiDoan: string; // giai đoạn, "" nếu chưa có
  boMon: string; // mã Bộ môn, "" nếu không có
  boMonCode: string | null; // mã Bộ môn (để gộp Phòng)
  thucHien: string[]; // tên người thực hiện
  thucHienIds: string[]; // id người thực hiện (cùng thứ tự thucHien) — cho deep-link pivot
  groupId: string;
  groupName: string;
  groupOrder: number;
  uuTien: string; // CAO/TRUNG_BINH/THAP
  tinhTrang: string; // trạng thái DB
  batDau: string; // plannedStart iso ("")
  ketThuc: string; // plannedEnd iso ("")
  thucTe: string; // actualEnd iso ("")
  result: string; // URL or file path
  hours: number; // giờ công (timesheet)
  note: string; // nội dung mô tả công việc
  completionHistory: CompletionHistoryEntry[];
};

export const STATUS_ORDER: EffStatus[] = ["CHUA_LAM", "DANG_LAM", "HOAN_THANH", "TAM_DUNG", "QUA_HAN"];
export const STATUS_LABEL: Record<EffStatus, string> = {
  CHUA_LAM: "Chưa thực hiện",
  DANG_LAM: "Đang thực hiện",
  HOAN_THANH: "Hoàn thành",
  TAM_DUNG: "Tạm dừng",
  QUA_HAN: "Quá hạn",
};
export const STATUS_COLOR: Record<EffStatus, string> = {
  CHUA_LAM: "#94a3b8",
  DANG_LAM: "#2563eb",
  HOAN_THANH: "#16a34a",
  TAM_DUNG: "#f59e0b",
  QUA_HAN: "#dc2626",
};
export const PRIO_LABEL: Record<string, string> = { CAO: "Cao", TRUNG_BINH: "Trung bình", THAP: "Thấp" };

export function isOverdue(r: TaskRow): boolean {
  return isOverdueLib({ status: r.tinhTrang, plannedEnd: r.ketThuc || null });
}
export function effStatus(r: TaskRow): EffStatus {
  return effectiveStatus({ status: r.tinhTrang, plannedEnd: r.ketThuc || null, totalHours: r.hours }) as EffStatus;
}

// Đếm số trạng thái + giờ cho 1 tập việc.
export type StatusCounts = {
  total: number;
  hours: number;
  CHUA_LAM: number;
  DANG_LAM: number;
  HOAN_THANH: number;
  TAM_DUNG: number;
  QUA_HAN: number;
};
export function statusCounts(rs: TaskRow[]): StatusCounts {
  const o: StatusCounts = { total: rs.length, hours: 0, CHUA_LAM: 0, DANG_LAM: 0, HOAN_THANH: 0, TAM_DUNG: 0, QUA_HAN: 0 };
  for (const r of rs) {
    o[effStatus(r)]++;
    o.hours += r.hours;
  }
  return o;
}

export type SliceRow = { key: string; total: number; hours: number };
// Gom theo khóa (1 việc có thể vào nhiều khóa — vd nhiều người). Bỏ khóa rỗng/"—".
export function tally(rows: TaskRow[], keyFn: (r: TaskRow) => string | string[]): SliceRow[] {
  const m = new Map<string, SliceRow>();
  for (const r of rows) {
    const keys = keyFn(r);
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      if (!k || k === "—") continue;
      let o = m.get(k);
      if (!o) {
        o = { key: k, total: 0, hours: 0 };
        m.set(k, o);
      }
      o.total++;
      o.hours += r.hours;
    }
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

// Cây Dự án → Hạng mục cho tab "Theo dự án".
export type ProjectAgg = StatusCounts & {
  duAn: string;
  hangMucCount: number;
  hangMuc: (StatusCounts & { name: string; loaiHinh: string })[];
};
export function buildProjects(rows: TaskRow[]): { projects: ProjectAgg[]; unassignedTasks: number } {
  const map = new Map<string, { rows: TaskRow[]; hangMuc: Map<string, TaskRow[]> }>();
  let unassignedTasks = 0;
  for (const r of rows) {
    if (!r.duAn || r.duAn === "—") {
      unassignedTasks++;
      continue;
    }
    let p = map.get(r.duAn);
    if (!p) {
      p = { rows: [], hangMuc: new Map() };
      map.set(r.duAn, p);
    }
    p.rows.push(r);
    const hm = r.hangMuc || "(không hạng mục)";
    if (!p.hangMuc.has(hm)) p.hangMuc.set(hm, []);
    p.hangMuc.get(hm)!.push(r);
  }
  const projects = [...map.entries()]
    .map(([duAn, p]) => {
      const hangMuc = [...p.hangMuc.entries()]
        .map(([name, rs]) => ({ name, loaiHinh: rs[0].loaiHinh || "—", ...statusCounts(rs) }))
        .sort((a, b) => b.total - a.total);
      return { duAn, hangMucCount: hangMuc.length, hangMuc, ...statusCounts(p.rows) };
    })
    .sort((a, b) => b.total - a.total);
  return { projects, unassignedTasks };
}

// KPI tổng quan (toàn bộ, không lọc).
export function buildKpi(rows: TaskRow[]) {
  const { projects } = buildProjects(rows);
  const eff = rows.map(effStatus);
  const done = eff.filter((s) => s === "HOAN_THANH").length;
  const total = rows.length;
  return {
    total,
    done,
    doing: eff.filter((s) => s === "DANG_LAM").length,
    overdue: eff.filter((s) => s === "QUA_HAN").length,
    notStarted: eff.filter((s) => s === "CHUA_LAM").length,
    paused: eff.filter((s) => s === "TAM_DUNG").length,
    projects: projects.length,
    hangMuc: projects.reduce((s, p) => s + p.hangMucCount, 0),
    loaiHinh: new Set(rows.map((r) => r.loaiHinh).filter((x) => x && x !== "—")).size,
    hours: Math.round(rows.reduce((s, r) => s + r.hours, 0)),
    unassigned: rows.filter((r) => r.thucHien.length === 0).length,
    donePct: total ? Math.round((done / total) * 100) : 0,
  };
}

// Chuỗi thời gian theo tháng (theo ketThuc, 1 năm) cho biểu đồ cột chồng.
export type MonthBucket = { m: number; label: string; total: number } & Record<EffStatus, number>;
export function buildMonths(rows: TaskRow[], year: number): { months: MonthBucket[]; noDeadline: number } {
  const months: MonthBucket[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push({ m, label: "Th" + m, total: 0, CHUA_LAM: 0, DANG_LAM: 0, HOAN_THANH: 0, TAM_DUNG: 0, QUA_HAN: 0 });
  }
  let noDeadline = 0;
  for (const r of rows) {
    if (!r.ketThuc) {
      noDeadline++;
      continue;
    }
    const [y, mm] = r.ketThuc.split("-").map(Number);
    if (y !== year) continue;
    const b = months[mm - 1];
    b[effStatus(r)]++;
    b.total++;
  }
  return { months, noDeadline };
}

export function distinctYears(rows: TaskRow[]): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    if (r.ketThuc) {
      const y = Number(r.ketThuc.slice(0, 4));
      if (!Number.isNaN(y)) set.add(y);
    }
  }
  return [...set].sort((a, b) => a - b);
}
