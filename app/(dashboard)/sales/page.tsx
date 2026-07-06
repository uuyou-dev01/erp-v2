import { getCustomerOrders } from "@/app/actions/customer-orders";
import { getPlatforms } from "@/app/actions/platforms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { StatCard } from "@/components/shared/stat-card";
import { SalesImportButton } from "@/components/sales/sales-import-button";
import {
  Plus,
  Package,
  ShoppingBag,
  CheckCircle,
  Truck,
  CircleDollarSign,
  ClipboardCheck,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/decimal";
import { summarizeSalesOrders } from "@/lib/application/sales-metrics";
import {
  marketLabel,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";
import { cn } from "@/lib/utils";

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
type PlatformRow = Awaited<ReturnType<typeof getPlatforms>>[number];

const marketOrder: SellableMarketCode[] = ["CN", "JP", "US", "GLOBAL", "UNKNOWN"];

function marketFromPlatform(platform?: Pick<PlatformRow, "country" | "code"> | null): SellableMarketCode {
  const country = platform?.country?.toUpperCase();
  if (country === "CN" || country === "JP" || country === "US" || country === "GLOBAL") {
    return country;
  }

  const code = platform?.code?.toUpperCase() ?? "";
  if (["XIAN_YU", "TAOBAO", "TMALL", "JD", "PINDUODUO", "DOUYIN", "XIAOHONGSHU", "ALIBABA_1688"].includes(code)) {
    return "CN";
  }
  if (["MERCARI", "YAHOO_AUCTION", "YAHOO_SHOPPING", "SNKRDUNK", "RAKUTEN", "AMAZON_JP", "ZOZOTOWN"].includes(code)) {
    return "JP";
  }
  if (["EBAY", "AMAZON", "SHOPIFY"].includes(code)) {
    return "US";
  }
  return "UNKNOWN";
}

function parseMarket(value?: string): SellableMarketCode | undefined {
  if (!value) return undefined;
  return marketOrder.includes(value as SellableMarketCode)
    ? (value as SellableMarketCode)
    : undefined;
}

function salesHref(params: { market?: SellableMarketCode; platform?: string }) {
  const search = new URLSearchParams();
  if (params.market) search.set("market", params.market);
  if (params.platform) search.set("platform", params.platform);
  const query = search.toString();
  return query ? `/sales?${query}` : "/sales";
}

function shortMoney(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  if (amount >= 10000) return `${(amount / 10000).toFixed(1)}万`;
  return amount.toFixed(0);
}

function MiniBar({
  label,
  value,
  max,
  meta,
}: {
  label: string;
  value: number;
  max: number;
  meta?: string;
}) {
  const width = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 text-muted-foreground">{meta ?? `${value} 单`}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary/80" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; market?: string }>;
}) {
  const { platform: platformFilter, market } = await searchParams;
  const marketFilter = parseMarket(market);
  const [allOrders, platforms] = await Promise.all([
    getCustomerOrders(STORE_ID),
    getPlatforms(STORE_ID),
  ]);

  const marketOrders = marketFilter
    ? allOrders.filter((o) => marketFromPlatform(o.platform) === marketFilter)
    : allOrders;
  const orders = platformFilter
    ? marketOrders.filter((o) => o.platformId === platformFilter)
    : marketOrders;

  const filteredOrderSummary = summarizeSalesOrders(orders);
  const marketSummary = marketOrder
    .map((marketCode) => {
      const rows = allOrders.filter((o) => marketFromPlatform(o.platform) === marketCode);
      const summary = summarizeSalesOrders(rows);
      return {
        market: marketCode,
        label: marketLabel(marketCode),
        count: rows.length,
        total: summary.totalRevenue.toFixed(2),
      };
    })
    .filter((row) => row.count > 0 || row.market === "UNKNOWN");
  const platformSummaryForMarket = summarizeSalesOrders(marketOrders);
  const platformSales = platforms
    .filter((p) => !marketFilter || marketFromPlatform(p) === marketFilter)
    .map((p) => {
      const total =
        platformSummaryForMarket.platformSales.find((row) => row.platformId === p.id)?.total ?? "0.00";
      return {
        id: p.id,
        name: p.name,
        market: marketFromPlatform(p),
        total,
        count: marketOrders.filter((order) => order.platformId === p.id).length,
      };
    });
  const maxMarketCount = Math.max(1, ...marketSummary.map((row) => row.count));
  const maxPlatformCount = Math.max(1, ...platformSales.map((row) => row.count));
  const statusRows = [
    { status: "DRAFT", label: "草稿", hint: "内部录入，尚未确认成交" },
    { status: "PLACED", label: "已下单", hint: "平台/客户已产生订单" },
    { status: "PAID", label: "已付款", hint: "已付款，等待确认履约" },
    { status: "CONFIRMED", label: "待发货", hint: "已确认，等待出库/发货" },
    { status: "SHIPPED", label: "运输中", hint: "已发货" },
    { status: "DELIVERED", label: "已完成", hint: "已送达/完成" },
  ].map((row) => ({
    ...row,
    count: orders.filter((order) => order.orderStatus === row.status).length,
  }));
  const maxStatusCount = Math.max(1, ...statusRows.map((row) => row.count));

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => ["DRAFT", "PLACED", "PAID"].includes(o.orderStatus)).length,
    confirmed: orders.filter((o) => o.orderStatus === "CONFIRMED").length,
    shipped: orders.filter((o) => o.orderStatus === "SHIPPED").length,
    delivered: orders.filter((o) => o.orderStatus === "DELIVERED").length,
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
      cell: (row) => (
        <div className="space-y-1">
          <div>{row.platform?.name || <span className="text-muted-foreground">-</span>}</div>
          {row.platform && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {marketLabel(marketFromPlatform(row.platform))}
            </Badge>
          )}
        </div>
      ),
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
          <p className="text-muted-foreground">
            销售订单是成交后的履约单据，用来跟踪确认、扣库存、发货和收入，不只代表已完成订单。
          </p>
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

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="总订单数"
          value={stats.total}
          subtitle="当前筛选下履约单"
          icon={ShoppingBag}
        />
        <StatCard
          title="待确认"
          value={stats.pending}
          subtitle="草稿/已下单/已付款"
          icon={Package}
          iconColor="text-yellow-500"
        />
        <StatCard
          title="待发货"
          value={stats.confirmed}
          subtitle="已确认，待出库"
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
          title="已完成"
          value={stats.delivered}
          subtitle="已送达/完成"
          icon={ClipboardCheck}
          iconColor="text-emerald-500"
        />
        <StatCard
          title="有效销售额"
          value={`¥${stats.totalRevenue.toFixed(2)}`}
          subtitle="已确认/已发货/已送达"
          icon={CircleDollarSign}
          iconColor="text-emerald-500"
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">地区与平台</h2>
              <p className="text-xs text-muted-foreground">
                按平台所属市场查看订单，销售额沿用当前系统币种汇总。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={salesHref({})}>
                <Button variant={!marketFilter ? "default" : "outline"} size="sm">
                  全部市场
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">
                    {allOrders.length}
                  </Badge>
                </Button>
              </Link>
              {marketSummary.map((row) => (
                <Link key={row.market} href={salesHref({ market: row.market })}>
                  <Button
                    variant={marketFilter === row.market ? "default" : "outline"}
                    size="sm"
                    className={cn(row.count === 0 && "text-muted-foreground")}
                  >
                    {row.label}
                    <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">
                      {row.count}
                    </Badge>
                  </Button>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                地区订单结构
              </div>
              <div className="space-y-3">
                {marketSummary.map((row) => (
                  <MiniBar
                    key={row.market}
                    label={row.label}
                    value={row.count}
                    max={maxMarketCount}
                    meta={`${row.count} 单 · ¥${shortMoney(row.total)}`}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                平台订单结构
              </div>
              <div className="space-y-3">
                {platformSales.length > 0 ? (
                  platformSales.map((row) => (
                    <MiniBar
                      key={row.id}
                      label={row.name}
                      value={row.count}
                      max={maxPlatformCount}
                      meta={`${row.count} 单 · ${marketLabel(row.market)}`}
                    />
                  ))
                ) : (
                  <p className="py-5 text-center text-xs text-muted-foreground">
                    当前市场暂无平台
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                订单状态说明
              </div>
              <div className="space-y-3">
                {statusRows.map((row) => (
                  <div key={row.status} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-muted-foreground">{row.count} 单</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-slate-700/80"
                        style={{
                          width: `${maxStatusCount > 0 ? Math.max(6, Math.round((row.count / maxStatusCount) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{row.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={salesHref({ market: marketFilter })}>
          <Button
            variant={!platformFilter ? "default" : "outline"}
            size="sm"
          >
            全部
            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">
              {marketOrders.length}
            </Badge>
          </Button>
        </Link>
        {platformSales.map((p) => (
          <Link key={p.id} href={salesHref({ market: marketFilter, platform: p.id })}>
            <Button
              variant={platformFilter === p.id ? "default" : "outline"}
              size="sm"
            >
              {p.name}
              {Number(p.total) > 0 && (
                <span className="ml-2 text-[10px] opacity-70">
                  ¥{Number(p.total).toFixed(0)}
                </span>
              )}
            </Button>
          </Link>
        ))}
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
