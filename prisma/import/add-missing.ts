/**
 * Thêm các việc CÓ trong Excel (data.json) nhưng CHƯA có trong DB — theo danh sách trắng sumId.
 * CHỈ tạo Task + TaskAssignee. KHÔNG xóa timesheet, KHÔNG xóa mềm việc mồ côi, KHÔNG tạo user/project mới
 * (precheck đã xác nhận mọi user & project nhóm 3 đều có sẵn; nếu thiếu sẽ báo lỗi rõ thay vì tự tạo).
 *
 * Idempotent: việc có sumId đang sống thì bỏ qua. Ghi manifest ID đã tạo để rollback.
 * Chạy: tsx prisma/import/add-missing.ts   (cần data.json mới — chạy extract trước nếu cần)
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DATA = path.join(process.cwd(), "prisma", "import", "data.json");

// 16 việc đã duyệt (loại #17 "1.Công việc khác.007" — placeholder).
const SUMIDS = [
  "3.B.DSHNQN.DMF.103", "3.B.DSHNQN.STA.204", "3.B.DSHNQN.STA.205",
  "3.B.HYE.NOXHPH.NX.401", "3.B.HYE.NOXHPH.NX.501", "3.B.HYE.NOXHPH.NX.601", "3.B.HYE.NOXHPH.NX.701",
  "3.B.HYE.NOXHPH.NX.402", "3.B.HYE.NOXHPH.NX.502", "3.B.HYE.NOXHPH.NX.602", "3.B.HYE.NOXHPH.NX.702",
  "3.N.TNI.HNLA.VSC.102", "3.N.HCM.Q9.VP.702", "3.N.HCM.Q9.VP.703",
  "5.Cad.77", "5.Revit.78",
];

type TaskJson = {
  wg: string; sumId: string; subId: string;
  l2: string; l3: string; l4: string; l5: string;
  priority: string; phase: string; assignees: string[];
  start: string | null; end: string | null;
};

function mapPriority(v: string): "CAO" | "TRUNG_BINH" | "THAP" {
  const t = v.toLowerCase();
  if (t.includes("cao")) return "CAO";
  if (t.includes("thấp") || t.includes("thap")) return "THAP";
  return "TRUNG_BINH";
}
function toDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  if (!fs.existsSync(DATA)) throw new Error("Chưa có data.json. Chạy: python prisma/import/extract.py");
  const { tasks } = JSON.parse(fs.readFileSync(DATA, "utf-8")) as { tasks: TaskJson[] };
  const picked = tasks.filter((t) => SUMIDS.includes(t.sumId));

  const wgByCode = new Map((await prisma.workGroup.findMany()).map((w) => [w.code, w.id]));
  const discByCode = new Map((await prisma.discipline.findMany()).map((d) => [d.code.toUpperCase(), d.id]));
  const phases = await prisma.phase.findMany();
  const phaseByKey = new Map<string, string>();
  for (const p of phases) { phaseByKey.set(p.name.toUpperCase(), p.id); phaseByKey.set(p.code.toUpperCase(), p.id); }
  const disciplineId = (code: string): string | null => {
    const c = code.trim().toUpperCase();
    if (!c) return null;
    if (c.includes("MEPF")) return discByCode.get("MEPF") ?? null;
    if (c.includes("IT")) return discByCode.get("IT") ?? null;
    if (c.includes("BIM")) return discByCode.get("BIM") ?? null;
    return discByCode.get(c) ?? null;
  };

  const userByName = new Map(
    (await prisma.user.findMany({ select: { id: true, fullName: true } })).map((u) => [u.fullName, u.id]),
  );
  const projectByKey = new Map(
    (await prisma.project.findMany({ select: { id: true, code: true, name: true } })).map((p) => [`${p.code}|${p.name}`, p.id]),
  );

  const createdIds: string[] = [];
  let skipped = 0;
  const problems: string[] = [];

  for (const t of picked) {
    const wgId = wgByCode.get(t.wg);
    if (!wgId) { problems.push(`${t.sumId}: không có nhóm wg=${t.wg}`); continue; }

    const existing = await prisma.task.findFirst({ where: { sumId: t.sumId, deletedAt: null }, select: { id: true } });
    if (existing) { skipped++; continue; }

    let projectId: string | null = null;
    if (t.wg === "3" && t.l2) {
      projectId = projectByKey.get(`${t.l2}|${t.l3}`) ?? null;
      if (!projectId) { problems.push(`${t.sumId}: thiếu dự án "${t.l2} — ${t.l3}" (KHÔNG tự tạo)`); continue; }
    }

    const assigneeIds: string[] = [];
    for (const nm of t.assignees) {
      const id = userByName.get(nm.trim());
      if (id && !assigneeIds.includes(id)) assigneeIds.push(id);
      else if (!id) problems.push(`${t.sumId}: thiếu user "${nm}" (KHÔNG tự tạo, người này sẽ không được gán)`);
    }

    const created = await prisma.task.create({
      data: {
        workGroupId: wgId,
        projectId,
        disciplineId: disciplineId(t.l4),
        phaseId: t.phase ? (phaseByKey.get(t.phase.toUpperCase()) ?? null) : null,
        sumId: t.sumId || null,
        subId: t.subId || null,
        level2: t.l2 || null,
        level3: t.l3 || null,
        level5: t.l5 || null,
        name: t.l5 || t.l3 || t.l2 || "Công việc",
        priority: mapPriority(t.priority),
        plannedStart: toDate(t.start),
        plannedEnd: toDate(t.end),
        wbsPath: t.sumId || `${t.wg}-new`,
        level: 5,
        deletedAt: null,
      },
    });
    createdIds.push(created.id);
    if (assigneeIds.length) {
      await prisma.taskAssignee.createMany({ data: assigneeIds.map((userId, i) => ({ taskId: created.id, userId, roleNo: i + 1 })) });
    }
    console.log(`+ tạo ${t.sumId}  ·  ${t.l3} / ${t.l5}  ·  ${assigneeIds.length} người`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const manifest = path.join(process.cwd(), "prisma", "import", `created-missing-${stamp}.json`);
  fs.writeFileSync(manifest, JSON.stringify(createdIds, null, 2), "utf-8");

  console.log("──────── KẾT QUẢ ────────");
  console.log(`Đã tạo : ${createdIds.length}`);
  console.log(`Bỏ qua (đã tồn tại): ${skipped}`);
  console.log(`Manifest rollback  : ${manifest}`);
  if (problems.length) {
    console.log(`⚠ ${problems.length} cảnh báo:`);
    for (const p of problems) console.log(`   · ${p}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
