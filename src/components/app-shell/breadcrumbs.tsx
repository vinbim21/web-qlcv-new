"use client";

import { usePathname } from "next/navigation";

const LABELS: Record<string, string> = {
  dashboard: "Tổng quan",
  tasks: "Công việc của tôi",
  manage: "Quản lý công việc",
  assign: "Giao việc",
  timesheet: "Timesheet",
  reports: "Báo cáo",
  admin: "Quản trị",
  users: "Người dùng",
  projects: "Dự án",
  disciplines: "Khai báo bộ môn",
  catalog: "Khai báo danh mục",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const label = parts.map((p) => LABELS[p] ?? p).join(" / ");
  return <span className="text-sm font-medium">{label || "Tổng quan"}</span>;
}
