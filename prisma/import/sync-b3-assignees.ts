/**
 * PHƯƠNG ÁN A — Đồng bộ RIÊNG người triển khai (assignee) cho Bảng 3 (wg=3) từ data.json.
 *
 * Làm gì:
 *   1) Backup toàn bộ TaskAssignee wg=3 hiện tại ra JSON (khôi phục được).
 *   2) Với mỗi sumId wg=3 trong data.json:
 *        - task đã có  -> ghi lại assignee (xoá hết rồi tạo lại theo Excel).
 *        - task chưa có -> tạo Task + assignee (dự án/user phải có sẵn; KHÔNG tự tạo).
 *   3) Soft-delete đúng 3 sumId cũ đã bỏ khỏi Excel: NX.303/304/305.
 *
 * KHÔNG đụng: việc tạo tay QL-* (sumId không thuộc Excel), timesheet, các trường khác (name/project/phase của task đã có).
 * Idempotent: chạy lại không nhân đôi.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DATA = path.join(process.cwd(), "prisma", "import", "data.json");
const NX_SOFT_DELETE = [
  "3.B.HYE.NOXHPH.NX.303",
  "3.B.HYE.NOXHPH.NX.304",
  "3.B.HYE.NOXHPH.NX.305",
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
  const b3 = tasks.filter((t) => t.wg === "3" && t.sumId);

  const wg = await prisma.workGroup.findFirst({ where: { code: "3" } });
  if (!wg) throw new Error("Không tìm thấy WorkGroup code=3");
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

  // ---------- BACKUP ----------
  const before = await prisma.task.findMany({
    where: { workGroupId: wg.id, sumId: { not: null } },
    select: {
      id: true, sumId: true, deletedAt: true,
      assignees: { select: { userId: true, roleNo: true, user: { select: { fullName: true } } } },
    },
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(process.cwd(), "prisma", "import", `backup-b3-assignees-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(before, null, 1), "utf-8");
  console.log(`Backup ${before.length} task wg=3 (assignee+deletedAt) -> ${backupPath}`);

  // ---------- 1+2. Ghi lại assignee / tạo task thiếu ----------
  let rewritten = 0, created = 0;
  const problems: string[] = [];
  for (const t of b3) {
    const assigneeIds: string[] = [];
    for (const nm of t.assignees) {
      const id = userByName.get(nm.trim());
      if (id && !assigneeIds.includes(id)) assigneeIds.push(id);
      else if (!id) problems.push(`${t.sumId}: thiếu user "${nm}" (bỏ qua người này)`);
    }

    let task = await prisma.task.findFirst({
      where: { workGroupId: wg.id, sumId: t.sumId, deletedAt: null },
      select: { id: true },
    });

    if (!task) {
      // task thiếu -> tạo mới (dự án bắt buộc có sẵn)
      const projectId = t.l2 ? (projectByKey.get(`${t.l2}|${t.l3}`) ?? null) : null;
      if (t.l2 && !projectId) { problems.push(`${t.sumId}: thiếu dự án "${t.l2} — ${t.l3}" (KHÔNG tự tạo, bỏ qua)`); continue; }
      const c = await prisma.task.create({
        data: {
          workGroupId: wg.id, projectId, disciplineId: disciplineId(t.l4),
          phaseId: t.phase ? (phaseByKey.get(t.phase.toUpperCase()) ?? null) : null,
          sumId: t.sumId, subId: t.subId || null,
          level2: t.l2 || null, level3: t.l3 || null, level5: t.l5 || null,
          name: t.l5 || t.l3 || t.l2 || "Công việc",
          priority: mapPriority(t.priority),
          plannedStart: toDate(t.start), plannedEnd: toDate(t.end),
          wbsPath: t.sumId, level: 5, deletedAt: null,
        },
        select: { id: true },
      });
      task = c;
      created++;
      console.log(`+ tạo ${t.sumId} · ${assigneeIds.length} người`);
    }

    // ghi lại assignee (xoá hết rồi tạo lại theo Excel)
    await prisma.taskAssignee.deleteMany({ where: { taskId: task.id } });
    if (assigneeIds.length) {
      await prisma.taskAssignee.createMany({
        data: assigneeIds.map((userId, i) => ({ taskId: task!.id, userId, roleNo: i + 1 })),
      });
    }
    rewritten++;
  }

  // ---------- 3. Soft-delete 3 sumId cũ ----------
  const softDel = await prisma.task.updateMany({
    where: { workGroupId: wg.id, sumId: { in: NX_SOFT_DELETE }, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  console.log("──────── KẾT QUẢ ────────");
  console.log(`Task wg=3 xử lý (ghi lại assignee): ${rewritten}`);
  console.log(`Trong đó tạo mới (task thiếu)     : ${created}`);
  console.log(`Soft-delete (NX.303/304/305)      : ${softDel.count}`);
  if (problems.length) {
    console.log(`⚠ ${problems.length} cảnh báo:`);
    for (const p of problems) console.log(`   · ${p}`);
  } else {
    console.log("Không có cảnh báo (đủ user + dự án).");
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
