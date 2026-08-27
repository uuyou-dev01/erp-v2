import Link from "next/link";
import { getTeamReportData } from "@/app/actions/team-reports";
import { TeamPerformanceDashboard } from "@/components/reports/team-performance-dashboard";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TeamPerformancePage({
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
  const data = await getTeamReportData(await searchParams);
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">团队绩效</h1>
          <p className="mt-1 text-muted-foreground">
            只统计本企业内部成员的任务完成情况；跨企业协作请在工作量中心查看。
          </p>
        </div>
        <Link
          href="/reports/workload"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          返回工作量中心
        </Link>
      </header>
      <TeamPerformanceDashboard
        stores={data.stores}
        platforms={data.platforms}
        members={data.members}
        metrics={data.metrics}
        filters={data.filters}
      />
    </div>
  );
}
