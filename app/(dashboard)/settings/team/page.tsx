import { getTeamManagementData } from "@/app/actions/team";
import { TeamMemberTable } from "@/components/team/team-member-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
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
        <p className="text-muted-foreground">管理成员角色、店铺访问权限和协作身份。</p>
      </div>
      <TeamMemberTable
        stores={data.stores}
        roles={data.roles}
        members={data.members}
        currentUserId={data.currentUserId}
      />
    </div>
  );
}
