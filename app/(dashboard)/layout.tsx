import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await requireUserContext().catch(() => redirect("/login"));
  const [stores, account, organizations] = await Promise.all([
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
    >
      {children}
    </DashboardShell>
  );
}
