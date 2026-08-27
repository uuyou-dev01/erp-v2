import { requireUserContext } from "@/lib/auth/user-context";
import Link from "next/link";
import { getCustomerOrderById } from "@/app/actions/customer-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { AddOrderLineDialog } from "@/components/sales/add-order-line-dialog";
import { AllocateInventoryForm } from "@/components/sales/allocate-inventory-form";
import { ConfirmOrderButton } from "@/components/sales/confirm-order-button";
import { MarkOrderShippedButton } from "@/components/sales/mark-order-shipped-button";
import { SettleOrderDialog } from "@/components/sales/settle-order-dialog";
import {
  ShoppingCart,
  Package,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Store,
  Handshake,
  ExternalLink,
} from "lucide-react";
import Decimal from "decimal.js";
import {
  computeOrderDetailProfit,
  resolveAllocationCostCurrency,
} from "@/lib/application/order-detail-profit";
import { BackButton } from "@/components/shared/back-button";
import { fulfillmentDestinationLabel } from "@/lib/inventory/location-fulfillment";
import { canShipOrders } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

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

export default async function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireUserContext();
  const { activeStoreId: storeId } = context;
  const { id } = await params;
  const order = await getCustomerOrderById(id);

  if (!order) {
    notFound();
  }

  const resale = order.resaleListing;
  const fulfillmentRequest = order.fulfillmentRequests[0];
  const resaleSettlement =
    fulfillmentRequest?.settlements.find((settlement) => settlement.status !== "VOID") ??
    order.settlements.find((settlement) => settlement.status !== "VOID");
  const orderItemCount = order.lines.length || (resale?.supplyOfferItem ? 1 : 0);
  const channelAccount = order.salesChannelAccount ?? resale?.salesChannelAccount;
  const supplyPartnerName =
    resale?.supplyOffer.providerOrganization?.name ??
    resale?.supplyOffer.organization?.name ??
    resale?.supplyOffer.ownerPartner?.name ??
    "供货方待确认";

  const canEdit = order.orderStatus === "DRAFT";
  const canConfirm =
    order.orderStatus === "DRAFT" &&
    order.lines.length > 0 &&
    order.lines.every((line) => line.allocations.length > 0);

  // --- Profit breakdown ---
  const totalPaid = new Decimal(order.totalPaid.toString());
  const subtotal = new Decimal(order.subtotal.toString());

  const defaultPlatformFeeRate = order.platform?.defaultFeeRate
    ? new Decimal(order.platform.defaultFeeRate.toString())
    : new Decimal(0);

  const existingPlatformFee = new Decimal(order.platformFee.toString());
  const existingShippingFee = new Decimal(order.shippingFee.toString());
  const platformFeeRate =
    existingPlatformFee.gt(0) && subtotal.gt(0)
      ? existingPlatformFee.div(subtotal)
      : defaultPlatformFeeRate;

  const platformFee = existingPlatformFee.gt(0)
    ? existingPlatformFee
    : subtotal.times(platformFeeRate);
  const shippingFee = existingShippingFee;

  const profitSummary = await computeOrderDetailProfit({
    storeId: order.storeId,
    orderCurrency: order.currency,
    orderDate: order.orderDate,
    totalPaid,
    subtotal,
    platformFee,
    shippingFee,
    lines: order.lines.map((line) => ({
      id: line.id,
      lineAmount: line.lineAmount.toString(),
      allocations: line.allocations.map((allocation) => ({
        costAmount: allocation.costAmount.toString(),
        costCurrency: resolveAllocationCostCurrency({
          orderCurrency: order.currency,
          inventoryLot: allocation.inventoryLot,
          itemUnit: allocation.itemUnit,
        }),
        effectiveAt:
          allocation.inventoryLot?.receivedAt ?? allocation.itemUnit?.createdAt ?? order.orderDate,
      })),
    })),
  });
  const inventoryCost = profitSummary.inventoryCost;
  const netRevenue = profitSummary.netRevenue;
  const netProfit = profitSummary.grossProfit;

  const profitItems = [
    { label: "销售收入", value: totalPaid, color: "text-foreground" },
    { label: "平台费", value: platformFee.negated(), color: "text-red-600" },
    { label: "运费", value: shippingFee.negated(), color: "text-red-600" },
    { label: "净收入", value: netRevenue, color: "text-foreground" },
    { label: "库存成本", value: inventoryCost.negated(), color: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <BackButton label="" fallbackHref="/sales" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">订单: {order.id.slice(0, 8)}</h1>
            <p className="text-muted-foreground">{order.externalOrderNo || "无外部订单号"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canConfirm && <ConfirmOrderButton orderId={order.id} />}
          {order.orderStatus === "CONFIRMED" && canShipOrders(context.role) && (
            <MarkOrderShippedButton orderId={order.id} defaultTrackingNo={order.trackingNo} />
          )}
          {order.orderStatus === "SHIPPED" && !order.settledAt && (
            <SettleOrderDialog
              orderId={order.id}
              currency={order.currency}
              defaultSalePrice={order.totalPaid.toString()}
              defaultPlatformFee={order.platformFee.toString()}
              defaultShippingFee={order.shippingFee.toString()}
              defaultFeeRate={order.platform?.defaultFeeRate?.toString()}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">状态</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={statusColors[order.orderStatus as keyof typeof statusColors]}>
              {statusLabels[order.orderStatus] || order.orderStatus}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总金额</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(order.totalPaid, order.currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">商品数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderItemCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平台</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{order.platform?.name || "未指定"}</div>
            <p className="text-xs text-muted-foreground">
              {channelAccount ? `${channelAccount.name} · ` : ""}收货地：
              {order.shippingCountry
                ? fulfillmentDestinationLabel(order.shippingCountry)
                : "未指定"}
            </p>
          </CardContent>
        </Card>
      </div>

      {resale ? (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Handshake className="h-4 w-4 text-primary" />
                <CardTitle>代卖业务与协作履约</CardTitle>
              </div>
              <Badge>我方代卖</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">来源货盘</p>
                <Link href={`/marketplace/${resale.supplyOffer.id}`} className="mt-1 inline-flex items-center gap-1 font-medium hover:underline">
                  {resale.supplyOffer.title}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">供货方</p>
                <p className="mt-1 font-medium">{supplyPartnerName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">履约协作</p>
                {fulfillmentRequest ? (
                  <Link href={`/fulfillment/requests/${fulfillmentRequest.id}`} className="mt-1 inline-flex items-center gap-1 font-medium hover:underline">
                    {fulfillmentRequest.requestNo} · {fulfillmentRequest.status}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <p className="mt-1 font-medium text-destructive">履约请求缺失</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">合作结算</p>
                {resaleSettlement ? (
                  <Link href={`/finance/settlements/${resaleSettlement.id}`} className="mt-1 inline-flex items-center gap-1 font-medium hover:underline">
                    {resaleSettlement.settlementNo} · {resaleSettlement.status}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <p className="mt-1 font-medium">
                    {order.orderStatus === "SHIPPED" || order.orderStatus === "DELIVERED"
                      ? "待生成结算"
                      : "发货后生成"}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
              <div className="flex items-center justify-between gap-4 sm:block">
                <span className="text-muted-foreground">销售收入</span>
                <p className="font-semibold tabular-nums">{formatCurrency(order.totalPaid, order.currency)}</p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:block">
                <span className="text-muted-foreground">平台费</span>
                <p className="font-semibold tabular-nums">{formatCurrency(order.platformFee, order.currency)}</p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:block">
                <span className="text-muted-foreground">约定供货价</span>
                <p className="font-semibold tabular-nums">
                  {resale.supplyUnitPrice
                    ? formatCurrency(resale.supplyUnitPrice, resale.supplyCurrency || order.currency)
                    : "按结算单确认"}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              代卖订单的真实收益以合作结算单为准，不按本店库存成本估算。
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>利润分解</CardTitle>
              {netProfit.gte(0) ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {profitItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className={item.color}>
                    {item.value.lt(0) ? "- " : ""}
                    {formatCurrency(item.value.abs(), order.currency)}
                  </span>
                </div>
              ))}
              <div className="border-t pt-3 flex items-center justify-between font-semibold">
                <span>净利润</span>
                <span className={netProfit.gte(0) ? "text-green-600" : "text-red-600"}>
                  {netProfit.lt(0) ? "- " : ""}
                  {formatCurrency(netProfit.abs(), order.currency)}
                </span>
              </div>
              {order.platform && (
                <p className="text-xs text-muted-foreground pt-1">
                  平台费率 {platformFeeRate.times(100).toFixed(2)}% · 运费按实际配送方式记录
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <CardTitle>订单明细</CardTitle>
          {canEdit ? (
            <AddOrderLineDialog orderId={order.id} currency={order.currency} storeId={storeId} />
          ) : null}
        </CardHeader>
        <CardContent>
          {order.lines.length === 0 && resale?.supplyOfferItem ? (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{resale.supplyOfferItem.title}</p>
                    <Badge variant="outline">货盘商品</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {resale.supplyOfferItem.variantCode || resale.supplyOfferItem.sku?.code || "未设置规格编码"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p>数量：<strong>{fulfillmentRequest ? formatQuantity(fulfillmentRequest.quantity) : "-"}</strong></p>
                  <p className="mt-1 text-muted-foreground">
                    金额：{formatCurrency(order.subtotal, order.currency)}
                  </p>
                </div>
              </div>
            </div>
          ) : order.lines.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              暂无商品。可使用右上角“添加商品”补充订单明细。
            </div>
          ) : (
            <div className="space-y-6">
              {order.lines.map((line) => {
                const hasAllocation = line.allocations.length > 0;
                const allocatedQty = line.allocations.reduce(
                  (sum, alloc) => sum + parseFloat(alloc.quantity.toString()),
                  0
                );
                const requiredQty = parseFloat(line.quantity.toString());
                const fullyAllocated = allocatedQty >= requiredQty;

                return (
                  <div key={line.id} className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{line.sku.code}</p>
                          <Badge variant={fullyAllocated ? "default" : "secondary"}>
                            {line.supplyStatus === "UNFULFILLED"
                              ? "待分配"
                              : line.supplyStatus === "ALLOCATED_FROM_STOCK"
                                ? "已分配"
                                : line.supplyStatus === "CONSUMED"
                                  ? "已消耗"
                                  : line.supplyStatus}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{line.sku.name}</p>
                        <div className="mt-2 flex gap-4 text-sm">
                          <span>
                            数量: <strong>{formatQuantity(line.quantity)}</strong>
                          </span>
                          {line.unitPrice && (
                            <span>
                              单价:{" "}
                              <strong>{formatCurrency(line.unitPrice, order.currency)}</strong>
                            </span>
                          )}
                          <span>
                            金额: <strong>{formatCurrency(line.lineAmount, order.currency)}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {hasAllocation && (
                      <div className="rounded-lg bg-muted p-3">
                        <p className="mb-2 text-sm font-medium">库存分配：</p>
                        <div className="space-y-2">
                          {line.allocations.map((alloc) => (
                            <div
                              key={alloc.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span>
                                {alloc.inventoryLot?.location.code} ·{" "}
                                {formatQuantity(alloc.quantity)} 件
                              </span>
                              <span className="text-muted-foreground">
                                成本:{" "}
                                {formatCurrency(
                                  alloc.costAmount,
                                  resolveAllocationCostCurrency({
                                    orderCurrency: order.currency,
                                    inventoryLot: alloc.inventoryLot,
                                    itemUnit: alloc.itemUnit,
                                  })
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!fullyAllocated && canEdit && (
                      <div className="rounded-lg border border-orange-500/50 bg-orange-500/10 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <p className="text-sm font-medium">
                            需要分配库存 ({allocatedQty}/{requiredQty})
                          </p>
                        </div>
                        <AllocateInventoryForm
                          orderLineId={line.id}
                          skuId={line.skuId}
                          skuCode={line.sku.code}
                          requiredQty={(requiredQty - allocatedQty).toString()}
                          storeId={storeId}
                          shippingCountry={order.shippingCountry}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {order.orderStatus === "CONFIRMED" && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Package className="h-5 w-5 text-green-500" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">订单已确认，待发货</p>
                <p className="text-muted-foreground">
                  {resale
                    ? "货盘数量已预留，发货进度由协作履约同步。"
                    : "库存已预留，确认发货后将扣减库存。"} 确认时间：
                  {order.confirmedAt && new Date(order.confirmedAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {order.orderStatus === "SHIPPED" && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Package className="h-5 w-5 text-blue-500" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">已发货</p>
                <p className="text-muted-foreground">
                  {order.trackingNo ? `物流单号：${order.trackingNo} · ` : ""}
                  发货时间：
                  {order.shippedAt && new Date(order.shippedAt).toLocaleDateString("zh-CN")}
                  {order.settledAt
                    ? ` · 已结算（${new Date(order.settledAt).toLocaleDateString("zh-CN")}）`
                    : " · 待结算手续费/邮费"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
