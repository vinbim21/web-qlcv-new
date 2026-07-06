import Link from "next/link";
import { ClipboardList, Clock, FolderTree, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/labels";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [projectCount, myTaskCount, weekHours, assignedTasks] = await Promise.all([
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.task.count({
      where: { deletedAt: null, assignees: { some: { userId } } },
    }),
    prisma.timeSheetEntry
      .aggregate({
        _sum: { hours: true },
        where: { userId, date: { gte: weekAgo }, deletedAt: null },
      })
      .then((r) => r._sum.hours?.toString() ?? "0"),
    // Việc vừa được giao — tạo trong 7 ngày qua
    prisma.task.findMany({
      where: { deletedAt: null, assignees: { some: { userId } }, createdAt: { gte: weekAgo } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        level2: true,
        level3: true,
        createdAt: true,
        project: { select: { group: { select: { code: true } } } },
        discipline: { select: { code: true } },
        phase: { select: { name: true } },
      },
    }),
  ]);

  // "Xem tất cả": OR (dấu "|") giữa từng việc, mỗi việc là AND (dấu ",") của Dự án/Loại hình/Hạng mục/Công việc.
  const viewAllQuery = assignedTasks
    .map((t) => [t.project?.group?.code, t.level2, t.level3, t.name].filter(Boolean).join(", "))
    .join(" | ");

  const cards = [
    { label: "Dự án", value: projectCount, icon: FolderTree },
    { label: "Công việc của tôi", value: myTaskCount, icon: ClipboardList },
    { label: "Giờ công 7 ngày qua", value: `${weekHours} h`, icon: Clock },
    { label: "Quyền hệ thống", value: ROLE_LABEL[session.user.role] ?? session.user.role, icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Xin chào, {session.user.fullName ?? session.user.name}
        </h1>
        <p className="text-sm text-muted-foreground">Tổng quan công việc và dự án phòng BIM.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Việc vừa được giao (7 ngày qua) — {assignedTasks.length} việc</CardTitle>
          {assignedTasks.length > 0 ? (
            <Link
              href={`/tasks?q=${encodeURIComponent(viewAllQuery)}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Xem tất cả trong Công việc của tôi →
            </Link>
          ) : null}
        </CardHeader>
        <CardContent>
          {assignedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có việc nào mới được giao trong 7 ngày qua.</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Dự án</th>
                    <th className="pb-2 pr-3 font-medium">Loại hình</th>
                    <th className="pb-2 pr-3 font-medium">Hạng mục</th>
                    <th className="pb-2 pr-3 font-medium">Công việc</th>
                    <th className="pb-2 pr-3 font-medium">Bộ môn</th>
                    <th className="pb-2 pr-3 font-medium">Giai đoạn</th>
                    <th className="pb-2 font-medium">Ngày giao</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedTasks.map((t) => {
                    // Điền vào ô tìm kiếm của /tasks: Dự án, Loại hình, Hạng mục, Công việc
                    // (thay vì mã việc) — khớp nhiều điều kiện bằng dấu phẩy (AND).
                    const q = [t.project?.group?.code, t.level2, t.level3, t.name].filter(Boolean).join(", ");
                    const href = `/tasks?q=${encodeURIComponent(q)}`;
                    return (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-0">
                          <Link href={href} className="block py-1.5 pr-3">
                            {t.project?.group?.code ?? "—"}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={href} className="block py-1.5 pr-3">
                            {t.level2 || "—"}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={href} className="block py-1.5 pr-3">
                            {t.level3 || "—"}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={href} className="block py-1.5 pr-3">
                            {t.name}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={href} className="block py-1.5 pr-3">
                            {t.discipline?.code ?? "—"}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={href} className="block py-1.5 pr-3">
                            {t.phase?.name ?? "—"}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={href} className="block whitespace-nowrap py-1.5 text-muted-foreground">
                            {t.createdAt.toLocaleDateString("vi-VN")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bắt đầu</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Vào mục <strong>Công việc của tôi</strong> để xem việc được giao, hoặc{" "}
          <strong>Báo cáo</strong> để xem tiến độ chung.
        </CardContent>
      </Card>
    </div>
  );
}
