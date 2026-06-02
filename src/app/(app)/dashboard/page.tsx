import { ClipboardList, Clock, FolderTree, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/client";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Quản trị",
  MANAGER: "Quản lý",
  MEMBER: "Nhân viên",
  VIEWER: "Khách",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [projectCount, myTaskCount, weekHours] = await Promise.all([
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
  ]);

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
