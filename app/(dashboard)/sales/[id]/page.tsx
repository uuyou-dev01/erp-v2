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
import { Button } from "@/components/ui/button";
import { shippingTaskStatusLabels } from "@/lib/application/order-shipping-progress";
import { SettleOrderDialog } from "@/components/sales/settle-order-dialog";
import { CorrectOrderCurrencyDialog } from "@/components/sales/correct-order-currency-dialog";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Handshake,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import Decimal from "decimal.js";
import {
  computeOrderDetailProfit,
  resolveAllocationCostCurrency,
} from "@/lib/application/order-detail-profit";
import { BackButton } from "@/components/shared/back-button";
import { fulfillmentDestinationLabel } from "@/lib/inventory/location-fulfillment";
import { canShipOrders } from "@/lib/auth/permissions";
import { getLatestFxRate } from "@/lib/fx";
import { parseShippingProof } from "@/lib/application/shipping-proof";

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
  CONFIRMED: "已成交 · 待发货",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  RETURNED: "已退货",
  CANCELLED: "已取消",
};

const shippingFeeStatusLabels: Record<string, string> = {
  PENDING: "待打包核算",
  ESTIMATED: "预估",
  ACTUAL: "实际",
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
  const preparation = parseShippingProof(order.shippingProof);
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
    order.lines.every((line) => {
      const allocatedQuantity = line.allocations
        .filter((allocation) => ["PENDING", "ALLOCATED"].includes(allocation.status))
        .reduce((sum, allocation) => sum.plus(allocation.quantity.toString()), new Decimal(0));
      return allocatedQuantity.eq(line.quantity.toString());
    });
  const canCorrectCurrency =
    ["CONFIRMED", "SHIPPED"].includes(order.orderStatus) &&
    !order.settledAt &&
    !resale &&
    !resaleSettlement &&
    !order.fulfillmentRequests.length &&
    !order.afterSalesCases.length;
  const settlementBaseCurrency = order.settlementBaseCurrency ?? "CNY";
  const suggestedSettlementFxRate =
    order.settlementFxRate ??
    (order.currency === settlementBaseCurrency
      ? new Decimal(1)
      : await getLatestFxRate(order.currency, settlementBaseCurrency, new Date()));

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
    <div className="mx-auto w-full max-w-5xl space-y-5" data-testid="order-detail-workspace">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <BackButton label="" fallbackHref="/sales" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold" title={order.orderNumber}>
              {order.orderNumber || order.id.slice(0, 8)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.platform?.name || "未指定平台"}
              {channelAccount ? ` / ${channelAccount.name}` : ""} ·{" "}
              {new Date(order.orderDate).toLocaleDateString("zh-CN")} ·{" "}
              {order.customerName || "散客"}
            </p>
            {order.externalOrderNo && (
              <p className="mt-1 break-all text-xs text-muted-foreground">
                外部订单号：{order.externalOrderNo}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusColors[order.orderStatus as keyof typeof statusColors]}>
            {statusLabels[order.orderStatus] || order.orderStatus}
          </Badge>
          {canConfirm && <ConfirmOrderButton orderId={order.id} />}
          {order.orderStatus === "CONFIRMED" && canShipOrders(context.role) && (
            <Button asChild>
              <Link
                href={
                  resale && fulfillmentRequest
                    ? `/fulfillment/requests/${fulfillmentRequest.id}`
                    : `/workbench?open=customerOrder:${order.id}`
                }
              >
                去发货
              </Link>
            </Button>
          )}
          {order.orderStatus === "SHIPPED" && !order.settledAt && (
            <SettleOrderDialog
              orderId={order.id}
              currency={order.currency}
              defaultSalePrice={order.totalPaid.toString()}
              defaultPlatformFee={order.platformFee.toString()}
              defaultShippingFee={
                order.shippingFeeStatus === "PENDING" ? "" : order.shippingFee.toString()
              }
              defaultFeeRate={order.platform?.defaultFeeRate?.toString()}
              defaultFxRate={suggestedSettlementFxRate?.toString()}
              baseCurrency={settlementBaseCurrency}
              requireActualShippingFee={order.shippingFeeStatus === "PENDING"}
            />
          )}
          {canCorrectCurrency && (
            <CorrectOrderCurrencyDialog
              orderId={order.id}
              currency={order.currency}
              totalPaid={order.totalPaid.toString()}
              platformFee={order.platformFee.toString()}
              shippingFee={order.shippingFee.toString()}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3 text-sm">
        <span className="text-muted-foreground">
          {orderItemCount} 项商品 · 收货地：
          {order.shippingCountry ? fulfillmentDestinationLabel(order.shippingCountry) : "未指定"}
        </span>
        <span>
          成交金额{" "}
          <strong className="ml-2 text-lg tabular-nums">
            {formatCurrency(order.totalPaid, order.currency)}
          </strong>
        </span>
      </div>

      <section aria-label="发货进度" className="space-y-3 rounded-lg border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">发货安排</h2>
          <span className="text-xs text-muted-foreground">
            {shippingTaskStatusLabels[order.shippingProgress.status ?? ""] ||
              (resale ? "协作履约" : "待安排")}
          </span>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">发货仓库　</span>
            {order.shippingProgress.location
              ? `${order.shippingProgress.location.name} · ${order.shippingProgress.location.code}`
              : "待确定"}
          </div>
          <div>
            <span className="text-muted-foreground">执行人　</span>
            {order.shippingProgress.assigneeName || "待领取或指定"}
          </div>
        </div>
        {order.orderStatus === "CONFIRMED" && (
          <p className="text-xs text-muted-foreground">
            {resale
              ? "通过协作履约跟进发货。"
              : "库存已预留。进入发货面板可安排执行人、共享资料；实际发出后再确认。"}
          </p>
        )}
        {preparation.dispatchConfirmation && (
          <div className="space-y-1 border-t pt-3 text-sm">
            <p>实际发货：{preparation.dispatchConfirmation.actualShipper}</p>
            <p>
              系统确认：{preparation.dispatchConfirmation.confirmedByName} ·{" "}
              {new Date(preparation.dispatchConfirmation.confirmedAt).toLocaleString("zh-CN")}
            </p>
            <p className="text-muted-foreground">
              {preparation.dispatchConfirmation.mode === "ON_BEHALF"
                ? `代确认依据：${{ WECHAT: "微信告知", PHONE: "电话 / 口头告知", OTHER: "其他方式", SELF: "本人发货" }[preparation.dispatchConfirmation.basis]}`
                : "发货人本人确认"}
              {preparation.dispatchConfirmation.note
                ? ` · ${preparation.dispatchConfirmation.note}`
                : ""}
            </p>
          </div>
        )}
        {order.shippedAt && (
          <p className="text-sm">
            发货时间：{new Date(order.shippedAt).toLocaleString("zh-CN")}
            {order.trackingNo ? ` · 运单号 ${order.trackingNo}` : ""}
          </p>
        )}
        {order.settledAt && (
          <p className="text-xs text-muted-foreground">
            已结算：{new Date(order.settledAt).toLocaleString("zh-CN")}
          </p>
        )}
      </section>

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
                    {resale.supplyOfferItem.variantCode ||
                      resale.supplyOfferItem.sku?.code ||
                      "未设置规格编码"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p>
                    数量：
                    <strong>
                      {fulfillmentRequest ? formatQuantity(fulfillmentRequest.quantity) : "-"}
                    </strong>
                  </p>
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
            <div className="divide-y">
              {order.lines.map((line) => {
                const hasAllocation = line.allocations.length > 0;
                const allocatedQty = line.allocations.reduce(
                  (sum, alloc) => sum + parseFloat(alloc.quantity.toString()),
                  0
                );
                const requiredQty = parseFloat(line.quantity.toString());
                const fullyAllocated = allocatedQty >= requiredQty;

                return (
                  <div key={line.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-medium">{line.sku.name}</p>
                          <Badge variant={fullyAllocated ? "default" : "secondary"}>
                            {line.supplyStatus === "UNFULFILLED"
                              ? "待分配"
                              : line.supplyStatus === "ALLOCATED_FROM_STOCK"
                                ? "已分配"
                                : line.supplyStatus === "CONSUMED"
                                  ? "已出库"
                                  : line.supplyStatus === "READY_TO_SHIP"
                                    ? "待发货"
                                    : line.supplyStatus}
                          </Badge>
                        </div>
                        <p className="break-all text-xs text-muted-foreground">
                          SKU {line.sku.code}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
                      <details className="rounded-md bg-muted/40 px-3 py-2" open={canEdit}>
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          库存来源与成本
                        </summary>
                        <div className="space-y-2">
                          {line.allocations.map((alloc) => (
                            <div
                              key={alloc.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-sm"
                            >
                              <span>
                                {alloc.inventoryLot?.location.name || "单件库存"}（
                                {alloc.inventoryLot?.location.code || alloc.itemUnit?.unitCode}） ·{" "}
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
                      </details>
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

      {preparation.imageUrls?.length || preparation.pickupCode || preparation.proofNote ? (
        <details className="rounded-lg border" open={order.orderStatus === "CONFIRMED"}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            发货前资料
            {preparation.imageUrls?.length ? `（${preparation.imageUrls.length} 张）` : ""}
          </summary>
          {preparation.imageUrls?.length || preparation.pickupCode || preparation.proofNote ? (
            <section className="min-w-0 px-4 pb-4" aria-label="发货前资料">
              <p className="mt-1 text-sm text-muted-foreground">
                货主与发货方共享的二维码、付款码或取件截图。点击图片查看原图；上传资料不代表已经发货。
              </p>
              {preparation.pickupCode && (
                <p className="mt-2 break-all text-sm">取件码：{preparation.pickupCode}</p>
              )}
              {preparation.proofNote && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {preparation.proofNote}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                {preparation.imageUrls?.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="查看发货前资料原图"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="发货前资料"
                      className="h-20 w-20 rounded-md border object-contain"
                    />
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </details>
      ) : null}
      <details className="group rounded-lg border" data-testid="order-financial-details">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
          <span className="flex items-center gap-2">
            金额与利润明细
            <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180" />
          </span>
          {!resale && (
            <span className="text-muted-foreground">
              {order.settledAt ? "净利润" : "预计利润"} {formatCurrency(netProfit, order.currency)}
            </span>
          )}
        </summary>
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
                  <Link
                    href={`/marketplace/${resale.supplyOffer.id}`}
                    className="mt-1 inline-flex items-center gap-1 font-medium hover:underline"
                  >
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
                    <Link
                      href={`/fulfillment/requests/${fulfillmentRequest.id}`}
                      className="mt-1 inline-flex items-center gap-1 font-medium hover:underline"
                    >
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
                    <Link
                      href={`/finance/settlements/${resaleSettlement.id}`}
                      className="mt-1 inline-flex items-center gap-1 font-medium hover:underline"
                    >
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
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(order.totalPaid, order.currency)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:block">
                  <span className="text-muted-foreground">平台费</span>
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(order.platformFee, order.currency)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:block">
                  <span className="text-muted-foreground">约定供货价</span>
                  <p className="font-semibold tabular-nums">
                    {resale.supplyUnitPrice
                      ? formatCurrency(
                          resale.supplyUnitPrice,
                          resale.supplyCurrency || order.currency
                        )
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
                  <div
                    key={item.label}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {item.label}
                      {item.label === "运费" ? (
                        <Badge variant="outline" className="font-normal">
                          {shippingFeeStatusLabels[order.shippingFeeStatus] ||
                            order.shippingFeeStatus}
                        </Badge>
                      ) : null}
                    </span>
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
      </details>
    </div>
  );
}
