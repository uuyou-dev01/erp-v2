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
import { ShoppingCart, Package, Calendar, DollarSign } from "lucide-react";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

const statusColors = {
  DRAFT: "secondary",
  ORDERED: "default",
  RECEIVED: "outline",
  CANCELLED: "destructive",
} as const;

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
  const canReceive = order.status === "ORDERED" && order.lines.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Purchase Order: {order.orderNo}</h1>
          <p className="text-muted-foreground">
            {order.supplierName || "No supplier specified"}
          </p>
        </div>
        <PurchaseOrderActions order={order} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={statusColors[order.status as keyof typeof statusColors]}>
              {order.status}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
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
            <CardTitle className="text-sm font-medium">Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{order.lines.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ordered Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {order.orderedAt
                ? new Date(order.orderedAt).toLocaleDateString()
                : "Not ordered yet"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Currency</p>
              <p className="text-lg">{order.currency}</p>
            </div>
            {order.fxRate && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Exchange Rate</p>
                <p className="text-lg">{order.fxRate.toString()}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Lines</CardTitle>
        </CardHeader>
        <CardContent>
          {order.lines.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No items added yet. Add items below to continue.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Line Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{line.sku.code}</p>
                        <p className="text-sm text-muted-foreground">{line.sku.name}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatQuantity(line.quantity)}</TableCell>
                    <TableCell>
                      {formatCurrency(line.unitPrice, order.currency)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(line.lineAmount, order.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <form action={`/api/purchase-lines/${line.id}/delete`} method="POST">
                          <button
                            type="submit"
                            className="text-sm text-destructive hover:underline"
                          >
                            Remove
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
            <CardTitle>Add Purchase Line</CardTitle>
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
            <CardTitle>Receive Goods</CardTitle>
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
                <p className="font-medium">Goods Received</p>
                <p className="text-muted-foreground">
                  This purchase order has been received and inventory lots have been created.
                  Received on {order.receivedAt && new Date(order.receivedAt).toLocaleDateString()}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
