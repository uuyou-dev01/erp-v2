import {
  getBusinessOverview,
  getInventoryReport,
  getSalesReport,
  getMonthlyPnL,
  getPlatformBreakdown,
  getFeeDetails,
} from "@/app/actions/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Package,
  ShoppingCart,
  TrendingUp,
  Warehouse,
  DollarSign,
  Globe,
  CheckCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { InventoryChart } from "@/components/reports/inventory-chart";
import { SalesChart } from "@/components/reports/sales-chart";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { MonthlyPnLChart } from "@/components/reports/monthly-pnl-chart";
import { PlatformPieChart } from "@/components/reports/platform-pie-chart";
import { FeeDetailTable } from "@/components/reports/fee-detail-table";
import { CsvExportButton } from "@/components/reports/csv-export-button";
import { ChartCard } from "@/components/shared/chart-card";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

function computeDateRange(
  range?: string,
  from?: string,
  to?: string,
): { dateFrom: Date; dateTo: Date } {
  const now = new Date();
  let dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  let dateTo = now;

  switch (range) {
    case "lastMonth":
      dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      dateTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case "thisQuarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      dateFrom = new Date(now.getFullYear(), q, 1);
      break;
    }
    case "custom":
      if (from) dateFrom = new Date(from);
      if (to) dateTo = new Date(to + "T23:59:59.999Z");
      break;
  }

  return { dateFrom, dateTo };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { dateFrom, dateTo } = computeDateRange(
    params.range,
    params.from,
    params.to,
  );
  const dateRange = { dateFrom, dateTo };

  const [overview, inventoryReport, salesReport, monthlyPnL, platformBreakdown, feeDetails] =
    await Promise.all([
      getBusinessOverview(STORE_ID, dateRange),
      getInventoryReport(STORE_ID, dateRange),
      getSalesReport(STORE_ID, dateRange),
      getMonthlyPnL(STORE_ID),
      getPlatformBreakdown(STORE_ID, dateRange),
      getFeeDetails(STORE_ID, dateRange),
    ]);

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">报表分析</h1>
          <p className="text-muted-foreground">业务数据分析和可视化报表</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/reports/team" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Users className="h-4 w-4" />
            团队工作量
          </Link>
          <DateRangePicker />
          <CsvExportButton overview={overview} pnl={monthlyPnL} />
        </div>
      </div>

      {/* 业务概览 */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">业务概览</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">库存总值</CardTitle>
              <Warehouse className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ¥{overview.inventory.totalValue}
              </div>
              <p className="text-xs text-muted-foreground">
                {overview.inventory.lotCount} 入库库存 +{" "}
                {overview.inventory.itemCount} 单品
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">采购总额</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ¥{overview.procurement.totalAmount}
              </div>
              <p className="text-xs text-muted-foreground">
                {overview.procurement.orderCount} 订单，
                {overview.procurement.receivedCount} 已收货
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">销售总额</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ¥{overview.sales.totalAmount}
              </div>
              <p className="text-xs text-muted-foreground">
                {overview.sales.orderCount} 订单，
                {overview.sales.confirmedCount} 已确认
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">上架商品</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {overview.listing.activeCount}
              </div>
              <p className="text-xs text-muted-foreground">
                共 {overview.listing.totalCount} 个上架记录
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 月度收支 */}
      <ChartCard title="月度收支概览" timeRanges={[]}>
        <MonthlyPnLChart data={monthlyPnL} />
      </ChartCard>

      {/* 平台分析 + 库存分布 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>平台销售占比</CardTitle>
          </CardHeader>
          <CardContent>
            <PlatformPieChart data={platformBreakdown} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>库存分布（按位置）</CardTitle>
          </CardHeader>
          <CardContent>
            <InventoryChart data={inventoryReport.byLocation} />
          </CardContent>
        </Card>
      </div>

      {/* 库存状态 + 销售趋势 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>库存状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm">可用入库库存</span>
                </div>
                <span className="text-sm font-medium">
                  {inventoryReport.byStatus.active}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-brand-blue" />
                  <span className="text-sm">可用单品</span>
                </div>
                <span className="text-sm font-medium">
                  {inventoryReport.byStatus.available}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-brand-pink" />
                  <span className="text-sm">已分配</span>
                </div>
                <span className="text-sm font-medium">
                  {inventoryReport.byStatus.allocated}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">已消耗</span>
                </div>
                <span className="text-sm font-medium">
                  {inventoryReport.byStatus.consumed}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>销售趋势（按月）</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart data={salesReport.byMonth} />
          </CardContent>
        </Card>
      </div>

      {/* 费用明细 */}
      <Card>
        <CardHeader>
          <CardTitle>费用明细</CardTitle>
        </CardHeader>
        <CardContent>
          <FeeDetailTable data={feeDetails} />
        </CardContent>
      </Card>
    </div>
  );
}
