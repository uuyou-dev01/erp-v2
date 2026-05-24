import { getItemUnitById } from "@/app/actions/item-units";
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
import { formatCurrency } from "@/lib/decimal";
import { ItemUnitForm } from "@/components/inventory/item-unit-form";
import { Package, MapPin, DollarSign, Calendar, Image, User, FileText, Store } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getProductTicketByEntity } from "@/lib/application/workflow-queries";
import { ProductTicketShell } from "@/components/product-ticket/product-ticket-shell";
import { getPlatforms } from "@/app/actions/platforms";

const STORE_ID = "store_1";

// Force dynamic rendering
export const dynamic = "force-dynamic";

const statusColors = {
  AVAILABLE: "default",
  ALLOCATED: "secondary",
  CONSUMED: "outline",
  RETURN_CHECK: "secondary",
} as const;

const listingStatusLabels: Record<string, string> = {
  ACTIVE: "上架中",
  DELISTED: "已下架",
  SOLD_OUT: "已售罄",
};

export default async function ItemUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItemUnitById(id);
  const [ticket, platforms] = await Promise.all([
    getProductTicketByEntity("itemUnit", id),
    getPlatforms(STORE_ID),
  ]);
  const platformOptions = platforms.map((platform) => ({
    id: platform.id,
    code: platform.code,
    name: platform.name,
    defaultCurrency: platform.defaultCurrency,
    defaultFeeRate: platform.defaultFeeRate,
    defaultShippingFee: platform.defaultShippingFee,
    shippingRules: platform.shippingRules,
  }));

  if (!item) {
    notFound();
  }

  const isEditable = item.status === "AVAILABLE" && item.allocations.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Item Unit: {item.id.slice(0, 8)}</h1>
          <p className="text-muted-foreground">{item.sku.code} - {item.sku.name}</p>
        </div>
        <Badge variant={statusColors[item.status as keyof typeof statusColors]}>
          {item.status}
        </Badge>
      </div>

      {ticket && (
        <div className="overflow-hidden rounded-lg border bg-card">
          <ProductTicketShell ticket={ticket} platforms={platformOptions} compact />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="h-4 w-4" />
            上架记录
          </CardTitle>
          <Link href="/listing">
            <Button variant="outline" size="sm">
              前往上架列表
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.listings.length === 0 ? (
            <p className="text-sm text-muted-foreground">该单件尚未创建 Listing。</p>
          ) : (
            item.listings.map((listing) => (
              <div key={listing.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{listing.platform.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {listing.listedPrice && listing.currency
                      ? formatCurrency(listing.listedPrice.toString(), listing.currency)
                      : "未设置价格"}{" "}
                    · {new Date(listing.listedAt).toLocaleDateString("zh-CN")}
                  </p>
                </div>
                <Badge variant={listing.status === "ACTIVE" ? "default" : "outline"}>
                  {listingStatusLabels[listing.status] || listing.status}
                </Badge>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            也可在{" "}
            <Link href={`/inventory/skus/${item.sku.id}`} className="text-primary underline-offset-4 hover:underline">
              SKU {item.sku.code}
            </Link>{" "}
            页面查看该 SKU 下所有上架。
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SKU</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{item.sku.code}</div>
            <p className="text-xs text-muted-foreground">{item.sku.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Location</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{item.location.code}</div>
            <p className="text-xs text-muted-foreground">{item.location.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unit Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(item.unitCost.toString(), item.costCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">Immutable</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">{new Date(item.createdAt).toLocaleDateString()}</div>
          </CardContent>
        </Card>
      </div>

      {item.conditionGrade && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Condition
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="text-base">
              {item.conditionGrade}
            </Badge>
          </CardContent>
        </Card>
      )}

      {item.photos && Array.isArray(item.photos) && item.photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {(item.photos as string[]).map((photo, index) => (
                <div key={index} className="rounded-lg border p-2">
                  <p className="truncate text-sm">{photo}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(item.ownerId || item.holderId) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Ownership
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {item.ownerId && (
                <div>
                  <p className="text-sm font-medium">Owner</p>
                  <p className="text-muted-foreground">{item.ownerId}</p>
                </div>
              )}
              {item.holderId && (
                <div>
                  <p className="text-sm font-medium">Holder</p>
                  <p className="text-muted-foreground">{item.holderId}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {item.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{item.notes}</p>
          </CardContent>
        </Card>
      )}

      {item.allocations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Allocations</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell className="font-mono text-xs">
                      {allocation.orderLine.order.orderNumber}
                    </TableCell>
                    <TableCell>{allocation.orderLine.order.customerName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{allocation.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(allocation.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isEditable && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Item Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemUnitForm
              storeId={item.storeId}
              initialData={{
                id: item.id,
                conditionGrade: item.conditionGrade,
                photos: Array.isArray(item.photos) ? (item.photos as string[]) : undefined,
                ownerId: item.ownerId,
                holderId: item.holderId,
                notes: item.notes,
              }}
              mode="edit"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stock Ledger History</CardTitle>
        </CardHeader>
        <CardContent>
          {item.ledgerEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ledger entries yet</p>
          ) : (
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
                {item.ledgerEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {new Date(entry.occurredAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.reason}</Badge>
                    </TableCell>
                    <TableCell
                      className={
                        parseFloat(entry.deltaQty.toString()) > 0
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {entry.deltaQty.toString()}
                    </TableCell>
                    <TableCell>{entry.locationId}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.refType}: {entry.refId ? entry.refId.slice(0, 8) : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
