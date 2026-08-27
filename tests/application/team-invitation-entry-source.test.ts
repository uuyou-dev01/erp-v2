import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("team invitation entry", () => {
  it("exposes a prominent invite action from enterprise settings", () => {
    const companyPage = source("app/(dashboard)/settings/company/page.tsx");

    expect(companyPage).toContain('href="/settings/team?invite=1"');
    expect(companyPage).toContain("hasRoleAtLeast(context.role, ROLES.MANAGER)");
  });

  it("opens the invitation form from the deep link and explains link delivery", () => {
    const teamPage = source("app/(dashboard)/settings/team/page.tsx");
    const teamTable = source("components/team/team-member-table.tsx");

    expect(teamPage).toContain('defaultInviteOpen={params.invite === "1"}');
    expect(teamPage).toContain("复制链接发给对方");
    expect(teamTable).toContain("const [inviteOpen, setInviteOpen] = useState(defaultInviteOpen)");
    expect(teamTable).toContain("角色和店铺是初始授权");
  });

  it("lets managers revise the current member role and store scope", () => {
    const teamAction = source("app/actions/team.ts");
    const teamTable = source("components/team/team-member-table.tsx");

    expect(teamAction).toContain("updateTeamMemberAccessAction");
    expect(teamAction).toContain("removedStoreIds");
    expect(teamTable).toContain("保存权限");
    expect(teamTable).toContain("可发货仓库");
    expect(teamTable).toContain("后续操作将按最新授权实时校验");
  });

  it("snapshots existing warehouses when an invitation is accepted", () => {
    const invitationAction = source("app/actions/organization-invitations.ts");

    expect(invitationAction).toContain("shipLocationIds: canShipOrders(invitation.role)");
    expect(invitationAction).toContain("where: { storeId: { in: storeIds } }");
  });

  it("navigates accepted invitations without a push-refresh race", () => {
    const warehousePanel = source("components/auth/location-fulfiller-invitation-panel.tsx");
    const teamPanel = source("components/auth/team-invitation-panel.tsx");
    const loading = source("app/collaboration/tasks/loading.tsx");

    for (const panel of [warehousePanel, teamPanel]) {
      expect(panel).toContain("router.replace(");
      expect(panel).not.toContain("router.refresh()");
      expect(panel).toContain("window.location.assign(");
    }
    expect(warehousePanel).toContain("邀请已接受，正在打开你的发货任务");
    expect(warehousePanel).toContain("此邀请已接受");
    expect(warehousePanel).toContain('const destination = "/collaboration/tasks"');
    expect(warehousePanel).toContain("接受仓库邀请失败，请重试");
    expect(loading).toContain("正在加载你的仓库权限和发货任务");
  });

  it("keeps accepted warehouse links idempotent and reuses the existing account", () => {
    const action = source("app/actions/location-fulfillers.ts");
    const acceptanceAction = action.slice(
      action.indexOf("export async function acceptLocationFulfillerInvitationAction"),
      action.indexOf("export async function setDefaultLocationFulfillerAction")
    );
    const collaborationPage = source("app/(dashboard)/settings/warehouse-collaboration/page.tsx");

    expect(action).toContain('if (invitation.status === "ACTIVE")');
    expect(action).toContain("alreadyAccepted: true");
    expect(acceptanceAction).not.toContain(
      "tokenHash: null,\n          expiresAt: null,\n          acceptedAt"
    );
    expect(action).toContain("ensureWarehouseRosterLocationAccess");
    expect(collaborationPage).toContain("同一人增加仓库时只新增该仓授权");
    expect(collaborationPage).toContain("个仓库授权");
  });

  it("keeps collaboration view types outside the Server Action module", () => {
    const collaborationActions = source("app/actions/collaboration-tasks.ts");
    const collaborationView = source("components/collaboration/shipping-task-list.tsx");

    expect(collaborationActions).not.toContain("export type { CollaborationShippingTask }");
    expect(collaborationView).toContain(
      'import type { CollaborationShippingTask } from "@/lib/application/collaboration-shipping-tasks"'
    );
  });
});
