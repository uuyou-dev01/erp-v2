import { getCustomerOrders } from "@/app/actions/customer-orders";
import { getPlatforms } from "@/app/actions/platforms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { StatCard } from "@/components/shared/stat-card";
import { SalesImportButton } from "@/components/sales/sales-import-button";
import { Plus, Package, ShoppingBag, CheckCircle, Truck, CircleDollarSign } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/decimal";
import { summarizeSalesOrders } from "@/lib/application/sales-metrics";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

const statusColors = {
  DRAFT: "secondary",
  PLACED: "default",
  PAID: "default",
  CONFIRMED: "outline",
  SHIPPED: "outline",
  DELIVERED: "outline",
  RETURNED: "destructive",
  CANCELLED: "destructive",
} as const;

const statusLabels: Record<string, string> = {
  DRAFT: "草稿",
  PLACED: "已下单",
  PAID: "已付款",
  CONFIRMED: "已确认",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  RETURNED: "已退货",
  CANCELLED: "已取消",
};

type OrderRow = Awaited<ReturnType<typeof getCustomerOrders>>[number];

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const { platform: platformFilter } = await searchParams;
  const [allOrders, platforms] = await Promise.all([
    getCustomerOrders(STORE_ID),
    getPlatforms(STORE_ID),
  ]);

  const orders = platformFilter
    ? allOrders.filter((o) => o.platformId === platformFilter)
    : allOrders;

  const allOrderSummary = summarizeSalesOrders(allOrders);
  const filteredOrderSummary = summarizeSalesOrders(orders);
  const platformSales = platforms.map((p) => {
    const total =
      allOrderSummary.platformSales.find((row) => row.platformId === p.id)?.total ?? "0.00";
    return { id: p.id, name: p.name, total };
  });

  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.orderStatus === "DRAFT").length,
    confirmed: orders.filter((o) => o.orderStatus === "CONFIRMED").length,
    shipped: orders.filter((o) => o.orderStatus === "SHIPPED").length,
    totalRevenue: filteredOrderSummary.totalRevenue,
  };

  const columns: Column<OrderRow>[] = [
    {
      key: "id",
      header: "订单ID",
      cell: (row) => (
        <span className="font-medium font-mono text-xs">{row.id.slice(0, 8)}</span>
      ),
    },
    {
      key: "external",
      header: "外部订单号",
      cell: (row) =>
        row.externalOrderNo || <span className="text-muted-foreground">-</span>,
      hideOnMobile: true,
    },
    {
      key: "platform",
      header: "平台",
      cell: (row) => row.platform?.name || <span className="text-muted-foreground">-</span>,
    },
    {
      key: "items",
      header: "商品数",
      cell: (row) => `${row.lines.length} 项`,
    },
    {
      key: "total",
      header: "总金额",
      cell: (row) => formatCurrency(row.totalPaid, row.currency),
    },
    {
      key: "status",
      header: "状态",
      cell: (row) => (
        <Badge
          variant={statusColors[row.orderStatus as keyof typeof statusColors]}
        >
          {statusLabels[row.orderStatus] || row.orderStatus}
        </Badge>
      ),
    },
    {
      key: "date",
      header: "创建时间",
      cell: (row) => new Date(row.createdAt).toLocaleDateString("zh-CN"),
      hideOnMobile: true,
    },
    {
      key: "action",
      header: "操作",
      className: "text-right",
      cell: (row) => (
        <Link href={`/sales/${row.id}`}>
          <Button variant="ghost" size="sm">
            查看
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">销售管理</h1>
          <p className="text-muted-foreground">管理客户订单和发货</p>
        </div>
        <div className="flex items-center gap-2">
          <SalesImportButton storeId={STORE_ID} />
          <Link href="/sales/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新建订单
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard
          title="总订单数"
          value={stats.total}
          subtitle="所有客户订单"
          icon={ShoppingBag}
        />
        <StatCard
          title="待处理"
          value={stats.draft}
          subtitle="草稿订单"
          icon={Package}
          iconColor="text-yellow-500"
        />
        <StatCard
          title="已确认"
          value={stats.confirmed}
          subtitle="等待发货"
          icon={CheckCircle}
          iconColor="text-green-500"
        />
        <StatCard
          title="已发货"
          value={stats.shipped}
          subtitle="运输中"
          icon={Truck}
          iconColor="text-blue-500"
        />
        <StatCard
          title="有效销售额"
          value={`¥${stats.totalRevenue.toFixed(2)}`}
          subtitle="已确认/已发货/已送达"
          icon={CircleDollarSign}
          iconColor="text-emerald-500"
        />
      </div>

      {/* 平台 Tab 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/sales">
          <Button
            variant={!platformFilter ? "default" : "outline"}
            size="sm"
          >
            全部
            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">
              {allOrders.length}
            </Badge>
          </Button>
        </Link>
        {platforms.map((p) => {
          const ps = platformSales.find((s) => s.id === p.id);
          return (
            <Link key={p.id} href={`/sales?platform=${p.id}`}>
              <Button
                variant={platformFilter === p.id ? "default" : "outline"}
                size="sm"
              >
                {p.name}
                {ps && Number(ps.total) > 0 && (
                  <span className="ml-2 text-[10px] opacity-70">
                    ¥{Number(ps.total).toFixed(0)}
                  </span>
                )}
              </Button>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>客户订单</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={columns}
            data={orders}
            keyExtractor={(row) => row.id}
            emptyState={
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">暂无订单</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  创建第一个客户订单
                </p>
                <Link href="/sales/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    新建订单
                  </Button>
                </Link>
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
