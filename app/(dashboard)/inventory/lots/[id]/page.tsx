import { getInventoryLotById, getAvailableQuantity } from "@/app/actions/inventory-lots";
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
import { Package, MapPin, DollarSign, Activity } from "lucide-react";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export default async function InventoryLotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lot = await getInventoryLotById(id);

  if (!lot) {
    notFound();
  }

  const availableQty = await getAvailableQuantity(id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inventory Lot Details</h1>
        <p className="text-muted-foreground">View lot information and transaction history</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Quantity</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatQuantity(availableQty)}</div>
            <p className="text-xs text-muted-foreground">Units available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unit Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(lot.unitCost, lot.costCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">Immutable cost</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Location</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lot.location.code}</div>
            <p className="text-xs text-muted-foreground">{lot.location.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={lot.status === "ACTIVE" ? "default" : "secondary"}>
                {lot.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Current status</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lot Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">SKU</p>
              <p className="text-lg font-semibold">{lot.sku.code}</p>
              <p className="text-sm text-muted-foreground">{lot.sku.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Received Date</p>
              <p className="text-lg font-semibold">
                {new Date(lot.receivedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Source Type</p>
              <Badge variant="outline">{lot.sourceType}</Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Source ID</p>
              <p className="font-mono text-sm">{lot.sourceId}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {lot.allocations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Allocations ({lot.allocations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Cost Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lot.allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell className="font-medium">
                      Order #{allocation.orderLine.order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{formatQuantity(allocation.quantity)}</TableCell>
                    <TableCell>{formatCurrency(allocation.costAmount, lot.costCurrency)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {allocation.orderLine.order.orderStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stock Ledger History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Delta Qty</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lot.stockLedgers.map((ledger) => (
                <TableRow key={ledger.id}>
                  <TableCell>
                    {new Date(ledger.occurredAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        ledger.reason.startsWith("INBOUND") ? "default" : "secondary"
                      }
                    >
                      {ledger.reason}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        parseFloat(ledger.deltaQty.toString()) > 0
                          ? "text-green-500"
                          : "text-red-500"
                      }
                    >
                      {parseFloat(ledger.deltaQty.toString()) > 0 ? "+" : ""}
                      {formatQuantity(ledger.deltaQty)}
                    </span>
                  </TableCell>
                  <TableCell>{ledger.locationId.slice(0, 8)}</TableCell>
                  <TableCell>
                    {ledger.refType && (
                      <span className="font-mono text-xs">
                        {ledger.refType}: {ledger.refId?.slice(0, 8)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
