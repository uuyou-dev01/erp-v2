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
import {
  ArrowLeft,
  Package,
  MapPin,
  DollarSign,
  Calendar,
  Image,
  User,
  FileText,
  Store,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getProductTicketByEntity } from "@/lib/application/workflow-queries";
import { ProductTicketShell } from "@/components/product-ticket/product-ticket-shell";
import { getPlatforms } from "@/app/actions/platforms";
import { EntityId } from "@/components/shared/entity-id";
import { ItemUnitDeleteButton } from "@/components/inventory/item-unit-delete-button";
import {
  formatItemUnitCondition,
  itemUnitStatusLabels,
} from "@/lib/inventory/item-unit-display";

const STORE_ID = "store_1";

export const dynamic = "force-dynamic";

function safeReturnPath(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
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
  const returnHref = safeReturnPath(returnTo, "/inventory/items");
  const photos = Array.isArray(item.photos) ? (item.photos as string[]) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <Link href={returnHref}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs" title={item.id}>
                编号 <EntityId id={item.id} className="font-mono text-xs" />
              </Badge>
              <Badge variant={statusColors[item.status as keyof typeof statusColors]}>
                {itemUnitStatusLabels[item.status] || item.status}
              </Badge>
              {item.conditionGrade && (
                <Badge variant="secondary">
                  {formatItemUnitCondition(item.conditionGrade)}
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-3xl font-bold">
              {item.sku.code} · {item.sku.name}
            </h1>
            <p className="font-mono text-xs text-muted-foreground">{item.id}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEditable && (
            <Link href="#item-edit">
              <Button variant="outline" size="sm">
                <Pencil className="mr-2 h-4 w-4" />
                编辑
              </Button>
            </Link>
          )}
          <ItemUnitDeleteButton id={item.id} skuCode={item.sku.code} storeId={STORE_ID} />
        </div>
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
        </CardHeader>
        <CardContent className="space-y-3">
          {item.listings.length === 0 ? (
            <p className="text-sm text-muted-foreground">该单件尚未添加上架记录。</p>
          ) : (
            item.listings.map((listing) => (
              <div key={listing.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{listing.platform.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {listing.listedPrice && listing.currency
                      ? formatCurrency(listing.listedPrice, listing.currency)
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
            <Link
              href={`/inventory/skus/${item.sku.id}?returnTo=${encodeURIComponent(returnHref)}`}
              className="text-primary underline-offset-4 hover:underline"
            >
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
            <CardTitle className="text-sm font-medium">位置</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{item.location.code}</div>
            <p className="text-xs text-muted-foreground">{item.location.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">单位成本</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(item.unitCost, item.costCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">创建后不可修改</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">创建时间</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">{new Date(item.createdAt).toLocaleDateString("zh-CN")}</div>
          </CardContent>
        </Card>
      </div>

      {item.conditionGrade && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              成色
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="text-base">
              {formatItemUnitCondition(item.conditionGrade)}
            </Badge>
            {item.conditionGrade !== formatItemUnitCondition(item.conditionGrade) && (
              <p className="mt-2 text-xs text-muted-foreground">
                原始值：{item.conditionGrade}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              照片
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {photos.map((photo, index) => (
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
              归属
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {item.ownerId && (
                <div>
                  <p className="text-sm font-medium">所有者</p>
                  <p className="text-muted-foreground">{item.ownerId}</p>
                </div>
              )}
              {item.holderId && (
                <div>
                  <p className="text-sm font-medium">持有者</p>
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
              备注
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
            <CardTitle>订单分配</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>日期</TableHead>
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
                      {new Date(allocation.createdAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card id="item-edit">
        <CardHeader>
          <CardTitle>编辑单品</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditable ? (
            <ItemUnitForm
              storeId={item.storeId}
              initialData={{
                id: item.id,
                conditionGrade: item.conditionGrade,
                photos,
                ownerId: item.ownerId,
                holderId: item.holderId,
                notes: item.notes,
              }}
              mode="edit"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              仅「可用」且未分配订单的单品可编辑成色、照片与备注。当前状态：
              {itemUnitStatusLabels[item.status] || item.status}
              {item.allocations.length > 0 ? "，且存在订单分配。" : "。"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>库存流水</CardTitle>
        </CardHeader>
        <CardContent>
          {item.ledgerEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无流水记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>原因</TableHead>
                  <TableHead>数量变动</TableHead>
                  <TableHead>位置</TableHead>
                  <TableHead>关联</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.ledgerEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {new Date(entry.occurredAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.reason}</Badge>
                    </TableCell>
                    <TableCell
                      className={
                        parseFloat(entry.deltaQty) > 0 ? "text-green-600" : "text-red-600"
                      }
                    >
                      {entry.deltaQty}
                    </TableCell>
                    <TableCell>
                      <EntityId id={entry.locationId} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.refType}
                      {entry.refId ? (
                        <>
                          : <EntityId id={entry.refId} />
                        </>
                      ) : (
                        ": N/A"
                      )}
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
