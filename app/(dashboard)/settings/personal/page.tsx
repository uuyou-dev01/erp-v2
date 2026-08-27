import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { clearCurrentUser } from "@/app/actions/session";
import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { cn } from "@/lib/utils";
import { MyOrganizations } from "@/components/settings/my-organizations";
import { releaseMetadata } from "@/lib/runtime/env";

export const dynamic = "force-dynamic";

export default async function PersonalSettingsPage() {
  const context = await requireUserContext().catch(() => redirect("/onboarding"));
  const release = releaseMetadata();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: context.userId },
    select: {
      name: true,
      email: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          role: true,
          organization: { select: { id: true, name: true, collaborationCode: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <div>
      <PageHeader
        title="个人设置"
        description="管理个人资料、登录密码和当前账号。"
        badge={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
          </span>
        }
      />

      <AccountSettingsForm name={user.name ?? ""} email={user.email} />

      <MyOrganizations
        activeOrganizationId={context.organizationId}
        organizations={user.memberships.map((membership) => ({
          ...membership.organization,
          role: membership.role,
        }))}
      />

      <section className="border-t py-6">
        <h2 className="text-sm font-medium">系统版本</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          v{release.version} · {release.sha === "unknown" ? "开发构建" : release.sha.slice(0, 12)}
        </p>
      </section>

      <section className="flex flex-col gap-3 border-t py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">登录与账号</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            切换操作人需要使用另一个账号重新登录。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <LogIn className="h-4 w-4" />
            切换账号
          </Link>
          <form action={clearCurrentUser}>
            <button
              type="submit"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground"
              )}
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
