"use client";

import {
  ClipboardCheck,
  ClipboardList,
  Clock,
  LayoutDashboard,
  type LucideIcon,
  PieChart,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/tasks", label: "Công việc của tôi", icon: ClipboardList },
  { href: "/timesheet", label: "Timesheet", icon: Clock },
  { href: "/reports", label: "Báo cáo", icon: PieChart },
];

const MANAGE_NAV: NavItem = { href: "/manage", label: "Quản lý công việc", icon: ClipboardCheck };

// Mọi vai trò xem được (chỉ ADMIN hoặc user được cấp quyền cột mới sửa được) — đặt trong mục Quản trị.
const CATALOG_NAV: NavItem = { href: "/admin/catalog", label: "Khai báo thông tin", icon: SlidersHorizontal };

// Chỉ ADMIN mới thấy.
const ADMIN_ONLY_NAV: NavItem[] = [
  { href: "/admin/users", label: "Người dùng", icon: Users },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className="size-4" />
      {item.label}
    </Link>
  );
}

export function SidebarNav({ isAdmin, canAssign }: { isAdmin: boolean; canAssign: boolean }) {
  const pathname = usePathname();
  const mainNav = [MAIN_NAV[0], MAIN_NAV[1], MANAGE_NAV, ...MAIN_NAV.slice(2)];
  // Mục Quản trị: Khai báo thông tin luôn hiện (ai cũng xem được); Người dùng chỉ ADMIN.
  const quanTriNav = [CATALOG_NAV, ...(isAdmin ? ADMIN_ONLY_NAV : [])];
  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
      <Separator className="bg-sidebar-border" />
      <p className="px-3 pt-1 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
        Quản trị
      </p>
      <div className="space-y-0.5">
        {quanTriNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </div>
  );
}
