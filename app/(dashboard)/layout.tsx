import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireAuthenticatedUser, requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { getCollaborationTaskSummaryForUser } from "@/lib/application/collaboration-task-summary";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isNavigationHrefAllowed } from "@/lib/auth/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const authenticatedUser = await requireAuthenticatedUser().catch(() => redirect("/login"));
  const context = await requireUserContext().catch(async () => {
    const collaboration = await prisma.locationFulfiller.findFirst({
      where: { userId: authenticatedUser.id, status: "ACTIVE" },
      select: { id: true },
    });
    redirect(collaboration ? "/collaboration/tasks" : "/onboarding");
  });
  const pathname = (await headers()).get("x-erp-pathname") ?? "/workbench";
  if (!isNavigationHrefAllowed(context.role, pathname)) {
    redirect(`/workbench?access=denied&from=${encodeURIComponent(pathname)}`);
  }
  const [stores, account, organizations, collaboration] = await Promise.all([
    prisma.store.findMany({
      where: { id: { in: context.storeIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: context.userId },
      select: {
        name: true,
        email: true,
        memberships: {
          where: { organizationId: context.organizationId },
          select: { organization: { select: { name: true } } },
          take: 1,
        },
      },
    }),
    prisma.organization.findMany({
      where: {
        memberships: { some: { userId: context.userId, status: "ACTIVE" } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getCollaborationTaskSummaryForUser(context.userId),
  ]);

  return (
    <DashboardShell
      stores={stores}
      activeStoreId={context.activeStoreId}
      organizations={organizations}
      activeOrganizationId={context.organizationId}
      account={{
        name: account.name ?? "",
        email: account.email,
        organizationName: account.memberships[0]?.organization.name ?? "当前企业",
      }}
      role={context.role}
      collaboration={collaboration}
    >
      {children}
    </DashboardShell>
  );
}
