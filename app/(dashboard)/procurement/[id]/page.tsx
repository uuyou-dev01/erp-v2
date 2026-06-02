import { getPurchaseOrderById } from "@/app/actions/purchase-orders";
import { getLocations } from "@/app/actions/locations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { AddPurchaseLineForm } from "@/components/procurement/add-purchase-line-form";
import { ReceiveGoodsForm } from "@/components/procurement/receive-goods-form";
import { PurchaseOrderActions } from "@/components/procurement/purchase-order-actions";
import { QuickReceiveButton } from "@/components/procurement/quick-receive-button";
import { BackButton } from "@/components/shared/back-button";
import { ProductImage } from "@/components/ui/product-image";
import { ShoppingCart, Package, Calendar, DollarSign } from "lucide-react";

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

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getPurchaseOrderById(id);
  const locations = await getLocations(STORE_ID);

  if (!order) {
    notFound();
  }

  const canEdit = order.status === "DRAFT";
  const canReceive =
    (order.status === "ORDERED" || order.status === "SHIPPED") && order.lines.length > 0;

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
            <div className="text-sm">
              {order.orderedAt ? new Date(order.orderedAt).toLocaleDateString("zh-CN") : "尚未下单"}
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
                <p className="text-sm font-medium text-muted-foreground">汇率</p>
                <p className="text-lg">{order.fxRate.toString()}</p>
              </div>
            )}
          </div>
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

      <Card>
        <CardHeader>
          <CardTitle>采购明细</CardTitle>
        </CardHeader>
        <CardContent>
          {order.lines.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              暂无商品。请在下方添加商品。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">单价</TableHead>
                  <TableHead className="text-right">小计</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => (
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
                    <TableCell className="text-right">{formatQuantity(line.quantity)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(line.unitPrice, order.currency)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(line.lineAmount, order.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <form action={`/api/purchase-lines/${line.id}/delete`} method="POST">
                          <button
                            type="submit"
                            className="text-sm text-destructive hover:underline"
                          >
                            删除
                          </button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>添加商品</CardTitle>
          </CardHeader>
          <CardContent>
            <AddPurchaseLineForm
              purchaseOrderId={order.id}
              currency={order.currency}
              storeId={STORE_ID}
            />
          </CardContent>
        </Card>
      )}

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
          <CardContent className="pt-6">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
