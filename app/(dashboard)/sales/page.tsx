import { shippingTaskStatusLabels } from "@/lib/application/order-shipping-progress";
import Link from "next/link";
import {
  AlertTriangle,
  CircleDollarSign,
  Handshake,
  Package,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import { getCustomerOrders } from "@/app/actions/customer-orders";
import { getPlatforms } from "@/app/actions/platforms";
import { SalesImportButton } from "@/components/sales/sales-import-button";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  deriveSalesOrderWorkbenchState,
  orderMatchesSalesWorkbenchView,
  parseSalesWorkbenchView,
  type SalesWorkbenchView,
} from "@/lib/application/sales-order-workbench";
import { requireUserContext } from "@/lib/auth/user-context";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const orderStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  PLACED: "已下单",
  PAID: "已付款",
  CONFIRMED: "待发货",
  SHIPPED: "运输中",
  DELIVERED: "已完成",
  RETURNED: "已退货",
  CANCELLED: "已取消",
};

const fulfillmentStatusLabels: Record<string, string> = {
  REQUESTED: "待供货方接单",
  ACCEPTED: "供货方已接单",
  REJECTED: "供货方已拒绝",
  SHIPPED: "供货方已发货",
  DELIVERED: "协作已送达",
  CANCELLED: "协作已取消",
  EXCEPTION: "履约异常",
};

const settlementStatusLabels: Record<string, string> = {
  NOT_READY: "未到结算",
  PENDING: "待结算",
  DRAFT: "结算草稿",
  CONFIRMED: "待线下结清",
  PAID: "已结清",
  VOID: "已作废",
};

const fulfillmentModeLabels: Record<string, string> = {
  SELF_SHIPS: "我方发货",
  SUPPLIER_SHIPS: "供货方代发",
  PLATFORM_SHIPS: "平台发货",
  RESELLER_SHIPS: "代卖方提货发货",
  SELF_PICKUP: "自提",
  UNKNOWN: "待确认履约方",
};

type OrderRow = Awaited<ReturnType<typeof getCustomerOrders>>[number];

type SalesSearchParams = {
  q?: string;
  view?: string;
  mode?: string;
  status?: string;
  platform?: string;
};

function buildSalesHref(current: SalesSearchParams, updates: Partial<SalesSearchParams>) {
  const merged = { ...current, ...updates };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/sales?${query}` : "/sales";
}

function businessPartnerName(order: OrderRow) {
  const offer = order.resaleListing?.supplyOffer;
  return (
    offer?.providerOrganization?.name ??
    offer?.organization?.name ??
    offer?.ownerPartner?.name ??
    "供货方待确认"
  );
}

function itemSummary(order: OrderRow) {
  if (order.lines.length > 0) {
    const first = order.lines[0];
    const totalQuantity = order.lines.reduce(
      (sum, line) => sum + Number(line.quantity.toString()),
      0
    );
    return {
      title: first.sku.name,
      meta: `${order.lines.length} 项 · ${totalQuantity} 件`,
    };
  }

  const resaleItem = order.resaleListing?.supplyOfferItem;
  const quantity = order.fulfillmentRequests[0]?.quantity;
  return {
    title: resaleItem?.title ?? order.resaleListing?.title ?? "商品待补充",
    meta: `${resaleItem?.variantCode ? `${resaleItem.variantCode} · ` : ""}${quantity ? `${formatQuantity(quantity)} 件` : "数量待确认"}`,
  };
}

function orderMatchesSearch(order: OrderRow, query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("zh-CN");
  const haystack = [
    order.orderNumber,
    order.externalOrderNo,
    order.customerName,
    order.platform?.name,
    order.salesChannelAccount?.name,
    order.resaleListing?.title,
    order.resaleListing?.supplyOffer.title,
    order.resaleListing?.supplyOfferItem?.title,
    ...order.lines.flatMap((line) => [line.sku.code, line.sku.name]),
    ...order.fulfillmentRequests.flatMap((request) => [request.requestNo, request.trackingNo]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-CN");
  return haystack.includes(normalized);
}

function statusBadgeVariant(status: string) {
  if (["RETURNED", "CANCELLED", "REJECTED", "EXCEPTION"].includes(status)) {
    return "destructive" as const;
  }
  if (["CONFIRMED", "ACCEPTED", "SHIPPED"].includes(status)) return "default" as const;
  return "secondary" as const;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SalesSearchParams>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const params = await searchParams;
  const view = parseSalesWorkbenchView(params.view);
  const query = params.q?.trim() ?? "";
  const mode = params.mode === "DIRECT" || params.mode === "RESALE" ? params.mode : "";
  const status = params.status && orderStatusLabels[params.status] ? params.status : "";

  const [allOrders, platforms] = await Promise.all([
    getCustomerOrders(storeId),
    getPlatforms(storeId),
  ]);

  const orderStates = new Map(
    allOrders.map((order) => [order.id, deriveSalesOrderWorkbenchState(order)])
  );
  const counts = {
    all: allOrders.length,
    todo: allOrders.filter((order) => orderMatchesSalesWorkbenchView(order, "todo")).length,
    shipment: allOrders.filter((order) => orderMatchesSalesWorkbenchView(order, "shipment")).length,
    collaboration: allOrders.filter((order) =>
      orderMatchesSalesWorkbenchView(order, "collaboration")
    ).length,
    exception: allOrders.filter((order) => orderMatchesSalesWorkbenchView(order, "exception"))
      .length,
    settlement: allOrders.filter((order) => orderMatchesSalesWorkbenchView(order, "settlement"))
      .length,
  };

  const orders = allOrders.filter((order) => {
    const state = orderStates.get(order.id)!;
    return (
      orderMatchesSalesWorkbenchView(order, view) &&
      (!mode || state.businessMode === mode) &&
      (!status || order.orderStatus === status) &&
      (!params.platform || order.platformId === params.platform) &&
      orderMatchesSearch(order, query)
    );
  });

  const currentParams: SalesSearchParams = {
    q: query || undefined,
    view: view === "all" ? undefined : view,
    mode: mode || undefined,
    status: status || undefined,
    platform: params.platform || undefined,
  };

  const views: Array<{
    key: SalesWorkbenchView;
    label: string;
    count: number;
    icon: typeof Package;
  }> = [
    { key: "all", label: "全部订单", count: counts.all, icon: Package },
    { key: "todo", label: "待我处理", count: counts.todo, icon: Package },
    { key: "shipment", label: "待发货", count: counts.shipment, icon: Truck },
    { key: "collaboration", label: "协作中", count: counts.collaboration, icon: Handshake },
    { key: "exception", label: "异常", count: counts.exception, icon: AlertTriangle },
    { key: "settlement", label: "待结算", count: counts.settlement, icon: CircleDollarSign },
  ];

  const columns: Column<OrderRow>[] = [
    {
      key: "order",
      header: "订单",
      className: "min-w-[180px]",
      cell: (order) => (
        <div className="space-y-1">
          <Link href={`/sales/${order.id}`} className="font-medium hover:underline">
            {order.externalOrderNo || order.orderNumber}
          </Link>
          <p className="text-xs text-muted-foreground">
            {order.customerName} · {new Date(order.orderDate).toLocaleDateString("zh-CN")}
          </p>
        </div>
      ),
    },
    {
      key: "business",
      header: "业务",
      className: "min-w-[160px]",
      cell: (order) => {
        const state = orderStates.get(order.id)!;
        return (
          <div className="space-y-1.5">
            <Badge variant={state.businessMode === "RESALE" ? "default" : "outline"}>
              {state.businessMode === "RESALE" ? "我方代卖" : "自营销售"}
            </Badge>
            <p className="max-w-[180px] truncate text-xs text-muted-foreground">
              {state.businessMode === "RESALE"
                ? businessPartnerName(order)
                : order.salesChannelAccount?.name || "本店库存"}
            </p>
          </div>
        );
      },
    },
    {
      key: "items",
      header: "商品",
      className: "min-w-[180px]",
      cell: (order) => {
        const summary = itemSummary(order);
        return (
          <div className="space-y-1">
            <p className="max-w-[220px] truncate font-medium">{summary.title}</p>
            <p className="text-xs text-muted-foreground">{summary.meta}</p>
          </div>
        );
      },
    },
    {
      key: "channel",
      header: "渠道",
      hideOnMobile: true,
      cell: (order) => (
        <div className="space-y-1">
          <p>{order.platform?.name || "线下/未指定"}</p>
          <p className="text-xs text-muted-foreground">
            {order.salesChannelAccount?.name ||
              order.resaleListing?.salesChannelAccount?.name ||
              "账号未关联"}
          </p>
        </div>
      ),
    },
    {
      key: "fulfillment",
      header: "履约",
      className: "min-w-[160px]",
      cell: (order) => {
        const state = orderStates.get(order.id)!;
        const request = order.fulfillmentRequests[0];
        return (
          <div className="space-y-1">
            <p className="font-medium">
              {state.businessMode === "DIRECT"
                ? order.shippingProgress.location
                  ? `仓库发货 · ${order.shippingProgress.location.name}`
                  : "待安排发货"
                : fulfillmentModeLabels[state.fulfillmentMode] || state.fulfillmentMode}
            </p>
            <p
              className={cn(
                "text-xs text-muted-foreground",
                state.isException && "font-medium text-destructive"
              )}
            >
              {request
                ? fulfillmentStatusLabels[request.status] || request.status
                : state.businessMode === "DIRECT"
                  ? `${order.shippingProgress.assigneeName || "未指定执行人"} · ${shippingTaskStatusLabels[order.shippingProgress.status ?? ""] || "待安排"}`
                  : "履约请求待建立"}
            </p>
          </div>
        );
      },
    },
    {
      key: "amount",
      header: "金额",
      className: "whitespace-nowrap",
      cell: (order) => (
        <div className="space-y-1">
          <p className="font-medium tabular-nums">
            {formatCurrency(order.totalPaid, order.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {settlementStatusLabels[orderStates.get(order.id)!.settlementStatus] ||
              orderStates.get(order.id)!.settlementStatus}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "状态",
      className: "whitespace-nowrap",
      cell: (order) => (
        <Badge variant={statusBadgeVariant(order.orderStatus)}>
          {orderStatusLabels[order.orderStatus] || order.orderStatus}
        </Badge>
      ),
    },
    {
      key: "action",
      header: "下一步",
      className: "whitespace-nowrap text-right",
      cell: (order) => {
        const action = orderStates.get(order.id)!.nextAction;
        return (
          <Link href={action.href}>
            <Button variant={action.emphasis === "primary" ? "default" : "ghost"} size="sm">
              {action.label}
            </Button>
          </Link>
        );
      },
    },
  ];

  const hasFilters = Boolean(query || mode || status || params.platform || view !== "all");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">销售订单</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            处理自营与代卖成交，跟进库存、协作履约和结算。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SalesImportButton storeId={storeId} />
          <Link href="/sales/new">
            <Button>
              <Plus className="h-4 w-4" />
              新建订单
            </Button>
          </Link>
        </div>
      </div>

      <nav
        aria-label="订单工作视图"
        className="grid overflow-hidden rounded-lg border bg-background sm:grid-cols-3 xl:grid-cols-6"
      >
        {views.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <Link
              key={item.key}
              href={buildSalesHref(currentParams, {
                view: item.key === "all" ? undefined : item.key,
              })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 items-center gap-3 border-b px-4 transition-colors hover:bg-muted/50 sm:border-r xl:border-b-0",
                active && "bg-primary/[0.06] shadow-[inset_0_-2px_0_hsl(var(--primary))]",
                item.key === "exception" && item.count > 0 && "text-destructive"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{item.count}</p>
              </div>
            </Link>
          );
        })}
      </nav>

      <form
        method="get"
        className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 lg:flex-row lg:items-center"
      >
        {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="搜索订单号、客户、商品、货盘或物流单号"
            className="bg-background pl-9"
            aria-label="搜索销售订单"
          />
        </div>
        <Select
          name="mode"
          defaultValue={mode}
          className="h-9 bg-background lg:w-36"
          aria-label="业务类型"
        >
          <option value="">全部业务</option>
          <option value="DIRECT">自营销售</option>
          <option value="RESALE">我方代卖</option>
        </Select>
        <Select
          name="status"
          defaultValue={status}
          className="h-9 bg-background lg:w-36"
          aria-label="订单状态"
        >
          <option value="">全部状态</option>
          {Object.entries(orderStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          name="platform"
          defaultValue={params.platform || ""}
          className="h-9 bg-background lg:w-44"
          aria-label="销售平台"
        >
          <option value="">全部平台</option>
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          筛选
        </Button>
        {hasFilters ? (
          <Link href="/sales">
            <Button type="button" variant="ghost" size="sm">
              重置
            </Button>
          </Link>
        ) : null}
      </form>

      <section
        className="overflow-hidden rounded-lg border bg-background"
        aria-labelledby="sales-order-list-title"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 id="sales-order-list-title" className="text-sm font-semibold">
              订单列表
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              当前显示 {orders.length} / {allOrders.length} 单
            </p>
          </div>
        </div>
        <ResponsiveTable
          columns={columns}
          data={orders}
          keyExtractor={(order) => order.id}
          emptyState={
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <Package className="mb-3 h-9 w-9 text-muted-foreground/60" />
              <h3 className="font-medium">当前视图没有订单</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters
                  ? "可以调整筛选条件，或返回全部订单。"
                  : "成交或录入订单后会出现在这里。"}
              </p>
              {hasFilters ? (
                <Link href="/sales" className="mt-4">
                  <Button variant="outline" size="sm">
                    查看全部订单
                  </Button>
                </Link>
              ) : null}
            </div>
          }
        />
      </section>
    </div>
  );
}
