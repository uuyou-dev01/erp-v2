import { getPurchaseOrders } from "@/app/actions/purchase-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { StatCard } from "@/components/shared/stat-card";
import { ProcurementAnalytics } from "@/components/procurement/procurement-analytics";
import {
  Plus,
  ShoppingCart,
  Package,
  CheckCircle,
  CalendarDays,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/decimal";
import Decimal from "decimal.js";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

const statusColors = {
  DRAFT: "secondary",
  ORDERED: "default",
  SHIPPED: "outline",
  RECEIVED: "outline",
  RETURNED: "destructive",
  CANCELLED: "destructive",
} as const;

const statusLabels: Record<string, string> = {
  DRAFT: "草稿",
  ORDERED: "已下单",
  SHIPPED: "在途",
  RECEIVED: "已收货",
  RETURNED: "已退货",
  CANCELLED: "已取消",
};

type OrderRow = Awaited<ReturnType<typeof getPurchaseOrders>>[number];

function safeToDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveOrderDate(order: OrderRow): Date {
  return safeToDate(order.orderedAt) ?? safeToDate(order.createdAt) ?? new Date();
}

function getQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

function toCnyAmount(order: OrderRow): Decimal | null {
  const amount = new Decimal(order.totalAmount);
  const currency = order.currency.toUpperCase();

  if (currency === "CNY") return amount;

  if (order.fxRate) {
    const fx = new Decimal(order.fxRate);
    if (fx.gt(0)) return amount.times(fx);
  }

  return null;
}

const columns: Column<OrderRow>[] = [
  {
    key: "orderNo",
    header: "订单号",
    mobileLabel: "订单号",
    cell: (row) => <span className="font-medium">{row.orderNo}</span>,
  },
  {
    key: "supplier",
    header: "供应商",
    mobileLabel: "供应商",
    cell: (row) =>
      row.supplierName || <span className="text-muted-foreground">-</span>,
    hideOnMobile: true,
  },
  {
    key: "lineCount",
    header: "商品数",
    mobileLabel: "商品",
    cell: (row) => `${row.lines.length} 项`,
  },
  {
    key: "totalAmount",
    header: "总金额",
    mobileLabel: "金额",
    cell: (row) => formatCurrency(row.totalAmount, row.currency),
  },
  {
    key: "status",
    header: "状态",
    mobileLabel: "状态",
    cell: (row) => (
      <Badge variant={statusColors[row.status as keyof typeof statusColors]}>
        {statusLabels[row.status] ?? row.status}
      </Badge>
    ),
  },
  {
    key: "orderedAt",
    header: "下单时间",
    mobileLabel: "日期",
    cell: (row) =>
      row.orderedAt
        ? new Date(row.orderedAt).toLocaleDateString("zh-CN")
        : "-",
    hideOnMobile: true,
  },
  {
    key: "actions",
    header: "操作",
    mobileLabel: "",
    className: "text-right",
    cell: (row) => (
      <Link href={`/procurement/${row.id}`}>
        <Button variant="ghost" size="sm">
          查看
        </Button>
      </Link>
    ),
  },
];

export default async function ProcurementPage() {
  const orders = await getPurchaseOrders(STORE_ID);
  const now = new Date();
  const currentQuarter = getQuarter(now);

  const currencyTotals = new Map<string, { amount: Decimal; orderCount: number }>();
  const supplierTotals = new Map<string, number>();

  let thisMonthOrderCount = 0;
  let thisQuarterOrderCount = 0;
  let thisMonthAmountCny = new Decimal(0);
  let unconvertedOrderCount = 0;

  for (const order of orders) {
    const orderDate = resolveOrderDate(order);
    const amount = new Decimal(order.totalAmount);
    const currency = order.currency.toUpperCase();

    const currencyAgg = currencyTotals.get(currency);
    if (!currencyAgg) {
      currencyTotals.set(currency, { amount, orderCount: 1 });
    } else {
      currencyAgg.amount = currencyAgg.amount.plus(amount);
      currencyAgg.orderCount += 1;
    }

    const supplierName = order.supplierName?.trim() || "未填写供应商";
    supplierTotals.set(supplierName, (supplierTotals.get(supplierName) ?? 0) + 1);

    const cnyAmount = toCnyAmount(order);
    if (!cnyAmount && currency !== "CNY" && amount.gt(0)) {
      unconvertedOrderCount += 1;
    }

    if (
      orderDate.getFullYear() === now.getFullYear() &&
      orderDate.getMonth() === now.getMonth()
    ) {
      thisMonthOrderCount += 1;
      if (cnyAmount) thisMonthAmountCny = thisMonthAmountCny.plus(cnyAmount);
    }

    if (
      orderDate.getFullYear() === now.getFullYear() &&
      getQuarter(orderDate) === currentQuarter
    ) {
      thisQuarterOrderCount += 1;
    }
  }

  const monthlyStartDates = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return d;
  });

  const monthlyMap = new Map<
    string,
    { period: string; amountCny: Decimal; orderCount: number; receivedCount: number }
  >();
  for (const date of monthlyStartDates) {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthlyMap.set(key, {
      period: `${date.getMonth() + 1}月`,
      amountCny: new Decimal(0),
      orderCount: 0,
      receivedCount: 0,
    });
  }

  for (const order of orders) {
    const orderDate = resolveOrderDate(order);
    const monthlyKey = `${orderDate.getFullYear()}-${orderDate.getMonth()}`;
    const cnyAmount = toCnyAmount(order);

    const monthlyAgg = monthlyMap.get(monthlyKey);
    if (monthlyAgg) {
      monthlyAgg.orderCount += 1;
      if (order.status === "RECEIVED") monthlyAgg.receivedCount += 1;
      if (cnyAmount) monthlyAgg.amountCny = monthlyAgg.amountCny.plus(cnyAmount);
    }
  }

  const monthlyDataWithKey = Array.from(monthlyMap.entries()).map(([key, item]) => ({
    key: key
      .split("-")
      .map((part, idx) => (idx === 1 ? String(Number(part) + 1).padStart(2, "0") : part))
      .join("-"),
    period: item.period,
    amountCny: item.amountCny.toNumber(),
    orderCount: item.orderCount,
    receivedCount: item.receivedCount,
  }));

  const supplierData = Array.from(supplierTotals.entries())
    .map(([name, orderCount]) => ({ name, orderCount }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 6);

  const currencySummary = Array.from(currencyTotals.entries())
    .sort((a, b) => b[1].amount.comparedTo(a[1].amount))
    .map(([currency, entry]) =>
      `${formatCurrency(entry.amount, currency)}（${entry.orderCount} 单）`
    )
    .join(" / ");

  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.status === "DRAFT").length,
    ordered: orders.filter((o) => o.status === "ORDERED").length,
    shipped: orders.filter((o) => o.status === "SHIPPED").length,
    received: orders.filter((o) => o.status === "RECEIVED").length,
    thisMonthOrderCount,
    thisQuarterOrderCount,
    thisMonthAmountCny,
    pendingReceiveCount: orders.filter(
      (o) => o.status === "ORDERED" || o.status === "SHIPPED"
    ).length,
    overallReceiveRate:
      orders.length > 0
        ? ((orders.filter((o) => o.status === "RECEIVED").length / orders.length) * 100).toFixed(1)
        : "0.0",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">采购管理</h1>
          <p className="text-muted-foreground">管理采购订单和供应商</p>
        </div>
        <Link href="/procurement/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新建采购单
          </Button>
        </Link>
      </div>

      {/* 核心统计 */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="采购订单总数"
          value={stats.total}
          subtitle={`草稿 ${stats.draft} / 待收货 ${stats.pendingReceiveCount}（含在途 ${stats.shipped}）/ 已收货 ${stats.received}`}
          icon={ShoppingCart}
          iconColor="text-muted-foreground"
        />
        <StatCard
          title="本月采购金额（CNY）"
          value={formatCurrency(stats.thisMonthAmountCny, "CNY")}
          subtitle={`${stats.thisMonthOrderCount} 笔采购单`}
          icon={CalendarDays}
          iconColor="text-brand-blue"
        />
        <StatCard
          title="待收货采购单"
          value={stats.pendingReceiveCount}
          subtitle={`本季度共 ${stats.thisQuarterOrderCount} 笔下单`}
          icon={Truck}
          iconColor="text-brand-blue"
        />
        <StatCard
          title="当前收货完成率"
          value={`${stats.overallReceiveRate}%`}
          subtitle="按采购单状态计算"
          icon={CheckCircle}
          iconColor="text-green-500"
        />
        <StatCard
          title="采购金额汇总（原币种）"
          value={currencySummary || "-"}
          subtitle="按订单币种分别汇总"
          icon={Package}
          iconColor="text-orange-500"
        />
      </div>

      {unconvertedOrderCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          有 {unconvertedOrderCount} 笔外币订单缺少汇率，未计入 CNY 趋势图金额。
        </p>
      ) : null}

      <ProcurementAnalytics
        monthlyData={monthlyDataWithKey}
        supplierData={supplierData}
      />

      <Card>
        <CardHeader>
          <CardTitle>采购订单</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={columns}
            data={orders}
            keyExtractor={(row) => row.id}
            emptyState={
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">暂无采购订单</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  创建第一个采购订单开始管理库存
                </p>
                <Link href="/procurement/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    新建采购单
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
