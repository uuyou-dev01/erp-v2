"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import { ListingPlatformStrip } from "@/components/listing/listing-platform-strip";
import { ListingRecordCompactRow } from "@/components/listing/listing-record-compact-row";
import { QuickAddListingDialog } from "@/components/listing/quick-add-listing-dialog";
import { SellableItemUnitsList } from "@/components/listing/sellable-item-units-list";
import { SellableStockBreakdown } from "@/components/listing/sellable-stock-breakdown";
import type {
  ItemUnitChannelSummary,
  ListingCoverageProduct,
  ListingCoveragePlatform,
  ListingCoverageRisk,
  ListingRecord,
  StockChannelSummary,
} from "@/lib/application/listing-coverage";
import { buildVariantView } from "@/lib/application/listing-coverage";
import {
  isPlatformTargetForMarket,
  marketLabel,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";
import { productKindLabel } from "@/lib/application/sku-catalog";
import { formatCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { AlertTriangle, Plus, X } from "lucide-react";

interface ListingCoverageCardProps {
  product: ListingCoverageProduct;
  focusLocationId?: string;
  focusMarket?: SellableMarketCode;
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

function primaryLocationLabel(product: ListingCoverageProduct, focusLocationId?: string) {
  const focused = focusLocationId
    ? product.sellableLocations.find((location) => location.locationId === focusLocationId)
    : null;
  if (focused) return `${focused.code} · ${focused.name}`;
  const primary = product.sellableLocations[0];
  if (primary) return `${primary.code} · ${primary.name}`;
  const unit = product.itemUnits.find((item) => item.sellable);
  return unit?.locationName ?? "未确认可售仓";
}

function shortVariantName(parentName: string, variantName: string) {
  const trimmed = variantName.replace(parentName, "").trim();
  return trimmed || variantName;
}

function activePlatformCount(records: ListingRecord[], platforms: ListingCoveragePlatform[]) {
  const platformIds = new Set(platforms.map((platform) => platform.id));
  return new Set(
    records
      .filter((record) => record.state === "active" && platformIds.has(record.platformId))
      .map((record) => record.platformId)
  ).size;
}

function platformStateFromRecords(
  platforms: ListingCoveragePlatform[],
  records: ListingRecord[]
): ListingCoveragePlatform[] {
  return platforms.map((platform) => {
    const record =
      records.find((item) => item.platformId === platform.id && item.state === "active") ??
      records.find((item) => item.platformId === platform.id && item.state === "sold_out") ??
      records.find((item) => item.platformId === platform.id);

    if (!record) {
      return {
        ...platform,
        state: "missing",
        listingId: null,
        status: null,
        listedPrice: null,
        currency: null,
        estimatedNet: null,
        listedAt: null,
        updatedAt: null,
        risks: [],
      };
    }

    return {
      ...platform,
      state: record.state,
      listingId: record.listingId,
      status: record.status,
      listedPrice: record.listedPrice,
      currency: record.currency,
      estimatedNet: record.estimatedNet,
      listedAt: record.listedAt,
      updatedAt: record.updatedAt,
      risks: record.risks,
    };
  });
}

function CompactChannelRow({
  label,
  metrics,
}: {
  label: string;
  metrics: Array<{
    label: string;
    value: number;
    tone?: "default" | "muted" | "amber" | "green" | "blue";
  }>;
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
              metric.tone === "green"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
                : metric.tone === "blue"
                  ? "border-blue-500/25 bg-blue-500/10 text-blue-700"
                  : metric.tone === "amber"
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

function StockMetricBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "green" | "blue" | "amber" | "muted";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 px-1.5 text-[10px]",
        tone === "green" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
        tone === "blue" && "border-blue-500/25 bg-blue-500/10 text-blue-700",
        tone === "amber" && "border-amber-500/30 bg-amber-500/10 text-amber-800",
        tone === "muted" && "border-border bg-background/70 text-muted-foreground"
      )}
    >
      {label} <span className="ml-1 font-semibold tabular-nums">{value}</span>
    </Badge>
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

function SkuCodeLine({ code }: { code: string }) {
  return (
    <span className="truncate font-mono text-[10px] text-muted-foreground">
      {code || "未设置货号"}
    </span>
  );
}

function PlatformCoverageDots({ platforms }: { platforms: ListingCoveragePlatform[] }) {
  if (platforms.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-0.5">
      {platforms.map((platform) => {
        const isListed = platform.state === "active" || platform.state === "sold_out";
        const title =
          platform.state === "missing"
            ? `${platform.name} 未上架`
            : platform.state === "sold_out"
              ? `${platform.name} 已上架（已售罄）`
              : platform.state === "delisted"
                ? `${platform.name} 已下架`
                : `${platform.name} 已上架`;

        return (
          <span
            key={platform.id}
            title={title}
            className={cn(platform.state === "delisted" && "opacity-30")}
          >
            <ListingPlatformMark
              code={platform.code}
              name={platform.name}
              muted={!isListed}
              className="h-4 w-4 rounded border-0 bg-transparent p-0 text-[9px] shadow-none"
            />
          </span>
        );
      })}
    </div>
  );
}

export function ListingCoverageCard({
  product,
  focusLocationId,
  focusMarket,
}: ListingCoverageCardProps) {
  const [mounted, setMounted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [addPlatformId, setAddPlatformId] = useState<string | undefined>();
  const [selectedVariantSkuId, setSelectedVariantSkuId] = useState<string | null>(null);

  const kind = product.hasItemUnits && !product.hasLotStock ? "USED" : product.productKind;
  const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const displayPlatforms = focusMarket
    ? product.allPlatforms.filter((platform) => isPlatformTargetForMarket(platform, focusMarket))
    : product.platforms;
  const variantViews = product.variantRows.map((variant) =>
    buildVariantView({
      variant,
      records: product.records,
      itemUnits: product.itemUnits,
      platforms: focusMarket ? product.allPlatforms : product.platforms,
      market: focusMarket,
      locationId: focusLocationId,
    })
  );
  const defaultVariantView =
    variantViews.find(
      (variant) => variant.scopedSellableQty > 0 || variant.scopedInTransitQty > 0
    ) ??
    variantViews[0] ??
    null;
  const visibleVariantViews = variantViews.filter((variant) => variant.scopedSellableQty > 0);
  const selectedVariant =
    product.variantRows.length > 1
      ? (variantViews.find((variant) => variant.skuId === selectedVariantSkuId) ??
        defaultVariantView)
      : (variantViews[0] ?? null);
  const cardSkuListingRecords = selectedVariant?.scopedSkuRecords ?? product.records;
  const cardItemUnitListingRecords = selectedVariant?.scopedItemUnitRecords ?? [];
  const cardPlatforms = selectedVariant
    ? platformStateFromRecords(selectedVariant.scopedPlatforms, cardSkuListingRecords)
    : displayPlatforms;
  const cardNewStockSummary: StockChannelSummary = selectedVariant
    ? {
        sellableQty: selectedVariant.scopedSellableLotQty,
        activeListingCount: activePlatformCount(
          cardSkuListingRecords,
          selectedVariant.scopedPlatforms
        ),
        pendingListingCount:
          selectedVariant.scopedSellableLotQty > 0
            ? Math.max(
                0,
                selectedVariant.scopedPlatforms.length -
                  activePlatformCount(cardSkuListingRecords, selectedVariant.scopedPlatforms)
              )
            : 0,
      }
    : product.newStockSummary;
  const activeCardItemUnitIds = new Set(
    cardItemUnitListingRecords
      .filter((record) => record.state === "active" && record.itemUnitId)
      .map((record) => record.itemUnitId as string)
  );
  const cardSellableItemUnits = selectedVariant
    ? selectedVariant.scopedItemUnits.filter((unit) => unit.sellable)
    : product.itemUnits.filter((unit) => unit.sellable);
  const cardItemUnitSummary: ItemUnitChannelSummary = selectedVariant
    ? {
        sellableCount: selectedVariant.scopedSellableItemUnitCount,
        activeListingCount: cardItemUnitListingRecords.filter((record) => record.state === "active")
          .length,
        pendingListingCount: cardSellableItemUnits.filter(
          (unit) => !activeCardItemUnitIds.has(unit.id)
        ).length,
        pendingPhotoCount: cardSellableItemUnits.filter((unit) => unit.photoCount === 0).length,
        pendingLabelCount: cardSellableItemUnits.filter((unit) => unit.labelStatus !== "ATTACHED")
          .length,
      }
    : product.itemUnitSummary;
  const cardProduct: ListingCoverageProduct = selectedVariant
    ? {
        ...product,
        skuId: selectedVariant.skuId,
        skuCode: selectedVariant.skuCode,
        skuName: selectedVariant.skuName,
        imageUrl: selectedVariant.imageUrl ?? product.imageUrl,
        sellableQty: selectedVariant.scopedSellableQty,
        sellableLotQty: selectedVariant.scopedSellableLotQty,
        sellableItemUnitCount: selectedVariant.scopedSellableItemUnitCount,
        inTransitQty: selectedVariant.scopedInTransitQty,
        sellableLocations: selectedVariant.scopedSellableLocations,
        inTransitLocations: selectedVariant.scopedInTransitLocations,
        itemUnits: selectedVariant.scopedItemUnits,
        records: selectedVariant.scopedRecords,
        platforms: cardPlatforms,
        newStockSummary: cardNewStockSummary,
        itemUnitSummary: cardItemUnitSummary,
        hasLotStock: selectedVariant.scopedSellableLotQty > 0,
        hasItemUnits: selectedVariant.scopedItemUnits.length > 0,
      }
    : product;
  const detailRecords = selectedVariant ? selectedVariant.scopedRecords : product.records;
  const detailSkuListingRecords = detailRecords.filter(
    (record) => record.listingScope !== "ITEM_UNIT"
  );
  const detailItemUnitListingRecords = detailRecords.filter(
    (record) => record.listingScope === "ITEM_UNIT"
  );
  const detailItemUnits = selectedVariant ? selectedVariant.scopedItemUnits : product.itemUnits;
  const detailSellableUnits = detailItemUnits.filter((unit) => unit.sellable);
  const detailInTransitUnits = detailItemUnits.filter((unit) => unit.inTransit);
  const detailPendingItemUnitWork = detailSellableUnits.filter(
    (unit) => unit.photoCount === 0 || unit.labelStatus !== "ATTACHED"
  );
  const detailDisplayPlatforms = selectedVariant
    ? platformStateFromRecords(selectedVariant.scopedPlatforms, detailSkuListingRecords)
    : displayPlatforms;
  const detailNewStockSummary: StockChannelSummary = selectedVariant
    ? {
        sellableQty: selectedVariant.scopedSellableLotQty,
        activeListingCount: activePlatformCount(
          detailSkuListingRecords,
          selectedVariant.scopedPlatforms
        ),
        pendingListingCount:
          selectedVariant.scopedSellableLotQty > 0
            ? Math.max(
                0,
                selectedVariant.scopedPlatforms.length -
                  activePlatformCount(detailSkuListingRecords, selectedVariant.scopedPlatforms)
              )
            : 0,
      }
    : product.newStockSummary;
  const activeDetailItemUnitIds = new Set(
    detailItemUnitListingRecords
      .filter((record) => record.state === "active" && record.itemUnitId)
      .map((record) => record.itemUnitId as string)
  );
  const detailItemUnitSummary: ItemUnitChannelSummary = selectedVariant
    ? {
        sellableCount: detailSellableUnits.length,
        activeListingCount: detailItemUnitListingRecords.filter(
          (record) => record.state === "active"
        ).length,
        pendingListingCount: detailSellableUnits.filter(
          (unit) => !activeDetailItemUnitIds.has(unit.id)
        ).length,
        pendingPhotoCount: detailSellableUnits.filter((unit) => unit.photoCount === 0).length,
        pendingLabelCount: detailSellableUnits.filter((unit) => unit.labelStatus !== "ATTACHED")
          .length,
      }
    : product.itemUnitSummary;
  const detailProduct: ListingCoverageProduct = selectedVariant
    ? {
        ...product,
        skuId: selectedVariant.skuId,
        skuCode: selectedVariant.skuCode,
        skuName: selectedVariant.skuName,
        imageUrl: selectedVariant.imageUrl ?? product.imageUrl,
        sellableQty: selectedVariant.scopedSellableQty,
        sellableLotQty: selectedVariant.scopedSellableLotQty,
        sellableItemUnitCount: selectedVariant.scopedSellableItemUnitCount,
        inTransitQty: selectedVariant.scopedInTransitQty,
        sellableLocations: selectedVariant.scopedSellableLocations,
        inTransitLocations: selectedVariant.scopedInTransitLocations,
        itemUnits: detailItemUnits,
        records: detailRecords,
        platforms: detailDisplayPlatforms,
        newStockSummary: detailNewStockSummary,
        itemUnitSummary: detailItemUnitSummary,
        hasLotStock: selectedVariant.scopedSellableLotQty > 0,
        hasItemUnits: selectedVariant.scopedItemUnits.length > 0,
      }
    : product;
  const detailLotInTransitQty = Math.max(
    0,
    detailProduct.inTransitQty - detailInTransitUnits.length
  );
  const cardCatalogHref = withReturnTo(`/inventory/skus/${cardProduct.skuId}`, currentHref);
  const detailCatalogHref = withReturnTo(`/inventory/skus/${detailProduct.skuId}`, currentHref);
  const palletLabel = focusMarket ? marketLabel(focusMarket) : product.marketLabel;
  const lowStockVariants = visibleVariantViews.filter(
    (variant) => variant.scopedSellableQty > 0 && variant.scopedSellableQty <= 2
  );
  const displayedVariantViews =
    visibleVariantViews.length > 0 ? visibleVariantViews.slice(0, 2) : variantViews.slice(0, 2);
  const skuCount = visibleVariantViews.length || product.variantRows.length || 1;
  const readySkuCount = visibleVariantViews.filter(
    (variant) => variant.scopedSellableQty > 0
  ).length;
  const transitSkuCount = variantViews.filter((variant) => variant.scopedInTransitQty > 0).length;
  const cardStatusLabel =
    lowStockVariants.length > 0 ? "快没货" : cardProduct.records.length === 0 ? "待上架" : "可卖";

  useEffect(() => {
    if (!detailsOpen || product.variantRows.length <= 1) return;
    setSelectedVariantSkuId((current) =>
      current && product.variantRows.some((variant) => variant.skuId === current)
        ? current
        : (defaultVariantView?.skuId ?? product.variantRows[0]?.skuId ?? null)
    );
  }, [defaultVariantView?.skuId, detailsOpen, product.variantRows]);
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
      <article className="flex min-h-[190px] flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:border-primary/30 hover:shadow-md">
        <div className="border-b px-3 py-2.5">
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="flex w-full min-w-0 items-start justify-between gap-2 rounded-md text-left"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <ProductImage
                src={product.imageUrl}
                alt={product.skuName}
                size="lg"
                className="h-14 w-14 shrink-0 rounded-md"
              />
              <div className="min-w-0 pt-0.5">
                <p className="truncate text-sm font-semibold leading-tight">{product.skuName}</p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  {palletLabel} · {primaryLocationLabel(cardProduct, focusLocationId)}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  可上架 SKU {readySkuCount || skuCount} 个
                  {transitSkuCount > 0 ? ` · 有在途 ${transitSkuCount} 个` : ""}
                </p>
              </div>
            </div>
            {cardStatusLabel === "快没货" ? (
              <Badge
                variant="outline"
                className="h-5 shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-800"
              >
                {cardStatusLabel}
              </Badge>
            ) : cardStatusLabel === "待上架" ? (
              <Badge
                variant="outline"
                className="h-5 shrink-0 border-blue-500/25 bg-blue-500/10 px-1.5 text-[10px] text-blue-700"
              >
                {cardStatusLabel}
              </Badge>
            ) : (
              <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                {cardStatusLabel}
              </Badge>
            )}
          </button>
        </div>

        <div className="flex flex-1 flex-col space-y-2 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2 px-0.5 text-[10px] font-medium text-muted-foreground">
            <span>可上架 SKU</span>
            <span>现货 / 在途 / 单件 / 平台</span>
          </div>
          <div className="space-y-1">
            {displayedVariantViews.map((variant) => {
              const skuRecords = variant.scopedSkuRecords;
              const variantPlatforms = platformStateFromRecords(
                variant.scopedPlatforms,
                skuRecords
              );
              const activeCount = activePlatformCount(skuRecords, variant.scopedPlatforms);
              const missingCount = variantPlatforms.filter(
                (platform) => platform.state === "missing"
              ).length;
              const lowStock = variant.scopedSellableQty > 0 && variant.scopedSellableQty <= 2;
              const isSelected = selectedVariant?.skuId === variant.skuId;
              const isReady = variant.scopedSellableQty > 0;

              return (
                <button
                  key={variant.skuId}
                  type="button"
                  onClick={() => setSelectedVariantSkuId(variant.skuId)}
                  className={cn(
                    "w-full rounded-md border px-2 py-1.5 text-left transition-colors",
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "bg-background/70 hover:bg-muted/40"
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold leading-4">
                        {shortVariantName(product.skuName, variant.skuName)}
                      </p>
                      <SkuCodeLine code={variant.skuCode} />
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {isReady ? (
                        <Badge
                          variant="outline"
                          className="h-5 border-emerald-500/25 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700"
                        >
                          可上架
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          无现货
                        </Badge>
                      )}
                      {activeCount === 0 ? (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          未上架
                        </Badge>
                      ) : missingCount > 0 ? (
                        <Badge
                          variant="outline"
                          className="h-5 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-800"
                        >
                          待平台 {missingCount}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          已覆盖
                        </Badge>
                      )}
                      {lowStock ? (
                        <Badge
                          variant="outline"
                          className="h-5 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-800"
                        >
                          快没货
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap gap-1">
                      <StockMetricBadge
                        label="现货"
                        value={variant.scopedSellableQty}
                        tone={variant.scopedSellableQty > 0 ? "green" : "muted"}
                      />
                      <StockMetricBadge
                        label="在途"
                        value={variant.scopedInTransitQty}
                        tone={variant.scopedInTransitQty > 0 ? "blue" : "muted"}
                      />
                      <StockMetricBadge
                        label="单件"
                        value={variant.scopedSellableItemUnitCount}
                        tone={variant.scopedSellableItemUnitCount > 0 ? "amber" : "muted"}
                      />
                      <StockMetricBadge
                        label="平台"
                        value={`${activeCount}/${variant.scopedPlatforms.length || 0}`}
                        tone={missingCount > 0 ? "amber" : activeCount > 0 ? "blue" : "muted"}
                      />
                    </div>
                    <PlatformCoverageDots platforms={variantPlatforms} />
                  </div>
                </button>
              );
            })}
            {visibleVariantViews.length > displayedVariantViews.length ? (
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="w-full rounded-md border border-dashed px-2 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted/40"
              >
                还有 {visibleVariantViews.length - displayedVariantViews.length} 个
                SKU，打开库存明细查看
              </button>
            ) : null}
          </div>

          <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => openAdd()}
            >
              <Plus className="mr-1 h-3 w-3" />
              上架
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => setDetailsOpen(true)}
            >
              库存明细
            </Button>
            <Link href={cardCatalogHref}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground"
              >
                商品档案
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
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{detailProduct.skuName}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {detailProduct.skuCode}
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
                      href={detailCatalogHref}
                      className="text-foreground underline-offset-2 hover:underline"
                    >
                      商品档案
                    </Link>
                  </div>

                  <div className="mb-3 grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        按最终可售仓库判断：{palletLabel}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {primaryLocationLabel(detailProduct, focusLocationId)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      <StockMetricBadge
                        label="现货"
                        value={detailProduct.sellableQty}
                        tone={detailProduct.sellableQty > 0 ? "green" : "muted"}
                      />
                      <StockMetricBadge
                        label="在途"
                        value={detailProduct.inTransitQty}
                        tone={detailProduct.inTransitQty > 0 ? "blue" : "muted"}
                      />
                    </div>
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

                  {variantViews.length > 1 ? (
                    <div className="mb-3">
                      <DetailSection title="规格 SKU / 变体">
                        <div className="space-y-1.5">
                          {variantViews.map((variant) => {
                            const skuRecords = variant.scopedSkuRecords;
                            const activeCount = activePlatformCount(
                              skuRecords,
                              variant.scopedPlatforms
                            );
                            const missingCount = Math.max(
                              0,
                              variant.scopedPlatforms.length - activeCount
                            );
                            const lowStock =
                              variant.scopedSellableQty > 0 && variant.scopedSellableQty <= 2;

                            return (
                              <button
                                key={variant.skuId}
                                type="button"
                                onClick={() => setSelectedVariantSkuId(variant.skuId)}
                                className={cn(
                                  "grid w-full gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                                  selectedVariant?.skuId === variant.skuId
                                    ? "border-primary/40 bg-primary/5"
                                    : "bg-background/80 hover:bg-muted/50"
                                )}
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {shortVariantName(product.skuName, variant.skuName)}
                                  </p>
                                  <SkuCodeLine code={variant.skuCode} />
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {activeCount === 0 ? (
                                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                        未上架
                                      </Badge>
                                    ) : missingCount > 0 ? (
                                      <StockMetricBadge
                                        label="待平台"
                                        value={missingCount}
                                        tone="amber"
                                      />
                                    ) : (
                                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                        已覆盖
                                      </Badge>
                                    )}
                                    {lowStock ? (
                                      <Badge
                                        variant="outline"
                                        className="h-5 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-800"
                                      >
                                        快没货
                                      </Badge>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                                  <StockMetricBadge
                                    label="现货"
                                    value={variant.scopedSellableQty}
                                    tone={variant.scopedSellableQty > 0 ? "green" : "muted"}
                                  />
                                  <StockMetricBadge
                                    label="在途"
                                    value={variant.scopedInTransitQty}
                                    tone={variant.scopedInTransitQty > 0 ? "blue" : "muted"}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </DetailSection>
                    </div>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <DetailSection title="新品批次">
                      <div className="grid gap-2 sm:grid-cols-4">
                        <CompactChannelRow
                          label="现货"
                          metrics={[
                            {
                              label: "数量",
                              value: detailProduct.sellableLotQty,
                              tone: detailProduct.sellableLotQty > 0 ? "green" : "muted",
                            },
                          ]}
                        />
                        <CompactChannelRow
                          label="在途"
                          metrics={[
                            {
                              label: "数量",
                              value: detailLotInTransitQty,
                              tone: detailLotInTransitQty > 0 ? "blue" : "muted",
                            },
                          ]}
                        />
                        <CompactChannelRow
                          label="已上架"
                          metrics={[
                            {
                              label: "Listing",
                              value: detailNewStockSummary.activeListingCount,
                              tone:
                                detailNewStockSummary.activeListingCount > 0 ? "green" : "muted",
                            },
                          ]}
                        />
                        <CompactChannelRow
                          label="待平台"
                          metrics={[
                            {
                              label: "平台",
                              value: detailNewStockSummary.pendingListingCount,
                              tone:
                                detailNewStockSummary.pendingListingCount > 0 ? "amber" : "muted",
                            },
                          ]}
                        />
                      </div>

                      {detailProduct.sellableLotQty > 0 || detailLotInTransitQty > 0 ? (
                        <SellableStockBreakdown
                          product={detailProduct}
                          hideTotal
                          totalQty={detailProduct.sellableLotQty}
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
                        <ListingPlatformStrip
                          product={detailProduct}
                          platforms={detailDisplayPlatforms}
                          onAddPlatform={openAdd}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          SKU Listing
                        </p>
                        {detailSkuListingRecords.length === 0 ? (
                          <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            暂无记录
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {detailSkuListingRecords.map((record) => (
                              <li key={record.listingId}>
                                <ListingRecordCompactRow product={detailProduct} record={record} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </DetailSection>

                    <DetailSection title="单件库存">
                      <div className="grid gap-2 sm:grid-cols-4">
                        <CompactChannelRow
                          label="现货"
                          metrics={[
                            {
                              label: "件数",
                              value: detailItemUnitSummary.sellableCount,
                              tone: detailItemUnitSummary.sellableCount > 0 ? "green" : "muted",
                            },
                          ]}
                        />
                        <CompactChannelRow
                          label="在途"
                          metrics={[
                            {
                              label: "件数",
                              value: detailInTransitUnits.length,
                              tone: detailInTransitUnits.length > 0 ? "blue" : "muted",
                            },
                          ]}
                        />
                        <CompactChannelRow
                          label="已上架"
                          metrics={[
                            {
                              label: "Listing",
                              value: detailItemUnitSummary.activeListingCount,
                              tone:
                                detailItemUnitSummary.activeListingCount > 0 ? "green" : "muted",
                            },
                          ]}
                        />
                        <CompactChannelRow
                          label="待上架"
                          metrics={[
                            {
                              label: "件数",
                              value: detailItemUnitSummary.pendingListingCount,
                              tone:
                                detailItemUnitSummary.pendingListingCount > 0 ? "amber" : "muted",
                            },
                          ]}
                        />
                      </div>

                      {detailProduct.hasItemUnits && detailProduct.itemUnits.length > 0 ? (
                        <SellableItemUnitsList
                          units={detailProduct.itemUnits}
                          anchorId={`units-${detailProduct.skuId}`}
                          platforms={product.allPlatforms}
                          records={detailProduct.records}
                        />
                      ) : (
                        <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          暂无单件库存
                        </p>
                      )}

                      {detailPendingItemUnitWork.length > 0 ? (
                        <div className="space-y-1">
                          {detailPendingItemUnitWork.map((unit) => (
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
                        {detailItemUnitListingRecords.length === 0 ? (
                          <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            暂无记录
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {detailItemUnitListingRecords.map((record) => (
                              <li key={record.listingId}>
                                <ListingRecordCompactRow product={detailProduct} record={record} />
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
                  <Link href={detailCatalogHref}>
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                      商品档案
                    </Button>
                  </Link>
                  {detailSellableUnits.length === 1 ? (
                    <Link
                      href={withReturnTo(
                        `/inventory/items/${detailSellableUnits[0].id}`,
                        currentHref
                      )}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                      >
                        单件
                      </Button>
                    </Link>
                  ) : detailSellableUnits.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => {
                        const el = document.getElementById(`units-${detailProduct.skuId}`);
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
        product={cardProduct}
        initialPlatformId={addPlatformId}
      />
    </>
  );
}
