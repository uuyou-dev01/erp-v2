import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShoppingCart,
  FileText,
  Package,
  Store,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  getBusinessOverview,
  getDashboardMonthlyMetrics,
  getMonthlyPnL,
  getPlatformBreakdown,
} from "@/app/actions/reports";
import { getPurchaseOrders } from "@/app/actions/purchase-orders";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import {
  SalesTrendChart,
  PlatformPieChart,
} from "@/components/dashboard/dashboard-charts";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

const PO_STATUS_MAP: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "草稿", className: "bg-gray-100 text-gray-700 border-gray-200" },
  ORDERED: { label: "已下单", className: "bg-blue-100 text-blue-700 border-blue-200" },
  RECEIVED: { label: "已收货", className: "bg-green-100 text-green-700 border-green-200" },
  CANCELLED: { label: "已取消", className: "bg-red-100 text-red-700 border-red-200" },
};

function fmtCurrency(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function getMonthRange(month?: string) {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const normalized = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : fallback;
  const [year, monthIndex] = normalized.split("-").map(Number);
  const dateFrom = new Date(year, monthIndex - 1, 1);
  const dateTo = new Date(year, monthIndex, 0, 23, 59, 59, 999);

  return {
    month: normalized,
    dateFrom,
    dateTo,
  };
}

function shiftMonth(month: string, offset: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const monthRange = getMonthRange(params.month);
  const [overview, monthlyMetrics, purchaseOrders, monthlyPnL, platformBreakdown] =
    await Promise.all([
      getBusinessOverview(STORE_ID),
      getDashboardMonthlyMetrics(STORE_ID, {
        dateFrom: monthRange.dateFrom,
        dateTo: monthRange.dateTo,
      }),
      getPurchaseOrders(STORE_ID),
      getMonthlyPnL(STORE_ID, 6),
      getPlatformBreakdown(STORE_ID, {
        dateFrom: monthRange.dateFrom,
        dateTo: monthRange.dateTo,
      }),
    ]);

  const recentOrders = purchaseOrders.slice(0, 5);

  const trendData = monthlyPnL.map((d) => ({
    month: d.month,
    revenue: d.revenue,
    profit: d.profit,
  }));

  const pieData = platformBreakdown.map((p) => ({
    name: p.name,
    totalSales: p.totalSales,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">仪表盘</h1>
          <p className="text-muted-foreground">
            {formatMonthLabel(monthRange.month)}经营数据，按销售、采购、利润和动销查看。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard?month=${shiftMonth(monthRange.month, -1)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            上月
          </Link>
          <form action="/dashboard" className="flex items-center gap-2">
            <input
              type="month"
              name="month"
              defaultValue={monthRange.month}
              className="h-9 rounded-lg glass-input px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            />
            <button className={buttonVariants({ size: "sm" })} type="submit">
              查看
            </button>
          </form>
          <Link
            href={`/dashboard?month=${shiftMonth(monthRange.month, 1)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            下月
          </Link>
        </div>
      </div>

      {/* 统计卡片 */}
      <DashboardStats
        salesAmount={fmtCurrency(monthlyMetrics.salesAmount)}
        salesOrderCount={monthlyMetrics.salesOrderCount}
        purchaseAmount={fmtCurrency(monthlyMetrics.purchaseAmount)}
        purchaseOrderCount={monthlyMetrics.purchaseOrderCount}
        grossProfit={fmtCurrency(monthlyMetrics.grossProfit)}
        profitRate={`${monthlyMetrics.profitRate}%`}
        movingSkuRatio={`${monthlyMetrics.movingSkuRatio}%`}
        soldSkuCount={monthlyMetrics.soldSkuCount}
        stockedSkuCount={monthlyMetrics.stockedSkuCount}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">平台费</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{fmtCurrency(monthlyMetrics.platformFee)}</div>
            <p className="text-xs text-muted-foreground">已确认销售订单</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">物流/发货费</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{fmtCurrency(monthlyMetrics.shippingFee)}</div>
            <p className="text-xs text-muted-foreground">按订单记录费用</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">销售成本</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{fmtCurrency(monthlyMetrics.inventoryCost)}</div>
            <p className="text-xs text-muted-foreground">按库存分配成本</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">当前库存值</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{fmtCurrency(overview.inventory.totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              {overview.inventory.lotCount} 入库库存 · {overview.inventory.itemCount} 单品
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 图表区 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SalesTrendChart data={trendData} />
        <PlatformPieChart data={pieData} />
      </div>

      {/* 最近采购订单 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>最近采购订单</CardTitle>
            <Link
              href="/procurement"
              className="text-sm text-primary hover:underline"
            >
              查看全部
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              暂无采购订单
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead className="text-center">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => {
                  const s = PO_STATUS_MAP[order.status] ?? {
                    label: order.status,
                    className: "",
                  };
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          href={`/procurement/${order.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {order.orderNo}
                        </Link>
                      </TableCell>
                      <TableCell>{order.supplierName || "—"}</TableCell>
                      <TableCell className="text-right">
                        {fmtCurrency(order.totalAmount.toString())}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={s.className}>{s.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 快捷操作 */}
      <Card>
        <CardHeader>
          <CardTitle>快捷操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Link
              href="/procurement/new"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto flex-col gap-2 py-4",
              )}
            >
              <ShoppingCart className="h-5 w-5" />
              <span>新建采购单</span>
            </Link>
            <Link
              href="/sales/new"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto flex-col gap-2 py-4",
              )}
            >
              <FileText className="h-5 w-5" />
              <span>新建销售单</span>
            </Link>
            <Link
              href="/inventory/skus"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto flex-col gap-2 py-4",
              )}
            >
              <Package className="h-5 w-5" />
              <span>管理 SKU</span>
            </Link>
            <Link
              href="/listing"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto flex-col gap-2 py-4",
              )}
            >
              <Store className="h-5 w-5" />
              <span>管理上架</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
