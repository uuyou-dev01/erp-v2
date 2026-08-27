import { getTeamManagementData } from "@/app/actions/team";
import { TeamMemberTable } from "@/components/team/team-member-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof getTeamManagementData>>;
  try {
    data = await getTeamManagementData();
  } catch (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">团队成员</h1>
          <p className="text-muted-foreground">管理成员角色、店铺访问权限和协作身份。</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>暂时无法加载团队成员</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "请确认当前用户和店铺数据已初始化。"}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">团队成员</h1>
        <p className="text-muted-foreground">
          管理成员角色与店铺权限；创建邀请后复制链接发给对方。
        </p>
      </div>
      <TeamMemberTable
        stores={data.stores}
        locations={data.locations}
        roles={data.roles}
        members={data.members}
        invitations={data.invitations}
        currentUserId={data.currentUserId}
        currentUserRole={data.currentUserRole}
        defaultInviteOpen={params.invite === "1"}
      />
    </div>
  );
}
