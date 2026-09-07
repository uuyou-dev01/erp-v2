import { requireUserContext } from "@/lib/auth/user-context";
import Link from "next/link";
import {
  getPurchaseOrderById,
  getPurchaseReceiptInspectionSummary,
} from "@/app/actions/purchase-orders";
import { getLocations } from "@/app/actions/locations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notFound } from "next/navigation";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { AddPurchaseLineDialog } from "@/components/procurement/add-purchase-line-dialog";
import { ReceiveGoodsForm } from "@/components/procurement/receive-goods-form";
import { PurchaseOrderActions } from "@/components/procurement/purchase-order-actions";
import { PurchaseOrderBusinessDateEditor } from "@/components/procurement/purchase-order-business-date-editor";
import { QuickReceiveButton } from "@/components/procurement/quick-receive-button";
import { DeletePurchaseLineButton } from "@/components/procurement/delete-purchase-line-button";
import { BackButton } from "@/components/shared/back-button";
import { ProductImage } from "@/components/ui/product-image";
import { ShoppingCart, Package, Calendar, DollarSign } from "lucide-react";
import { PurchaseOrderFxForm } from "@/components/procurement/purchase-order-fx-form";
import { getLatestFxRate } from "@/lib/fx";
import Decimal from "decimal.js";
import { getChargeLedgerData } from "@/app/actions/charges";
import { ChargeRowActions } from "@/components/finance/charge-ledger-manager";
import { ChargeStatusBadge } from "@/components/finance/charge-status";
import { PurchaseCostAllocationForm } from "@/components/procurement/purchase-cost-allocation-form";
import { PurchaseReceiptInspectionForm } from "@/components/procurement/purchase-receipt-inspection-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { id } = await params;
  const order = await getPurchaseOrderById(id, storeId);
  const locations = await getLocations(storeId);

  if (!order) {
    notFound();
  }
  const inspectionSummary =
    order.status === "RECEIVED" ? await getPurchaseReceiptInspectionSummary(order.id) : [];
  const purchaseLineIds = order.lines.map((line) => line.id);
  const [actualUnits, actualLots] = purchaseLineIds.length
    ? await Promise.all([
        prisma.itemUnit.findMany({
          where: { storeId, sourceType: "PURCHASE", sourceId: { in: purchaseLineIds } },
          select: { sourceId: true },
          distinct: ["sourceId"],
        }),
        prisma.inventoryLot.findMany({
          where: { storeId, sourceType: "PURCHASE", sourceId: { in: purchaseLineIds } },
          select: { sourceId: true },
          distinct: ["sourceId"],
        }),
      ])
    : [[], []];
  const actualUnitLineIds = new Set(actualUnits.map((unit) => unit.sourceId));
  const actualLotLineIds = new Set(actualLots.map((lot) => lot.sourceId));
  const chargeData = await getChargeLedgerData({
    sourceType: "PURCHASE_ORDER",
    sourceId: order.id,
  });

  const canEdit = order.status === "DRAFT";
  const canReceive =
    (order.status === "ORDERED" || order.status === "SHIPPED") && order.lines.length > 0;
  const lineTotal = order.lines.reduce(
    (sum, line) => sum.plus(new Decimal(line.lineAmount)),
    new Decimal(0)
  );
  const allocatedFeeTotal = order.lines.reduce(
    (sum, line) =>
      sum.plus(new Decimal(line.allocatedFee)).minus(new Decimal(line.allocatedDiscount)),
    new Decimal(0)
  );
  const hasAmountMismatch = !lineTotal.eq(new Decimal(order.subtotal));
  const allocationMethodLabels: Record<string, string> = {
    LINE_PRICE: "按明细金额分摊",
    BY_QUANTITY: "按件数分摊",
    BY_VALUE: "按商品金额分摊",
    MANUAL: "手工分摊",
  };
  const suggestedFxRate =
    order.currency.toUpperCase() === "CNY"
      ? null
      : await getLatestFxRate(
          order.currency,
          "CNY",
          order.orderedAt ? new Date(order.orderedAt) : new Date(order.createdAt)
        );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <BackButton label="" className="mt-1" />
          <div>
            <h1 className="text-3xl font-bold">采购订单：{order.orderNo}</h1>
            <p className="text-muted-foreground">
              {order.supplierName || "未指定供应商"} / {order.currency}
            </p>
          </div>
        </div>
        <PurchaseOrderActions order={order} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">状态</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={statusColors[order.status as keyof typeof statusColors]}>
              {statusLabels[order.status] ?? order.status}
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
              {formatCurrency(order.totalAmount, order.currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">商品数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{order.lines.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">下单日期</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                {order.orderedAt
                  ? new Date(order.orderedAt).toLocaleDateString("zh-CN")
                  : "尚未下单"}
              </div>
              <PurchaseOrderBusinessDateEditor
                purchaseOrderId={order.id}
                orderedAt={order.orderedAt}
                costAllocationStatus={order.costAllocationStatus}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>订单信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">币种</p>
              <p className="text-lg">{order.currency}</p>
            </div>
            {order.fxRate && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  折算汇率（{order.currency} → CNY）
                </p>
                <p className="text-lg">
                  1 {order.currency} = {order.fxRate.toString()} CNY
                </p>
              </div>
            )}
          </div>
          {order.currency.toUpperCase() !== "CNY" ? (
            <PurchaseOrderFxForm
              orderId={order.id}
              currency={order.currency}
              currentRate={order.fxRate}
              suggestedRate={suggestedFxRate?.toFixed(8) ?? null}
            />
          ) : null}
          {order.costAllocationStatus === "PENDING" ? (
            <PurchaseCostAllocationForm
              purchaseOrderId={order.id}
              purchaseCurrency={order.currency}
              initialTotal={order.declaredTotalAmount}
            />
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
              成本已确认 · 分摊方式：
              {allocationMethodLabels[order.costAllocationMethod || ""] || "按明细单价"}
              {order.costAllocatedAt
                ? ` · ${new Date(order.costAllocatedAt).toLocaleString("zh-CN")}`
                : ""}
              {allocatedFeeTotal.gt(0)
                ? ` · 商品 ${formatCurrency(lineTotal, order.currency)} + 分摊费用 ${formatCurrency(allocatedFeeTotal, order.currency)} = 到岸总额 ${formatCurrency(order.totalAmount, order.currency)}`
                : ""}
            </div>
          )}
          {hasAmountMismatch ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              订单金额 {formatCurrency(order.totalAmount, order.currency)} 与明细合计{" "}
              {formatCurrency(lineTotal, order.currency)} 不一致。请核对明细或重新保存订单金额。
            </div>
          ) : null}
          {(order.trackingNo || order.carrier || order.shippedAt) && (
            <div className="rounded-lg border bg-slate-50 p-4 text-sm">
              <p className="font-medium">物流信息</p>
              {order.trackingNo && <p className="mt-1">单号：{order.trackingNo}</p>}
              {order.carrier && <p>承运商：{order.carrier}</p>}
              {order.shippedAt && (
                <p>发货：{new Date(order.shippedAt).toLocaleDateString("zh-CN")}</p>
              )}
              {order.etaDate && (
                <p>预计到货：{new Date(order.etaDate).toLocaleDateString("zh-CN")}</p>
              )}
              {order.shipmentNote && <p className="text-muted-foreground">{order.shipmentNote}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {order.inboundShipments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>运输过程</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.inboundShipments.map((shipment) => {
              const modeLabels: Record<string, string> = {
                HAND_CARRY: "随身携带",
                CONSOLIDATOR: "集运 / 合箱",
                POSTAL: "邮局直邮",
                COURIER: "快递",
                FREIGHT: "货运",
                OTHER: "其他",
              };
              const shipmentStatusLabels: Record<string, string> = {
                PLANNED: "待发出",
                IN_TRANSIT: "运输中",
                DELIVERED: "已到货",
                CANCELLED: "已取消",
              };
              return (
                <div key={shipment.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      第 {shipment.legIndex} 段 ·{" "}
                      {modeLabels[shipment.transportMode || ""] || "运输方式待补"}
                    </p>
                    <Badge variant="outline">
                      {shipmentStatusLabels[shipment.status] || shipment.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {shipment.carriedBy
                      ? `携带人：${shipment.carriedBy}`
                      : shipment.carrier || "未填写承运方"}
                    {shipment.trackingNo ? ` · ${shipment.trackingNo}` : ""}
                    {shipment.grossWeightKg ? ` · ${shipment.grossWeightKg} kg` : ""}
                  </p>
                  {shipment.customsAmount || shipment.taxAmount ? (
                    <p className="mt-1 text-muted-foreground">
                      {shipment.customsAmount
                        ? `申报 ${shipment.customsCurrency || ""} ${shipment.customsAmount}`
                        : ""}
                      {shipment.customsAmount && shipment.taxAmount ? " · " : ""}
                      {shipment.taxAmount
                        ? `税费 ${shipment.taxCurrency || ""} ${shipment.taxAmount}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <CardTitle>采购明细</CardTitle>
          {canEdit ? (
            <AddPurchaseLineDialog
              purchaseOrderId={order.id}
              currency={order.currency}
              storeId={storeId}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          {order.lines.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              暂无商品。可使用右上角“添加商品”补充采购明细。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>库存管理</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">单价</TableHead>
                  <TableHead className="text-right">小计</TableHead>
                  <TableHead className="text-right">到岸成本</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => {
                  const landedAmount = new Decimal(line.lineAmount)
                    .plus(new Decimal(line.allocatedFee))
                    .minus(new Decimal(line.allocatedDiscount));
                  const landedUnitCost = new Decimal(line.quantity).gt(0)
                    ? landedAmount.div(new Decimal(line.quantity))
                    : new Decimal(0);
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductImage
                            src={line.sku.imageUrl}
                            alt={line.sku.name}
                            size="md"
                            className="rounded-md"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{line.sku.name}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {line.sku.code}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {actualUnitLineIds.has(line.id)
                          ? "一物一单"
                          : actualLotLineIds.has(line.id)
                            ? "按数量"
                            : line.trackingMode === "ITEM_UNIT"
                              ? "一物一单"
                              : "按数量"}
                      </TableCell>
                      <TableCell className="text-right">{formatQuantity(line.quantity)}</TableCell>
                      <TableCell className="text-right">
                        {line.costStatus === "PENDING"
                          ? "待分摊"
                          : formatCurrency(line.unitPrice, order.currency)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(line.lineAmount, order.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {line.costStatus === "PENDING" ? (
                          "待分摊"
                        ) : (
                          <div>
                            <p className="font-medium">
                              {formatCurrency(landedAmount, order.currency)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              单件 {formatCurrency(landedUnitCost, order.currency)}
                            </p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit && (
                          <DeletePurchaseLineButton
                            lineId={line.id}
                            orderId={order.id}
                            skuName={line.sku.name}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canReceive && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>收货</CardTitle>
              <QuickReceiveButton
                purchaseOrderId={order.id}
                locations={locations}
                destinationLocationId={order.destinationLocationId}
              />
            </div>
          </CardHeader>
          <CardContent>
            <ReceiveGoodsForm
              purchaseOrderId={order.id}
              locations={locations}
              lineCount={order.lines.length}
            />
          </CardContent>
        </Card>
      )}

      {order.status === "RECEIVED" && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardHeader>
            <CardTitle>{inspectionSummary.length > 0 ? "质检结果" : "到货质检"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-3">
              <Package className="h-5 w-5 text-blue-500" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">已收货</p>
                <p className="text-muted-foreground">
                  该采购订单已完成收货，入库库存已自动创建。 收货日期：
                  {order.receivedAt && new Date(order.receivedAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
            </div>
            {inspectionSummary.length === 0 ? (
              <PurchaseReceiptInspectionForm
                purchaseOrderId={order.id}
                lines={order.lines.map((line) => ({
                  id: line.id,
                  skuCode: line.sku.code,
                  skuName: line.sku.name,
                  quantity: line.quantity.toString(),
                  trackingMode: line.trackingMode,
                }))}
              />
            ) : (
              <div className="divide-y rounded-lg border bg-background">
                {order.lines.map((line) => {
                  const inspection = inspectionSummary.find(
                    (row) => row.purchaseLineId === line.id
                  );
                  return (
                    <div
                      key={line.id}
                      className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-medium">{line.sku.name}</p>
                        <p className="text-xs text-muted-foreground">{line.sku.code}</p>
                      </div>
                      <p>
                        通过 {inspection?.passedQty ?? "0"} · 退供应商{" "}
                        {inspection?.failedQty ?? "0"} · 待复检 {inspection?.pendingQty ?? "0"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {order.status === "RECEIVED" ? (
        <Card>
          <CardHeader>
            <CardTitle>后续库存处理</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">采购详情只保留订单、成本与质检记录</p>
              <p className="mt-1 text-sm text-muted-foreground">
                入库、集运和转仓统一在工作台或库存维护中处理，避免同一批货从多个页面重复操作。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/workbench?queue=pendingDisposition">
                <Button variant="outline">前往工作台</Button>
              </Link>
              <Link
                href={`/logistics/transfers/new?fromLocationId=${encodeURIComponent(order.destinationLocationId ?? "")}&purchaseOrderId=${encodeURIComponent(order.id)}`}
              >
                <Button>部分转运 / 混装</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {chargeData.events.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>仓库服务记账</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              仓库完成检查后登记服务费；你确认后，才会成为双方认可的线下往来。
            </p>
            <div className="divide-y border-y">
              {chargeData.events.map((event) => {
                const payer = event.parties.find((party) => party.role === "PAYER");
                const payee = event.parties.find((party) => party.role === "PAYEE");
                return (
                  <div
                    key={event.id}
                    className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{event.description}</span>
                        <Badge variant="outline">{event.category.name}</Badge>
                        <ChargeStatusBadge status={event.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {payer?.nameSnapshot ?? "-"} → {payee?.nameSnapshot ?? "-"} ·{" "}
                        {event.currency} {event.amount}
                      </p>
                    </div>
                    <ChargeRowActions
                      id={event.id}
                      status={event.status}
                      currentOrganizationId={chargeData.currentOrganizationId}
                      payerOrganizationId={payer?.organizationId}
                      payeeOrganizationId={payee?.organizationId}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
