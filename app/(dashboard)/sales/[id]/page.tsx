import { getCustomerOrderById } from "@/app/actions/customer-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { AddOrderLineForm } from "@/components/sales/add-order-line-form";
import { AllocateInventoryForm } from "@/components/sales/allocate-inventory-form";
import { ConfirmOrderButton } from "@/components/sales/confirm-order-button";
import { ShoppingCart, Package, Calendar, DollarSign, AlertTriangle } from "lucide-react";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId
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

export default async function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getCustomerOrderById(id);

  if (!order) {
    notFound();
  }

  const canEdit = order.orderStatus === "DRAFT";
  const canConfirm =
    order.orderStatus === "DRAFT" &&
    order.lines.length > 0 &&
    order.lines.every((line) => line.allocations.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Order: {order.id.slice(0, 8)}</h1>
          <p className="text-muted-foreground">
            {order.externalOrderNo || "No external order number"}
          </p>
        </div>
        {canConfirm && <ConfirmOrderButton orderId={order.id} />}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={statusColors[order.orderStatus as keyof typeof statusColors]}>
              {order.orderStatus}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
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
            <CardTitle className="text-sm font-medium">Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{order.lines.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">{new Date(order.createdAt).toLocaleDateString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Lines</CardTitle>
        </CardHeader>
        <CardContent>
          {order.lines.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No items added yet. Add items below to continue.
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
                            {line.supplyStatus}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{line.sku.name}</p>
                        <div className="mt-2 flex gap-4 text-sm">
                          <span>
                            Qty: <strong>{formatQuantity(line.quantity)}</strong>
                          </span>
                          {line.unitPrice && (
                            <span>
                              Price:{" "}
                              <strong>
                                {formatCurrency(line.unitPrice, order.currency)}
                              </strong>
                            </span>
                          )}
                          <span>
                            Amount:{" "}
                            <strong>
                              {formatCurrency(line.lineAmount, order.currency)}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {hasAllocation && (
                      <div className="rounded-lg bg-muted p-3">
                        <p className="mb-2 text-sm font-medium">Allocations:</p>
                        <div className="space-y-2">
                          {line.allocations.map((alloc) => (
                            <div
                              key={alloc.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span>
                                {alloc.inventoryLot?.location.code} •{" "}
                                {formatQuantity(alloc.quantity)} units
                              </span>
                              <span className="text-muted-foreground">
                                Cost: {formatCurrency(alloc.costAmount, order.currency)}
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
                            Allocation Required ({allocatedQty}/{requiredQty})
                          </p>
                        </div>
                        <AllocateInventoryForm
                          orderLineId={line.id}
                          skuId={line.skuId}
                          skuCode={line.sku.code}
                          requiredQty={(requiredQty - allocatedQty).toString()}
                          storeId={STORE_ID}
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

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Add Order Line</CardTitle>
          </CardHeader>
          <CardContent>
            <AddOrderLineForm orderId={order.id} currency={order.currency} storeId={STORE_ID} />
          </CardContent>
        </Card>
      )}

      {order.orderStatus === "CONFIRMED" && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Package className="h-5 w-5 text-green-500" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Order Confirmed</p>
                <p className="text-muted-foreground">
                  This order has been confirmed and inventory has been deducted from stock.
                  Confirmed on{" "}
                  {order.confirmedAt && new Date(order.confirmedAt).toLocaleDateString()}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
