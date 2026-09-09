import { redirect } from "next/navigation";
import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { MyOrganizations } from "@/components/settings/my-organizations";
import { PersonalWorkspaceShell } from "@/components/collaboration/personal-workspace-shell";
import { requireAuthenticatedUser, getActiveOrganizationIdForUser } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireAuthenticatedUser().catch(() => redirect("/login?next=%2Faccount"));
  const account = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
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
  const activeOrganizationId = await getActiveOrganizationIdForUser(user.id);
  return (
    <PersonalWorkspaceShell>
      <div className="space-y-7">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">个人账号</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            这个账号属于你本人，可以同时参与外部协作和多个企业。
          </p>
        </div>
        <AccountSettingsForm name={account.name ?? ""} email={account.email} />
        {account.memberships.length && activeOrganizationId ? (
          <MyOrganizations
            activeOrganizationId={activeOrganizationId}
            organizations={account.memberships.map((membership) => ({
              ...membership.organization,
              role: membership.role,
            }))}
          />
        ) : (
          <section className="border-t py-6">
            <h2 className="text-sm font-medium">我的企业</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              你还没有自己的企业空间；这不会影响现有外部任务协作。
            </p>
          </section>
        )}
      </div>
    </PersonalWorkspaceShell>
  );
}
