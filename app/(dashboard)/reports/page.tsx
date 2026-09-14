import { requireUserContext } from "@/lib/auth/user-context";
import { getOperatingReport } from "@/lib/application/operating-report";
import { resolveReportRange } from "@/lib/application/operating-report-math";
import { OperatingDashboard } from "@/components/reports/operating-dashboard";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; tab?: string }>;
}) {
  const { activeStoreId, organizationId } = await requireUserContext();
  const params = await searchParams;
  const range = resolveReportRange(params);
  const data = await getOperatingReport(activeStoreId, organizationId, range);
  return (
    <OperatingDashboard key={`${range.from}:${range.to}`} data={data} initialTab={params.tab} />
  );
}
