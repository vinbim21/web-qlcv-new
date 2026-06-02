"use client";

import {
  Building2,
  ClipboardList,
  Clock,
  FolderTree,
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
  { href: "/timesheet", label: "Nhật ký công việc", icon: Clock },
  { href: "/reports", label: "Báo cáo", icon: PieChart },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "Người dùng", icon: Users },
  { href: "/admin/projects", label: "Dự án", icon: FolderTree },
  { href: "/admin/disciplines", label: "Bộ môn", icon: Building2 },
  { href: "/admin/catalog", label: "Danh mục", icon: SlidersHorizontal },
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

export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
      {isAdmin ? (
        <>
          <Separator className="bg-sidebar-border" />
          <p className="px-3 pt-1 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Quản trị
          </p>
          <div className="space-y-0.5">
            {ADMIN_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
