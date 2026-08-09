import { requireUserContext } from "@/lib/auth/user-context";
import { getItemUnitById } from "@/app/actions/item-units";
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
  AlertCircle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  DollarSign,
  MapPin,
  Pencil,
  Store,
  User,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getProductTicketByEntity } from "@/lib/application/workflow-queries";
import { ProductTicketShell } from "@/components/product-ticket/product-ticket-shell";
import { getPlatforms } from "@/app/actions/platforms";
import { EntityId } from "@/components/shared/entity-id";
import { ItemUnitDeleteButton } from "@/components/inventory/item-unit-delete-button";
import { ItemUnitPhotoPanel } from "@/components/inventory/item-unit-photo-panel";
import { formatItemUnitCondition, itemUnitStatusLabels } from "@/lib/inventory/item-unit-display";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import {
  itemConditionTypeLabel,
  itemFunctionStatusLabel,
  normalizeItemConditionType,
} from "@/lib/inventory/item-condition";

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

const ledgerReasonLabels: Record<string, string> = {
  INBOUND_PURCHASE: "采购入库",
  TRANSFER_OUT: "转仓出库",
  TRANSFER_IN: "转仓入库",
  SALE_OUT: "销售出库",
  RETURN_IN: "退货入库",
  ADJUSTMENT: "库存调整",
};

const ledgerReferenceLabels: Record<string, string> = {
  PURCHASE_LINE: "采购明细",
  CUSTOMER_ORDER: "销售订单",
  CONSOLIDATION_BATCH: "集运批次",
  AFTER_SALES_CASE: "售后单",
};

export default async function ItemUnitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; edit?: string }>;
}) {
  const context = await requireUserContext();
  const storeId = context.activeStoreId;
  const { id } = await params;
  const { returnTo, edit } = await searchParams;
  const item = await getItemUnitById(id);

  if (!item) notFound();

  const canManage =
    context.storeIds.includes(item.storeId) && hasRoleAtLeast(context.role, ROLES.MANAGER);
  const [ticket, platforms] = await Promise.all([
    canManage ? getProductTicketByEntity("itemUnit", id) : Promise.resolve(null),
    canManage ? getPlatforms(storeId) : Promise.resolve([]),
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

  const isEditable =
    canManage &&
    ["AVAILABLE", "RETURN_CHECK"].includes(item.status) &&
    item.allocations.length === 0;
  const returnHref = safeReturnPath(returnTo, "/inventory/items");
  const photos = Array.isArray(item.photos) ? (item.photos as string[]) : [];
  const hasSupplementary = Boolean(item.notes || item.ownerId || item.holderId);
  const editQuery = new URLSearchParams({ returnTo: returnHref, edit: "1" });
  const editHref = `/inventory/items/${item.id}?${editQuery.toString()}#item-edit`;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <header className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <Link href={returnHref} aria-label="返回库存看板">
              <Button variant="ghost" size="icon" className="mt-0.5 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <ItemUnitPhotoPanel itemUnitId={item.id} itemName={item.sku.name} photos={photos} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusColors[item.status as keyof typeof statusColors]}>
                  {item.operationalState.statusLabel}
                </Badge>
                <Badge variant="outline">{itemConditionTypeLabel(item.conditionType)}</Badge>
                {normalizeItemConditionType(item.conditionType) === "USED" ? (
                  <Badge variant="secondary">{formatItemUnitCondition(item.conditionGrade)}</Badge>
                ) : null}
                <Badge variant="outline">
                  功能：{itemFunctionStatusLabel(item.functionStatus)}
                </Badge>
              </div>
              <h1 className="mt-2 truncate text-3xl font-bold tracking-tight">{item.sku.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                SKU <span className="font-mono text-foreground">{item.sku.code}</span>
                <span className="mx-2 text-border">/</span>
                单件 <EntityId id={item.id} className="font-mono text-xs" />
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-12 lg:pl-0">
            {isEditable ? (
              <Link href={editHref}>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-2 h-4 w-4" />
                  编辑
                </Button>
              </Link>
            ) : null}
            {canManage ? (
              <ItemUnitDeleteButton id={item.id} skuCode={item.sku.code} storeId={storeId} />
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 border-y py-3 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{item.location.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{item.location.code}</span>
          </div>
          {!item.costHidden && item.unitCost && item.costCurrency ? (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">成本</span>
              <span className="font-medium">
                {formatCurrency(item.unitCost, item.costCurrency)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">创建</span>
            <span>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
        </div>
      </header>

      <section
        className="rounded-lg border bg-muted/20 p-4"
        aria-labelledby="operational-state-heading"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 id="operational-state-heading" className="font-medium">
              当前商品状态
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">实物：{item.operationalState.physicalLabel}</Badge>
              <Badge variant="outline">销售：{item.operationalState.availabilityLabel}</Badge>
              <Badge variant="outline">检查：{item.operationalState.qualityLabel}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.operationalState.explanation}
            </p>
            {item.operationalState.nextActionLabel ? (
              <p className="mt-1 text-sm font-medium">
                下一步：{item.operationalState.nextActionLabel}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {ticket ? <ProductTicketShell ticket={ticket} platforms={platformOptions} compact /> : null}

      <div
        className={
          hasSupplementary ? "grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.75fr)]" : ""
        }
      >
        <main className="space-y-8">
          <section aria-labelledby="listing-records-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2
                id="listing-records-heading"
                className="flex items-center gap-2 text-base font-semibold"
              >
                <Store className="h-4 w-4 text-muted-foreground" />
                上架记录
                <span className="font-normal text-muted-foreground">{item.listings.length}</span>
              </h2>
              {canManage ? (
                <Link
                  href={`/inventory/skus/${item.sku.id}?returnTo=${encodeURIComponent(returnHref)}`}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  查看 SKU 全部上架
                </Link>
              ) : null}
            </div>

            {item.listings.length === 0 ? (
              <p className="border-y border-dashed py-6 text-sm text-muted-foreground">
                暂无上架记录
              </p>
            ) : (
              <div className="divide-y border-y">
                {item.listings.map((listing) => (
                  <div key={listing.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{listing.platform.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {listing.listedPrice && listing.currency
                          ? formatCurrency(listing.listedPrice, listing.currency)
                          : "未设置价格"}
                        <span className="mx-1.5 text-border">/</span>
                        {new Date(listing.listedAt).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    <Badge variant={listing.status === "ACTIVE" ? "default" : "outline"}>
                      {listingStatusLabels[listing.status] || listing.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

          {item.allocations.length > 0 ? (
            <section aria-labelledby="allocations-heading">
              <h2 id="allocations-heading" className="mb-3 text-base font-semibold">
                订单分配
              </h2>
              <div className="overflow-hidden border-y">
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
              </div>
            </section>
          ) : null}
        </main>

        {hasSupplementary ? (
          <aside className="space-y-6 border-l pl-6" aria-label="单件补充信息">
            {(item.ownerId || item.holderId) && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <User className="h-4 w-4 text-muted-foreground" />
                  归属
                </h2>
                <dl className="space-y-3 text-sm">
                  {item.ownerId ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">所有者</dt>
                      <dd>
                        <EntityId id={item.ownerId} />
                      </dd>
                    </div>
                  ) : null}
                  {item.holderId ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">持有者</dt>
                      <dd>
                        <EntityId id={item.holderId} />
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            )}

            {item.notes ? (
              <section>
                <h2 className="mb-2 text-sm font-semibold">备注</h2>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {item.notes}
                </p>
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>

      <section className="border-t" aria-label="维护与审计">
        {canManage ? (
          <details id="item-edit" open={edit === "1"} className="group border-b py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium hover:text-primary [&::-webkit-details-marker]:hidden">
              编辑单件信息
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-6 max-w-3xl">
              {isEditable ? (
                <ItemUnitForm
                  storeId={item.storeId}
                  initialData={{
                    id: item.id,
                    conditionType: item.conditionType,
                    conditionGrade: item.conditionGrade,
                    functionStatus: item.functionStatus,
                    photos,
                    ownerId: item.ownerId,
                    holderId: item.holderId,
                    notes: item.notes,
                  }}
                  mode="edit"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  仅“可售”或“待检查 / 补资料”且未分配订单的单件可编辑。当前状态：
                  {itemUnitStatusLabels[item.status] || item.status}
                  {item.allocations.length > 0 ? "，且存在订单分配。" : "。"}
                </p>
              )}
            </div>
          </details>
        ) : null}

        <details className="group border-b py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium hover:text-primary [&::-webkit-details-marker]:hidden">
            <span>
              库存流水
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {item.ledgerEntries.length} 条
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-5 overflow-hidden border-y">
            {item.ledgerEntries.length === 0 ? (
              <p className="py-5 text-sm text-muted-foreground">暂无流水记录</p>
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
                      <TableCell>{new Date(entry.occurredAt).toLocaleString("zh-CN")}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {ledgerReasonLabels[entry.reason] || entry.reason}
                        </Badge>
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
                        {entry.refType
                          ? ledgerReferenceLabels[entry.refType] || entry.refType
                          : "未关联"}
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
          </div>
        </details>
      </section>
    </div>
  );
}
