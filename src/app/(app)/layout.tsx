import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";
import { MobileSidebar } from "@/components/app-shell/mobile-sidebar";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ROLE_LABEL } from "@/lib/labels";
import { logoutAction } from "@/server/actions/auth";
import { auth } from "@/server/auth/config";
import { canAssign } from "@/server/auth/permissions";

function SidebarContent({ isAdmin, canAssignWork }: { isAdmin: boolean; canAssignWork: boolean }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-5 font-semibold">
        <BrandLogo className="size-7" />
        Web QLCV
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarNav isAdmin={isAdmin} canAssign={canAssignWork} />
      </div>
      <div className="border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/50">
        Phòng BIM · v1.0
      </div>
    </div>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");

  const isAdmin = session.user.role === "ADMIN";
  const canAssignWork = canAssign(session.user.role);
  const name = session.user.fullName ?? session.user.name ?? "";
  const initials =
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??";

  return (
    <div className="grid min-h-svh bg-muted/30 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden border-r lg:block">
        <SidebarContent isAdmin={isAdmin} canAssignWork={canAssignWork} />
      </aside>

      <div className="flex min-h-svh min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur-sm lg:px-6">
          <div className="flex items-center gap-3">
            <MobileSidebar>
              <SidebarContent isAdmin={isAdmin} canAssignWork={canAssignWork} />
            </MobileSidebar>
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Separator orientation="vertical" className="h-6" />
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {ROLE_LABEL[session.user.role] ?? session.user.role}
            </Badge>
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-medium">
                {initials}
              </span>
              <span className="hidden text-sm font-medium md:inline">{name}</span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
