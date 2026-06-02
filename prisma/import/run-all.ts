/**
 * Nạp dữ liệu từ prisma/import/data.json vào DB.
 * Bước 1 (đọc Excel): python prisma/import/extract.py  -> tạo data.json
 * Bước 2 (nạp DB)   : pnpm import:all                  -> chạy file này
 *
 * Tasks: upsert theo sumId (chạy lại không nhân đôi).
 * Timesheets: xóa sạch rồi nạp lại.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DATA = path.join(process.cwd(), "prisma", "import", "data.json");

type TaskJson = {
  wg: string;
  sumId: string;
  subId: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
  priority: string;
  phase: string;
  assignees: string[];
  start: string | null;
  end: string | null;
};
type TsJson = { person: string; taskSum: string; date: string; hours: number; note: string };

function usernameFromName(fullName: string): string {
  const noTone = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
  const parts = noTone.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "user";
  const last = parts[parts.length - 1]!;
  const initials = parts.slice(0, -1).map((p) => p[0]).join("");
  return `${last}${initials}`.replace(/[^a-z0-9._-]/g, "");
}
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

const userCache = new Map<string, string>();
const projectCache = new Map<string, string>();
let demoHash = "";

async function getUser(fullName: string): Promise<string | null> {
  const name = fullName.trim();
  if (!name || name.toLowerCase() === "all") return null;
  if (userCache.has(name)) return userCache.get(name)!;
  const existing = await prisma.user.findFirst({ where: { fullName: name } });
  if (existing) {
    userCache.set(name, existing.id);
    return existing.id;
  }
  let username = usernameFromName(name);
  for (let i = 1; await prisma.user.findUnique({ where: { username } }); i++) {
    username = `${usernameFromName(name)}${i}`;
  }
  const created = await prisma.user.create({
    data: {
      username,
      email: `${username}@qlcv.local`,
      fullName: name,
      passwordHash: demoHash,
      role: UserRole.MEMBER,
      mustChangePassword: true,
    },
  });
  userCache.set(name, created.id);
  return created.id;
}

async function getProject(code: string, name: string): Promise<string | null> {
  const c = code.trim();
  if (!c) return null;
  if (projectCache.has(c)) return projectCache.get(c)!;
  const found =
    (await prisma.project.findUnique({ where: { code: c } })) ??
    (await prisma.project.create({ data: { code: c, name: name.trim() || c } }));
  projectCache.set(c, found.id);
  return found.id;
}

async function main() {
  if (!fs.existsSync(DATA)) {
    throw new Error("Chưa có data.json. Chạy trước: python prisma/import/extract.py");
  }
  demoHash = await bcrypt.hash("Qlcv@12345", 10);
  const { tasks, timesheets } = JSON.parse(fs.readFileSync(DATA, "utf-8")) as {
    tasks: TaskJson[];
    timesheets: TsJson[];
  };

  const wgByCode = new Map((await prisma.workGroup.findMany()).map((w) => [w.code, w.id]));
  const discByCode = new Map(
    (await prisma.discipline.findMany()).map((d) => [d.code.toUpperCase(), d.id]),
  );
  const phases = await prisma.phase.findMany();
  const phaseByKey = new Map<string, string>();
  for (const p of phases) {
    phaseByKey.set(p.name.toUpperCase(), p.id);
    phaseByKey.set(p.code.toUpperCase(), p.id);
  }
  const disciplineId = (code: string): string | null => {
    const c = code.trim().toUpperCase();
    if (!c) return null;
    if (c.includes("MEPF")) return discByCode.get("MEPF") ?? null;
    if (c.includes("IT")) return discByCode.get("IT") ?? null;
    if (c.includes("BIM")) return discByCode.get("BIM") ?? null;
    return discByCode.get(c) ?? null;
  };

  console.log(`Nạp ${tasks.length} công việc...`);
  let taskCount = 0;
  for (const t of tasks) {
    const wgId = wgByCode.get(t.wg);
    if (!wgId) continue;
    const projectId = t.wg === "3" && t.l2 ? await getProject(t.l2, t.l3) : null;
    const assigneeIds: string[] = [];
    for (const nm of t.assignees) {
      const id = await getUser(nm);
      if (id && !assigneeIds.includes(id)) assigneeIds.push(id);
    }
    const data = {
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
    };
    const existing = t.sumId ? await prisma.task.findFirst({ where: { sumId: t.sumId } }) : null;
    let taskId: string;
    if (existing) {
      await prisma.task.update({ where: { id: existing.id }, data });
      taskId = existing.id;
    } else {
      const created = await prisma.task.create({
        data: { ...data, wbsPath: t.sumId || `${t.wg}-${taskCount}`, level: 5 },
      });
      taskId = created.id;
    }
    await prisma.taskAssignee.deleteMany({ where: { taskId } });
    if (assigneeIds.length) {
      await prisma.taskAssignee.createMany({
        data: assigneeIds.map((userId, i) => ({ taskId, userId, roleNo: i + 1 })),
      });
    }
    taskCount++;
  }

  console.log(`Nạp ${timesheets.length} dòng nhật ký...`);
  await prisma.timeSheetEntry.deleteMany({});
  const allTasks = await prisma.task.findMany({ select: { id: true, sumId: true, projectId: true } });
  const taskBySum = new Map(allTasks.filter((t) => t.sumId).map((t) => [t.sumId as string, t]));
  let tsCount = 0;
  for (const e of timesheets) {
    const userId = await getUser(e.person);
    if (!userId) continue;
    const task = e.taskSum ? taskBySum.get(e.taskSum) : undefined;
    const d = toDate(e.date);
    if (!d) continue;
    await prisma.timeSheetEntry.create({
      data: {
        userId,
        taskId: task?.id ?? null,
        projectId: task?.projectId ?? null,
        date: d,
        hours: e.hours,
        note: e.note || null,
      },
    });
    tsCount++;
  }

  const summary = {
    users: await prisma.user.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    timesheets: await prisma.timeSheetEntry.count(),
  };
  console.log(`Đã nạp ${taskCount} task, ${tsCount} nhật ký`);
  console.log("Tổng DB:", summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
