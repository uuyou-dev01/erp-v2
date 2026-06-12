import { getTeamReportData } from "@/app/actions/team-reports";
import { TeamMetricsDashboard } from "@/components/reports/team-metrics-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function TeamReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    storeId?: string;
    platformId?: string;
    userId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof getTeamReportData>>;
  try {
    data = await getTeamReportData(params);
  } catch (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">团队工作量</h1>
          <p className="text-muted-foreground">
            按成员、店铺、平台和时间范围统计上架、发货、结算与逾期任务。
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>暂时无法加载团队统计</CardTitle>
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
        <h1 className="text-3xl font-bold">团队工作量</h1>
        <p className="text-muted-foreground">
          按成员、店铺、平台和时间范围统计上架、发货、结算与逾期任务。
        </p>
      </div>
      <TeamMetricsDashboard
        stores={data.stores}
        platforms={data.platforms}
        members={data.members}
        metrics={data.metrics}
        filters={data.filters}
      />
    </div>
  );
}
