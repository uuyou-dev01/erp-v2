import Link from "next/link";
import { Boxes, Building2, Handshake, Store, UserPlus, Users, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SettingsLinkList } from "@/components/settings/settings-link-list";
import { CompanyProfileOverview } from "@/components/settings/company-profile-overview";
import { requireUserContext } from "@/lib/auth/user-context";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const context = await requireUserContext();
  const [organization, memberCount, storeCount, pendingInvitationCount, owner, warehouseRoster] =
    await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { name: true, collaborationCode: true },
      }),
      prisma.membership.count({
        where: { organizationId: context.organizationId, status: "ACTIVE" },
      }),
      prisma.store.count({ where: { organizationId: context.organizationId } }),
      prisma.organizationInvitation.count({
        where: {
          organizationId: context.organizationId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      }),
      prisma.membership.findFirst({
        where: { organizationId: context.organizationId, status: "ACTIVE", role: "OWNER" },
        select: { user: { select: { name: true, email: true } } },
      }),
      prisma.locationFulfiller.findMany({
        where: { organizationId: context.organizationId, status: { in: ["ACTIVE", "INVITED"] } },
        select: { userId: true, email: true },
      }),
    ]);
  const warehouseCollaboratorCount = new Set(
    warehouseRoster.map((entry) => entry.userId ?? `email:${entry.email.toLowerCase()}`)
  ).size;
  return (
    <div>
      <PageHeader
        title="企业设置"
        description="管理组织、成员、店铺与外部合作关系。"
        badge={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
          </span>
        }
        actions={
          hasRoleAtLeast(context.role, ROLES.MANAGER) ? (
            <Button asChild>
              <Link href="/settings/team?invite=1">
                <UserPlus className="h-4 w-4" />
                邀请成员
              </Link>
            </Button>
          ) : null
        }
      />
      <CompanyProfileOverview
        name={organization.name}
        collaborationCode={organization.collaborationCode}
        ownerName={owner?.user.name || owner?.user.email || "未设置"}
        memberCount={memberCount}
        storeCount={storeCount}
        pendingInvitationCount={pendingInvitationCount}
      />
      <SettingsLinkList
        items={[
          {
            title: "团队成员",
            description: "管理成员账号、角色以及店铺访问权限。",
            href: "/settings/team",
            icon: Users,
          },
          {
            title: "店铺管理",
            description: "维护经营店铺、默认币种和平台账号。",
            href: "/settings/stores",
            icon: Store,
          },
          {
            title: "任务协作",
            description:
              warehouseCollaboratorCount > 0
                ? `${warehouseCollaboratorCount} 位协作者，集中查看其任务范围、角色和工作记录。`
                : "集中查看外部人员的任务范围、角色和工作记录。",
            href: "/settings/warehouse-collaboration",
            icon: Warehouse,
          },
          {
            title: "业务归属与协作",
            description: "管理货盘、销售店铺、仓库运营方及跨主体服务协议。",
            href: "/settings/business-structure",
            icon: Boxes,
          },
          {
            title: "合作方",
            description: "维护供货方、代卖方、代发方和结算关系。",
            href: "/settings/partners",
            icon: Handshake,
          },
          {
            title: "企业连接",
            description: "处理收到与发出的企业协作请求。",
            href: "/settings/connections",
            icon: Building2,
          },
        ]}
      />
    </div>
  );
}
