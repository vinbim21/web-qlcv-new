/**
 * Backup DB ra JSON trước khi import (không có pg_dump trên máy).
 * Chạy: npx tsx prisma/import/backup.ts
 * Khôi phục: viết script đọc file này và upsert lại (thủ công khi cần).
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [users, projects, workGroups, disciplines, phases, catalogItems, tasks, taskAssignees, timesheets] =
    await Promise.all([
      prisma.user.findMany(),
      prisma.project.findMany(),
      prisma.workGroup.findMany(),
      prisma.discipline.findMany(),
      prisma.phase.findMany(),
      prisma.catalogItem.findMany(),
      prisma.task.findMany(),
      prisma.taskAssignee.findMany(),
      prisma.timeSheetEntry.findMany(),
    ]);

  const counts = {
    users: users.length,
    projects: projects.length,
    workGroups: workGroups.length,
    catalogItems: catalogItems.length,
    tasksActive: tasks.filter((t) => !t.deletedAt).length,
    tasksDeleted: tasks.filter((t) => t.deletedAt).length,
    taskAssignees: taskAssignees.length,
    timesheets: timesheets.length,
  };

  const dir = path.join(process.cwd(), "backup");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `qlcv_${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      { takenAt: new Date().toISOString(), counts, users, projects, workGroups, disciplines, phases, catalogItems, tasks, taskAssignees, timesheets },
      null,
      0,
    ),
  );
  console.log("BACKUP ->", file);
  console.log("COUNTS BEFORE:", JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
