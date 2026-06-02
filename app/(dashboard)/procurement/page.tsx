import { getPurchaseOrders } from "@/app/actions/purchase-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/shared/stat-card";
import { ProcurementAnalytics } from "@/components/procurement/procurement-analytics";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  ShoppingCart,
  Package,
  CheckCircle,
  CalendarDays,
  Truck,
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import Decimal from "decimal.js";
import { CURRENCIES } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";
const ALL_CURRENCIES = "all";
const currencyLabels = Object.fromEntries(CURRENCIES.map((c) => [c.value, c.label]));

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
type PeriodKey = "thisMonth" | "nextMonth" | "custom" | "all";
type SortKey = "date" | "amount" | "supplier" | "status" | "items" | "currency";
type SortDir = "asc" | "desc";
type SearchParamValue = string | string[] | undefined;

function safeToDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveOrderDate(order: OrderRow): Date {
  return safeToDate(order.orderedAt) ?? safeToDate(order.createdAt) ?? new Date();
}

function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDateInput(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrencyLabel(value: string): string {
  if (value === ALL_CURRENCIES) return "全部币种";
  return currencyLabels[value] ?? value;
}

function resolveDateRange(
  period: PeriodKey,
  fromValue: string | undefined,
  toValue: string | undefined,
  now: Date
) {
  if (period === "all") {
    return { start: null, end: null, label: "全部时间" };
  }

  if (period === "nextMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end: addMonths(start, 1), label: "下个月" };
  }

  if (period === "custom") {
    const start = parseDateInput(fromValue);
    const to = parseDateInput(toValue);
    return {
      start,
      end: to ? addDays(to, 1) : null,
      label: start || to ? "指定时间段" : "指定时间段（未设置）",
    };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: addMonths(start, 1), label: "本月" };
}

function isInDateRange(order: OrderRow, start: Date | null, end: Date | null): boolean {
  const orderDate = resolveOrderDate(order);
  if (start && orderDate < start) return false;
  if (end && orderDate >= end) return false;
  return true;
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

function summarizeOrder(order: OrderRow): string {
  if (order.lines.length === 0) return "暂无采购明细";
  const preview = order.lines
    .slice(0, 3)
    .map((line) => `${line.sku.name || line.sku.code} × ${formatQuantity(line.quantity)}`)
    .join(" / ");
  return order.lines.length > 3 ? `${preview} ...` : preview;
}

function getSortValue(order: OrderRow, sort: SortKey): string | number {
  if (sort === "date") return resolveOrderDate(order).getTime();
  if (sort === "amount") return Number(order.totalAmount);
  if (sort === "supplier") return order.supplierName || "";
  if (sort === "status") return statusLabels[order.status] ?? order.status;
  if (sort === "items") return order.lines.length;
  return getCurrencyLabel(order.currency);
}

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const params = (await searchParams) ?? {};
  const orders = await getPurchaseOrders(STORE_ID);
  const now = new Date();
  const period = (firstParam(params.period) as PeriodKey) || "thisMonth";
  const normalizedPeriod: PeriodKey = ["thisMonth", "nextMonth", "custom", "all"].includes(period)
    ? period
    : "thisMonth";
  const currencyParam = firstParam(params.currency);
  const selectedCurrency =
    currencyParam && currencyParam !== ALL_CURRENCIES
      ? currencyParam.toUpperCase()
      : ALL_CURRENCIES;
  const sort = (firstParam(params.sort) as SortKey) || "date";
  const normalizedSort: SortKey = [
    "date",
    "amount",
    "supplier",
    "status",
    "items",
    "currency",
  ].includes(sort)
    ? sort
    : "date";
  const dir = firstParam(params.dir) === "asc" ? "asc" : "desc";
  const from = firstParam(params.from);
  const to = firstParam(params.to);
  const range = resolveDateRange(normalizedPeriod, from, to, now);

  const timeFilteredOrders = orders.filter((order) => isInDateRange(order, range.start, range.end));
  const currencyOptions = Array.from(
    timeFilteredOrders.reduce((map, order) => {
      const currency = order.currency.toUpperCase();
      const prev = map.get(currency) ?? 0;
      map.set(currency, prev + 1);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => getCurrencyLabel(a[0]).localeCompare(getCurrencyLabel(b[0]), "zh-CN"));

  const filteredOrders =
    selectedCurrency === ALL_CURRENCIES
      ? timeFilteredOrders
      : timeFilteredOrders.filter((order) => order.currency.toUpperCase() === selectedCurrency);

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const aValue = getSortValue(a, normalizedSort);
    const bValue = getSortValue(b, normalizedSort);
    const result =
      typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), "zh-CN");
    return dir === "asc" ? result : -result;
  });

  const currencyTotals = new Map<string, { amount: Decimal; orderCount: number }>();
  const supplierTotals = new Map<string, number>();

  let periodOrderCount = 0;
  let periodAmountCny = new Decimal(0);
  let unconvertedOrderCount = 0;

  for (const order of filteredOrders) {
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

    periodOrderCount += 1;
    if (cnyAmount) periodAmountCny = periodAmountCny.plus(cnyAmount);
  }

  const firstMonth = range.start ?? new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const lastMonth = range.end
    ? new Date(range.end.getFullYear(), range.end.getMonth(), 1)
    : addMonths(firstMonth, 6);
  const monthlyStartDates: Date[] = [];
  for (
    let cursor = new Date(firstMonth.getFullYear(), firstMonth.getMonth(), 1);
    cursor < lastMonth && monthlyStartDates.length < 18;
    cursor = addMonths(cursor, 1)
  ) {
    monthlyStartDates.push(cursor);
  }

  const monthlyMap = new Map<
    string,
    { period: string; amountCny: Decimal; orderCount: number; receivedCount: number }
  >();
  for (const date of monthlyStartDates) {
    const key = monthKey(date);
    monthlyMap.set(key, {
      period: `${date.getMonth() + 1}月`,
      amountCny: new Decimal(0),
      orderCount: 0,
      receivedCount: 0,
    });
  }

  for (const order of filteredOrders) {
    const orderDate = resolveOrderDate(order);
    const monthlyKey = monthKey(orderDate);
    const cnyAmount = toCnyAmount(order);

    const monthlyAgg = monthlyMap.get(monthlyKey);
    if (monthlyAgg) {
      monthlyAgg.orderCount += 1;
      if (order.status === "RECEIVED") monthlyAgg.receivedCount += 1;
      if (cnyAmount) monthlyAgg.amountCny = monthlyAgg.amountCny.plus(cnyAmount);
    }
  }

  const monthlyDataWithKey = Array.from(monthlyMap.entries()).map(([key, item]) => ({
    key,
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
    .map(([currency, entry]) => ({
      currency,
      amount: entry.amount,
      orderCount: entry.orderCount,
    }));
  const breakdownData =
    selectedCurrency === ALL_CURRENCIES
      ? currencySummary.map((entry) => ({
          name: entry.currency,
          orderCount: entry.orderCount,
        }))
      : supplierData;
  const breakdownTitle =
    selectedCurrency === ALL_CURRENCIES ? "币种采购单占比" : "供应商采购单占比";

  const stats = {
    total: filteredOrders.length,
    draft: filteredOrders.filter((o) => o.status === "DRAFT").length,
    ordered: filteredOrders.filter((o) => o.status === "ORDERED").length,
    shipped: filteredOrders.filter((o) => o.status === "SHIPPED").length,
    received: filteredOrders.filter((o) => o.status === "RECEIVED").length,
    periodOrderCount,
    periodAmountCny,
    pendingReceiveCount: filteredOrders.filter(
      (o) => o.status === "ORDERED" || o.status === "SHIPPED"
    ).length,
    overallReceiveRate:
      filteredOrders.length > 0
        ? (
            (filteredOrders.filter((o) => o.status === "RECEIVED").length / filteredOrders.length) *
            100
          ).toFixed(1)
        : "0.0",
  };

  const buildHref = (overrides: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const entries: Record<string, string | undefined> = {
      currency: selectedCurrency,
      period: normalizedPeriod,
      from,
      to,
      sort: normalizedSort,
      dir,
    };
    for (const [key, value] of Object.entries({ ...entries, ...overrides })) {
      if (value && value !== ALL_CURRENCIES) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/procurement?${query}` : "/procurement";
  };
  const periodOptions: Array<{ value: PeriodKey; label: string }> = [
    { value: "thisMonth", label: "这个月" },
    { value: "nextMonth", label: "下个月" },
    { value: "custom", label: "指定时间段" },
    { value: "all", label: "全部时间" },
  ];

  const SortableHead = ({
    label,
    sortKey,
    className,
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) => {
    const active = normalizedSort === sortKey;
    const nextDir: SortDir = active && dir === "asc" ? "desc" : "asc";
    const Icon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ArrowDownUp;
    return (
      <TableHead className={className}>
        <Link
          href={buildHref({ sort: sortKey, dir: nextDir })}
          className="inline-flex items-center gap-1 text-foreground hover:text-primary"
        >
          {label}
          <Icon className="h-3.5 w-3.5" />
        </Link>
      </TableHead>
    );
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

      <Card>
        <CardHeader>
          <CardTitle>筛选范围</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link href={buildHref({ currency: ALL_CURRENCIES })}>
              <Button
                variant={selectedCurrency === ALL_CURRENCIES ? "default" : "outline"}
                size="sm"
              >
                全部币种
                <span className="text-xs opacity-70">{timeFilteredOrders.length}</span>
              </Button>
            </Link>
            {currencyOptions.map(([currency, count]) => (
              <Link key={currency} href={buildHref({ currency })}>
                <Button variant={selectedCurrency === currency ? "default" : "outline"} size="sm">
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  {getCurrencyLabel(currency)}
                  <span className="text-xs opacity-70">{count}</span>
                </Button>
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <Link
                key={option.value}
                href={buildHref({
                  period: option.value,
                  from: option.value === "custom" ? (from ?? null) : null,
                  to: option.value === "custom" ? (to ?? null) : null,
                })}
              >
                <Button
                  variant={normalizedPeriod === option.value ? "default" : "outline"}
                  size="sm"
                >
                  {option.label}
                </Button>
              </Link>
            ))}
          </div>
          {normalizedPeriod === "custom" ? (
            <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" action="/procurement">
              {selectedCurrency !== ALL_CURRENCIES && (
                <input type="hidden" name="currency" value={selectedCurrency} />
              )}
              <input type="hidden" name="period" value="custom" />
              <input type="hidden" name="sort" value={normalizedSort} />
              <input type="hidden" name="dir" value={dir} />
              <Input type="date" name="from" defaultValue={from} aria-label="开始日期" />
              <Input type="date" name="to" defaultValue={to} aria-label="结束日期" />
              <Button type="submit">应用时间段</Button>
            </form>
          ) : null}
          <p className="text-xs text-muted-foreground">
            当前查看：{range.label} / {getCurrencyLabel(selectedCurrency)}
          </p>
        </CardContent>
      </Card>

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
          title={`${range.label}采购金额（CNY）`}
          value={formatCurrency(stats.periodAmountCny, "CNY")}
          subtitle={`${stats.periodOrderCount} 笔采购单（可换算）`}
          icon={CalendarDays}
          iconColor="text-brand-blue"
        />
        <StatCard
          title="待收货采购单"
          value={stats.pendingReceiveCount}
          subtitle={`${range.label}共 ${stats.periodOrderCount} 笔下单`}
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">采购金额汇总（原币种）</CardTitle>
            <Package className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {currencySummary.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无金额</p>
            ) : (
              <div className="space-y-1.5">
                {currencySummary.map((entry) => (
                  <div key={entry.currency} className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      {entry.currency}
                    </span>
                    <span className="truncate text-sm font-semibold">
                      {formatCurrency(entry.amount, entry.currency)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {entry.orderCount} 单
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">按订单币种分别汇总</p>
          </CardContent>
        </Card>
      </div>

      {unconvertedOrderCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          有 {unconvertedOrderCount} 笔外币订单缺少汇率，未计入 CNY 趋势图金额。
        </p>
      ) : null}

      <ProcurementAnalytics
        monthlyData={monthlyDataWithKey}
        breakdownData={breakdownData}
        breakdownTitle={breakdownTitle}
        scopeLabel={getCurrencyLabel(selectedCurrency)}
      />

      <Card>
        <CardHeader>
          <CardTitle>采购订单</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无采购订单</h3>
              <p className="mb-4 text-sm text-muted-foreground">创建第一个采购订单开始管理库存</p>
              <Link href="/procurement/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  新建采购单
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px]">内容简报</TableHead>
                    <SortableHead label="币种" sortKey="currency" />
                    <SortableHead label="供应商" sortKey="supplier" />
                    <SortableHead label="商品数" sortKey="items" />
                    <SortableHead label="总金额" sortKey="amount" />
                    <SortableHead label="状态" sortKey="status" />
                    <SortableHead label="下单时间" sortKey="date" />
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="max-w-[320px]">
                        <div className="space-y-1">
                          <p className="truncate font-medium">{summarizeOrder(order)}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {order.orderNo}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getCurrencyLabel(order.currency)}</TableCell>
                      <TableCell>
                        {order.supplierName || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>{order.lines.length} 项</TableCell>
                      <TableCell>{formatCurrency(order.totalAmount, order.currency)}</TableCell>
                      <TableCell>
                        <Badge variant={statusColors[order.status as keyof typeof statusColors]}>
                          {statusLabels[order.status] ?? order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.orderedAt
                          ? new Date(order.orderedAt).toLocaleDateString("zh-CN")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/procurement/${order.id}`}>
                          <Button variant="ghost" size="sm">
                            查看
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
