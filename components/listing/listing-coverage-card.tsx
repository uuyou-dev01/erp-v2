"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import { ListingPlatformStrip } from "@/components/listing/listing-platform-strip";
import { ListingRecordCompactRow } from "@/components/listing/listing-record-compact-row";
import { QuickAddListingDialog } from "@/components/listing/quick-add-listing-dialog";
import { SellableItemUnitsList } from "@/components/listing/sellable-item-units-list";
import { SellableStockBreakdown } from "@/components/listing/sellable-stock-breakdown";
import type {
  ListingCoverageProduct,
  ListingCoverageRisk,
} from "@/lib/application/listing-coverage";
import { formatListedDaysShort } from "@/lib/application/listing-record-display";
import { productKindLabel } from "@/lib/application/sku-catalog";
import { formatCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { AlertTriangle, Eye, Plus, X } from "lucide-react";

interface ListingCoverageCardProps {
  product: ListingCoverageProduct;
}

function riskClassName(risk: ListingCoverageRisk) {
  if (risk.tone === "red") return "border-red-500/30 bg-red-500/10 text-red-700";
  if (risk.tone === "amber") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-700";
}

function withReturnTo(href: string, returnTo: string) {
  return `${href}?returnTo=${encodeURIComponent(returnTo)}`;
}

function stockKindBadge(product: ListingCoverageProduct) {
  if (product.hasLotStock && product.hasItemUnits) return "批次+中古";
  if (product.hasItemUnits) return "中古";
  return "SKU 批次";
}

function listingSummary(product: ListingCoverageProduct) {
  if (product.records.length === 0) {
    return { label: "待上架", tone: "amber" as const };
  }
  const active = product.records.filter((r) => r.state === "active");
  const primary = active[0] ?? product.records[0];
  const extra = active.length > 1 ? ` 等${active.length}个` : "";
  const age = primary ? formatListedDaysShort(primary.listedAt) : "";
  return {
    label: `在售 ${primary.platformName}${age ? ` ${age}` : ""}${extra}`,
    tone: "default" as const,
  };
}

function countMissingPlatforms(product: ListingCoverageProduct) {
  return product.platforms.filter((p) => p.state === "missing").length;
}

function CompactChannelRow({
  label,
  metrics,
}: {
  label: string;
  metrics: Array<{ label: string; value: number; tone?: "default" | "muted" | "amber" }>;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-2.5 py-2">
      <div className="mb-1.5 text-[11px] font-medium text-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {metrics.map((metric) => (
          <span
            key={`${label}-${metric.label}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-4",
              metric.tone === "amber"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-800"
                : metric.tone === "muted"
                  ? "border-border bg-background/70 text-muted-foreground"
                  : "border-border bg-background text-foreground"
            )}
          >
            <span>{metric.label}</span>
            <span className="font-semibold tabular-nums">{metric.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border bg-background/70 p-3">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function ListingCoverageCard({ product }: ListingCoverageCardProps) {
  const [mounted, setMounted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [addPlatformId, setAddPlatformId] = useState<string | undefined>();

  const missingPlatforms = countMissingPlatforms(product);
  const summary = listingSummary(product);
  const kind = product.hasItemUnits && !product.hasLotStock ? "USED" : product.productKind;
  const sellableUnits = product.itemUnits.filter((u) => u.sellable);
  const skuListingRecords = product.records.filter((record) => record.listingScope !== "ITEM_UNIT");
  const itemUnitListingRecords = product.records.filter(
    (record) => record.listingScope === "ITEM_UNIT"
  );
  const pendingItemUnitWork = sellableUnits.filter(
    (unit) => unit.photoCount === 0 || unit.labelStatus !== "ATTACHED"
  );
  const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const catalogHref = withReturnTo(`/inventory/skus/${product.skuId}`, currentHref);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!detailsOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailsOpen]);

  const openAdd = (platformId?: string) => {
    setAddPlatformId(platformId);
    setAddOpen(true);
  };

  return (
    <>
      <article className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-stretch gap-0 border-b">
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
          >
            <ProductImage
              src={product.imageUrl}
              alt={product.skuName}
              size="sm"
              className="shrink-0 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{product.skuName}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {product.skuCode}
              </p>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">
              {stockKindBadge(product)}
            </Badge>
            <div className="flex flex-col items-end">
              <span className="text-sm font-semibold tabular-nums">{product.sellableQty}</span>
              <span className="text-[10px] text-muted-foreground">可售</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 px-3 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <CompactChannelRow
              label="新品/批次"
              metrics={[
                { label: "可售", value: product.newStockSummary.sellableQty },
                { label: "在售", value: product.newStockSummary.activeListingCount },
                {
                  label: "待平台",
                  value: product.newStockSummary.pendingListingCount,
                  tone: product.newStockSummary.pendingListingCount > 0 ? "amber" : "muted",
                },
              ]}
            />
            <CompactChannelRow
              label="中古/单件"
              metrics={[
                { label: "可售", value: product.itemUnitSummary.sellableCount },
                { label: "在售", value: product.itemUnitSummary.activeListingCount },
                {
                  label: "待上架",
                  value: product.itemUnitSummary.pendingListingCount,
                  tone: product.itemUnitSummary.pendingListingCount > 0 ? "amber" : "muted",
                },
                {
                  label: "待图",
                  value: product.itemUnitSummary.pendingPhotoCount,
                  tone: product.itemUnitSummary.pendingPhotoCount > 0 ? "amber" : "muted",
                },
                {
                  label: "待标",
                  value: product.itemUnitSummary.pendingLabelCount,
                  tone: product.itemUnitSummary.pendingLabelCount > 0 ? "amber" : "muted",
                },
              ]}
            />
          </div>

          <ListingPlatformStrip product={product} onAddPlatform={openAdd} />

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={summary.tone === "amber" ? "outline" : "secondary"}
              className={cn(
                "text-[10px] font-normal",
                summary.tone === "amber" && "border-amber-500/30 text-amber-800"
              )}
            >
              {summary.label}
            </Badge>
            {missingPlatforms > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                +{missingPlatforms} 平台未覆盖
              </span>
            ) : null}
            {product.aggregateRisks.length > 0 ? (
              <Badge
                variant="outline"
                className={cn("text-[10px]", riskClassName(product.aggregateRisks[0]))}
              >
                <AlertTriangle className="mr-0.5 h-3 w-3" />
                {product.aggregateRisks[0].label}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => openAdd()}
            >
              <Plus className="mr-1 h-3 w-3" />
              上架
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-muted-foreground"
              onClick={() => setDetailsOpen(true)}
            >
              详情
            </Button>
            <Link href={catalogHref}>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </article>

      {mounted && detailsOpen
        ? createPortal(
            <div className="fixed inset-0 z-[900] flex items-end justify-center p-3 sm:items-center sm:p-4">
              <div className="absolute inset-0 bg-black/45" onClick={() => setDetailsOpen(false)} />
              <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
                <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProductImage
                      src={product.imageUrl}
                      alt={product.skuName}
                      size="sm"
                      className="shrink-0 rounded-md"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{product.skuName}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {product.skuCode}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setDetailsOpen(false)}
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="overflow-y-auto px-4 py-3">
                  <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{productKindLabel(kind)}</span>
                    {product.brand ? (
                      <>
                        <span>·</span>
                        <span>{product.brand}</span>
                      </>
                    ) : null}
                    {product.category ? (
                      <>
                        <span>·</span>
                        <span>{product.category}</span>
                      </>
                    ) : null}
                    {product.referencePrice ? (
                      <>
                        <span>·</span>
                        <span>
                          参考{" "}
                          {formatCurrency(
                            product.referencePrice,
                            product.referenceCurrency ?? "CNY"
                          )}
                        </span>
                      </>
                    ) : null}
                    <Link
                      href={catalogHref}
                      className="text-foreground underline-offset-2 hover:underline"
                    >
                      商品档案
                    </Link>
                  </div>

                  {product.aggregateRisks.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {product.aggregateRisks.map((risk) => (
                        <Badge
                          key={`${risk.key}-${risk.label}`}
                          variant="outline"
                          className={riskClassName(risk)}
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          {risk.label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <DetailSection title="新品批次">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <CompactChannelRow
                          label="可售"
                          metrics={[{ label: "数量", value: product.newStockSummary.sellableQty }]}
                        />
                        <CompactChannelRow
                          label="在售"
                          metrics={[
                            { label: "Listing", value: product.newStockSummary.activeListingCount },
                          ]}
                        />
                        <CompactChannelRow
                          label="待覆盖"
                          metrics={[
                            {
                              label: "平台",
                              value: product.newStockSummary.pendingListingCount,
                              tone:
                                product.newStockSummary.pendingListingCount > 0 ? "amber" : "muted",
                            },
                          ]}
                        />
                      </div>

                      {product.hasLotStock ? (
                        <SellableStockBreakdown
                          product={product}
                          hideTotal
                          totalQty={product.sellableLotQty}
                        />
                      ) : (
                        <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          暂无新品批次库存
                        </p>
                      )}

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          平台覆盖
                        </p>
                        <ListingPlatformStrip product={product} onAddPlatform={openAdd} />
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          SKU Listing
                        </p>
                        {skuListingRecords.length === 0 ? (
                          <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            暂无记录
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {skuListingRecords.map((record) => (
                              <li key={record.listingId}>
                                <ListingRecordCompactRow product={product} record={record} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </DetailSection>

                    <DetailSection title="单件库存">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <CompactChannelRow
                          label="可售"
                          metrics={[
                            { label: "件数", value: product.itemUnitSummary.sellableCount },
                          ]}
                        />
                        <CompactChannelRow
                          label="在售"
                          metrics={[
                            {
                              label: "Listing",
                              value: product.itemUnitSummary.activeListingCount,
                            },
                          ]}
                        />
                        <CompactChannelRow
                          label="待处理"
                          metrics={[
                            {
                              label: "上架",
                              value: product.itemUnitSummary.pendingListingCount,
                              tone:
                                product.itemUnitSummary.pendingListingCount > 0 ? "amber" : "muted",
                            },
                            {
                              label: "图",
                              value: product.itemUnitSummary.pendingPhotoCount,
                              tone:
                                product.itemUnitSummary.pendingPhotoCount > 0 ? "amber" : "muted",
                            },
                            {
                              label: "标",
                              value: product.itemUnitSummary.pendingLabelCount,
                              tone:
                                product.itemUnitSummary.pendingLabelCount > 0 ? "amber" : "muted",
                            },
                          ]}
                        />
                      </div>

                      {product.hasItemUnits ? (
                        <SellableItemUnitsList
                          units={product.itemUnits}
                          anchorId={`units-${product.skuId}`}
                        />
                      ) : (
                        <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          暂无单件库存
                        </p>
                      )}

                      {pendingItemUnitWork.length > 0 ? (
                        <div className="space-y-1">
                          {pendingItemUnitWork.map((unit) => (
                            <Link
                              key={unit.id}
                              href={withReturnTo(`/inventory/items/${unit.id}`, currentHref)}
                              className="flex items-center justify-between gap-2 rounded-md border bg-background/80 px-2 py-1.5 text-[11px] hover:bg-muted/50"
                            >
                              <span className="min-w-0 truncate">
                                {unit.conditionGrade ? `品相 ${unit.conditionGrade}` : "中古单件"}
                              </span>
                              <span className="flex shrink-0 gap-1">
                                {unit.photoCount === 0 ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    待图
                                  </Badge>
                                ) : null}
                                {unit.labelStatus !== "ATTACHED" ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    待标
                                  </Badge>
                                ) : null}
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : null}

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          单件 Listing
                        </p>
                        {itemUnitListingRecords.length === 0 ? (
                          <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            暂无记录
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {itemUnitListingRecords.map((record) => (
                              <li key={record.listingId}>
                                <ListingRecordCompactRow product={product} record={record} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </DetailSection>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t bg-muted/15 px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => openAdd()}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    添加上架
                  </Button>
                  <Link href={catalogHref}>
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      档案
                    </Button>
                  </Link>
                  {sellableUnits.length === 1 ? (
                    <Link
                      href={withReturnTo(`/inventory/items/${sellableUnits[0].id}`, currentHref)}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                      >
                        单件
                      </Button>
                    </Link>
                  ) : sellableUnits.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => {
                        const el = document.getElementById(`units-${product.skuId}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                    >
                      单件列表
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <QuickAddListingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        product={product}
        initialPlatformId={addPlatformId}
      />
    </>
  );
}
