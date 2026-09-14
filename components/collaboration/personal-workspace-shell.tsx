import { NotificationBell } from "@/components/notifications/notification-bell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, LogOut, PackageCheck, UserRound } from "lucide-react";
import { clearCurrentUser } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { PersonalWorkspaceNav } from "@/components/collaboration/personal-workspace-nav";
import { requireAuthenticatedUser } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

export async function PersonalWorkspaceShell({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser().catch(() => null);
  if (!user) redirect("/login?next=%2Fcollaboration");
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    select: { organization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const managedWarehouse = await prisma.locationFulfiller.findFirst({
    where: {
      userId: user.id,
      status: "ACTIVE",
      role: "MANAGER",
      organization: { memberships: { none: { userId: user.id, status: { not: "ACTIVE" } } } },
    },
    select: { id: true },
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link href="/collaboration/tasks" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PackageCheck className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">任务协作</span>
              <span className="block text-xs text-muted-foreground">{user.name || user.email}</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell href="/collaboration/notifications" />
            <Button asChild variant="ghost" size="sm">
              <Link href="/account" aria-label="个人账号">
                <UserRound className="h-4 w-4" />
                <span className="hidden sm:inline">个人账号</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                href={membership ? "/workbench" : "/onboarding"}
                aria-label={membership ? `进入 ${membership.organization.name}` : "创建自己的企业"}
              >
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {membership ? `进入 ${membership.organization.name}` : "创建自己的企业"}
                </span>
              </Link>
            </Button>
            <form action={clearCurrentUser}>
              <Button type="submit" variant="ghost" size="sm" aria-label="退出登录">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
        <div className="border-t">
          <div className="mx-auto max-w-6xl overflow-x-auto px-4 md:px-6">
            <PersonalWorkspaceNav hasManagedWarehouse={Boolean(managedWarehouse)} />
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 w-full max-w-6xl px-4 py-7 md:px-6">{children}</main>
    </div>
  );
}
