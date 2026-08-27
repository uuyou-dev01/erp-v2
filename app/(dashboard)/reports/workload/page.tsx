import Link from "next/link";
import { getWorkloadReportData } from "@/app/actions/team-reports";
import { WorkloadDashboard } from "@/components/reports/workload-dashboard";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type WorkloadSearchParams = {
  scope?: "organization" | "mine";
  tab?: "records" | "people" | "types" | "settlement";
  storeId?: string;
  userId?: string;
  relationshipType?: string;
  from?: string;
  to?: string;
};

export default async function WorkloadPage({
  searchParams,
}: {
  searchParams: Promise<WorkloadSearchParams>;
}) {
  const params = await searchParams;
  try {
    const data = await getWorkloadReportData(params);
    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">工作量中心</h1>
            <p className="mt-1 text-muted-foreground">
              用实际业务事件记录谁为谁完成了什么工作，并按人员、类型与计价规则汇总。
            </p>
          </div>
          <Link
            href="/reports/team-performance"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            查看团队绩效
          </Link>
        </header>
        <WorkloadDashboard
          stores={data.stores}
          people={data.people}
          workload={data.workload}
          canManageRates={data.canManageRates}
          filters={data.filters}
        />
      </div>
    );
  } catch (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">工作量中心</h1>
          <p className="text-muted-foreground">记录、汇总与核对实际完成的工作。</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>暂时无法加载工作量</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "请稍后重试。"}
          </CardContent>
        </Card>
      </div>
    );
  }
}
