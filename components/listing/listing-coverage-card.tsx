"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import {
  SkuQuickEditDialog,
  type SkuQuickEditTarget,
} from "@/components/inventory/sku-quick-edit-dialog";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
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
import {
  buildProductInventoryEntryHref,
  buildProductStocktakeHref,
} from "@/lib/application/inventory-dashboard";
import { productKindLabel } from "@/lib/application/sku-catalog";
import { formatCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  MapPin,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Plus,
  X,
} from "lucide-react";

interface ListingCoverageCardProps {
  product: ListingCoverageProduct;
  storeId: string;
  focusLocationId?: string;
  focusMarket?: SellableMarketCode;
  categoryOptions?: string[];
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

function platformCoverageStatusLabel(platform: ListingCoveragePlatform) {
  if (platform.state === "missing") return "未上架";
  if (platform.state === "sold_out") return "已上架（已售罄）";
  if (platform.state === "delisted") return "已下架";
  return "已上架";
}

function platformCoverageTitle(platform: ListingCoveragePlatform) {
  return `${platform.name} ${platformCoverageStatusLabel(platform)}`;
}

function PlatformCoverageDots({
  platforms,
  maxVisible = 3,
}: {
  platforms: ListingCoveragePlatform[];
  maxVisible?: number;
}) {
  if (platforms.length === 0) return null;

  const visiblePlatforms = platforms.slice(0, maxVisible);
  const hiddenPlatforms = platforms.slice(maxVisible);
  const hiddenTitle = hiddenPlatforms.map(platformCoverageTitle).join("；");

  return (
    <div className="flex min-w-0 flex-nowrap items-center justify-end gap-0.5">
      {visiblePlatforms.map((platform) => {
        const isListed = platform.state === "active" || platform.state === "sold_out";

        return (
          <span
            key={platform.id}
            title={platformCoverageTitle(platform)}
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
      {hiddenPlatforms.length > 0 ? (
        <details className="group relative shrink-0">
          <summary
            title={hiddenTitle}
            aria-label={`查看其余 ${hiddenPlatforms.length} 个平台`}
            className="inline-flex h-4 min-w-4 cursor-pointer list-none items-center justify-center rounded-full border bg-muted px-1 text-[9px] font-semibold tabular-nums text-muted-foreground hover:border-primary/30 hover:text-foreground [&::-webkit-details-marker]:hidden"
          >
            +{hiddenPlatforms.length}
          </summary>
          <div className="absolute right-0 top-5 z-40 max-h-64 w-56 overflow-y-auto rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
            {hiddenPlatforms.map((platform) => {
              const isListed = platform.state === "active" || platform.state === "sold_out";
              return (
                <div
                  key={`${platform.id}-overflow`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <ListingPlatformMark
                    code={platform.code}
                    name={platform.name}
                    muted={!isListed}
                    className="h-5 w-5 shrink-0 rounded border-0 bg-transparent p-0 text-[9px] shadow-none"
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px]">{platform.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px]",
                      isListed ? "text-emerald-700" : "text-muted-foreground"
                    )}
                  >
                    {platformCoverageStatusLabel(platform)}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function LocationDistribution({
  locations,
}: {
  locations: ListingCoverageProduct["sellableLocations"];
}) {
  if (locations.length === 0) {
    return <span className="text-muted-foreground">暂无可售仓</span>;
  }

  const shown = locations.slice(0, 2);
  const restCount = Math.max(0, locations.length - shown.length);
  const locationLabel = (location: (typeof locations)[number]) => location.name || location.code;

  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
      <MapPin className="h-3 w-3 shrink-0" />
      <span className="min-w-0 truncate">
        {shown.map((location) => `${locationLabel(location)} ${location.qty}`).join(" / ")}
        {restCount > 0 ? ` / +${restCount}仓` : ""}
      </span>
    </span>
  );
}

export function ListingCoverageCard({
  product,
  storeId,
  focusLocationId,
  focusMarket,
  categoryOptions = [],
}: ListingCoverageCardProps) {
  const [mounted, setMounted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [addPlatformId, setAddPlatformId] = useState<string | undefined>();
  const [addListingScope, setAddListingScope] = useState<"SKU" | "ITEM_UNIT" | undefined>();
  const [addItemUnitId, setAddItemUnitId] = useState<string | undefined>();
  const [selectedVariantSkuId, setSelectedVariantSkuId] = useState<string | null>(null);
  const [quickEditTarget, setQuickEditTarget] = useState<SkuQuickEditTarget | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

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
        brand: selectedVariant.brand ?? product.brand,
        categoryId: selectedVariant.categoryId ?? product.categoryId,
        category: selectedVariant.category ?? product.category,
        productKind: selectedVariant.productKind ?? product.productKind,
        referencePrice: selectedVariant.referencePrice ?? product.referencePrice,
        referenceCurrency: selectedVariant.referenceCurrency ?? product.referenceCurrency,
        catalogStatus: selectedVariant.catalogStatus ?? product.catalogStatus,
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
  const detailRisks = [
    ...new Map(
      detailRecords
        .flatMap((record) => record.risks)
        .map((risk) => [`${risk.key}:${risk.label}`, risk] as const)
    ).values(),
  ];
  const detailItemUnits = selectedVariant ? selectedVariant.scopedItemUnits : product.itemUnits;
  const detailSellableUnits = detailItemUnits.filter((unit) => unit.sellable);
  const detailInTransitUnits = detailItemUnits.filter((unit) => unit.inTransit);
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
        brand: selectedVariant.brand ?? product.brand,
        categoryId: selectedVariant.categoryId ?? product.categoryId,
        category: selectedVariant.category ?? product.category,
        productKind: selectedVariant.productKind ?? product.productKind,
        referencePrice: selectedVariant.referencePrice ?? product.referencePrice,
        referenceCurrency: selectedVariant.referenceCurrency ?? product.referenceCurrency,
        catalogStatus: selectedVariant.catalogStatus ?? product.catalogStatus,
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
  const detailCatalogHref = withReturnTo(`/inventory/skus/${detailProduct.skuId}`, currentHref);
  const palletLabel = focusMarket ? marketLabel(focusMarket) : product.marketLabel;
  const displayedVariantViews =
    visibleVariantViews.length > 0 ? visibleVariantViews.slice(0, 2) : variantViews.slice(0, 2);
  const hasVariantChildren = product.variantRows.some((variant) => variant.skuId !== product.skuId);
  const skuCount = visibleVariantViews.length || product.variantRows.length || 1;
  const readySkuCount = visibleVariantViews.filter(
    (variant) => variant.scopedSellableQty > 0
  ).length;
  const transitSkuCount = variantViews.filter((variant) => variant.scopedInTransitQty > 0).length;
  const headerMeta = [product.brand, product.category].filter(Boolean).join(" · ");
  const primaryActionLabel = cardProduct.records.length === 0 ? "首上架" : "补平台";
  const coverageVariantViews = visibleVariantViews.length > 0 ? visibleVariantViews : variantViews;
  const variantPlatformCoverage = new Map(
    variantViews.map((variant) => {
      const platforms = platformStateFromRecords(variant.scopedPlatforms, variant.scopedRecords);
      const activeCount = activePlatformCount(variant.scopedRecords, variant.scopedPlatforms);
      return [
        variant.skuId,
        {
          platforms,
          activeCount,
          fullyCovered: platforms.length > 0 && activeCount === platforms.length,
        },
      ] as const;
    })
  );
  const fullyCoveredSkuCount = coverageVariantViews.filter(
    (variant) => variantPlatformCoverage.get(variant.skuId)?.fullyCovered
  ).length;
  const listedSkuCount = coverageVariantViews.filter(
    (variant) => (variantPlatformCoverage.get(variant.skuId)?.activeCount ?? 0) > 0
  ).length;
  const stockFormLabel =
    product.hasLotStock && product.hasItemUnits
      ? "混合库存"
      : product.hasItemUnits
        ? "单件库存"
        : "批量库存";

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

  useEffect(() => {
    if (!actionsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsOpen]);

  const openAdd = (
    platformId?: string,
    options?: { listingScope?: "SKU" | "ITEM_UNIT"; itemUnitId?: string }
  ) => {
    setAddPlatformId(platformId);
    setAddListingScope(options?.listingScope);
    setAddItemUnitId(options?.itemUnitId);
    setAddOpen(true);
  };

  const openProductQuickEdit = () => {
    setQuickEditTarget({
      id: product.skuId,
      code: product.skuCode,
      name: product.skuName,
      brand: product.brand,
      categoryId: product.categoryId,
      category: product.category,
    });
  };

  return (
    <>
      <article className="grid gap-3 rounded-lg border bg-card p-3 shadow-sm transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-md xl:grid-cols-[minmax(210px,1.35fr)_82px_108px_minmax(170px,1.15fr)_minmax(125px,.8fr)_104px_96px_154px] xl:items-center">
        <div className="min-w-0">
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground xl:hidden">
            商品信息
          </span>
          <div className="flex min-w-0 items-center gap-2.5">
            <ProductImage
              src={product.imageUrl}
              alt={product.skuName}
              size="lg"
              className="h-11 w-11 shrink-0 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="block w-full truncate rounded-sm text-left text-sm font-semibold leading-tight hover:text-primary"
              >
                {product.skuName}
              </button>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "min-w-0 truncate text-[10px]",
                    headerMeta ? "text-muted-foreground" : "text-amber-700"
                  )}
                >
                  {headerMeta || "品牌 / 品类待补充"}
                </span>
                <button
                  type="button"
                  onClick={openProductQuickEdit}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium hover:bg-muted",
                    product.category
                      ? "text-muted-foreground hover:text-foreground"
                      : "bg-amber-500/10 text-amber-700 hover:bg-amber-500/15"
                  )}
                  title={product.category ? "编辑商品组信息" : "补充商品品类"}
                >
                  <Pencil className="h-2.5 w-2.5" />
                  {product.category ? "编辑" : "补品类"}
                </button>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {product.skuCode || "未设置货号"}
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground xl:hidden">
            新旧 / 形态
          </span>
          <Badge variant="secondary" className="h-6 rounded-md px-2 text-[11px]">
            {productKindLabel(kind)}
          </Badge>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{stockFormLabel}</p>
        </div>

        <div className="min-w-0">
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground xl:hidden">
            库存
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold tabular-nums leading-none">
              {product.sellableQty}
            </span>
            <span className="text-[10px] text-muted-foreground">现货</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className="tabular-nums">在途 {product.inTransitQty}</span>
            <span className="tabular-nums">单件 {product.sellableItemUnitCount}</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium text-muted-foreground xl:hidden">
              SKU 规格
            </span>
            <span className="text-[10px] text-muted-foreground">
              可售 {readySkuCount}/{skuCount}
              {transitSkuCount > 0 ? ` · ${transitSkuCount} 在途` : ""}
            </span>
          </div>
          <div className="space-y-1">
            {displayedVariantViews.map((variant) => {
              const isSelected = selectedVariant?.skuId === variant.skuId;

              return (
                <div key={variant.skuId} className="flex min-w-0 items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedVariantSkuId(variant.skuId)}
                    className={cn(
                      "flex h-7 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border px-2 text-left transition-colors",
                      isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "bg-background/70 hover:bg-muted/40"
                    )}
                  >
                    <span className="min-w-0 truncate text-[11px] font-medium">
                      {shortVariantName(product.skuName, variant.skuName)}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      现 {variant.scopedSellableQty}
                      {variant.scopedInTransitQty > 0 ? ` · 途 ${variant.scopedInTransitQty}` : ""}
                    </span>
                  </button>
                </div>
              );
            })}
            {visibleVariantViews.length > displayedVariantViews.length ? (
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="h-7 w-full rounded-md border border-dashed px-2 text-left text-[10px] text-muted-foreground hover:bg-muted/40"
              >
                +{visibleVariantViews.length - displayedVariantViews.length} 个 SKU
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground xl:hidden">
            仓位
          </span>
          <LocationDistribution locations={product.sellableLocations} />
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{palletLabel}</p>
        </div>

        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-1">
            <span className="text-[10px] font-medium text-muted-foreground xl:hidden">
              SKU 平台
            </span>
            <span className="truncate text-[10px] tabular-nums text-muted-foreground">
              完整 {fullyCoveredSkuCount}/{coverageVariantViews.length}
            </span>
          </div>
          <div className="space-y-1">
            {displayedVariantViews.map((variant) => (
              <div
                key={`${variant.skuId}-platforms`}
                className="flex h-7 items-center justify-end rounded-md border border-transparent px-1"
                title={`${shortVariantName(product.skuName, variant.skuName)}的平台覆盖`}
              >
                <PlatformCoverageDots
                  platforms={variantPlatformCoverage.get(variant.skuId)?.platforms ?? []}
                  maxVisible={3}
                />
              </div>
            ))}
            {visibleVariantViews.length > displayedVariantViews.length ? (
              <div className="flex h-7 items-center justify-end px-1 text-[10px] text-muted-foreground">
                其余 {visibleVariantViews.length - displayedVariantViews.length} 个见明细
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground xl:hidden">
            状态
          </span>
          {product.aggregateRisks.length > 0 ? (
            <div className="space-y-1">
              <Badge
                variant="outline"
                className={cn(
                  "h-5 max-w-full px-1.5 text-[10px]",
                  riskClassName(product.aggregateRisks[0])
                )}
              >
                <AlertTriangle className="mr-1 h-3 w-3 shrink-0" />
                <span className="truncate">{product.aggregateRisks[0].label}</span>
              </Badge>
              {product.aggregateRisks.length > 1 ? (
                <p className="text-[10px] text-muted-foreground">
                  +{product.aggregateRisks.length - 1} 项风险
                </p>
              ) : null}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              正常
            </span>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {listedSkuCount > 0
              ? `已上架 ${listedSkuCount}/${coverageVariantViews.length} SKU`
              : "未上架"}
          </p>
        </div>

        <div className="min-w-0">
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground xl:hidden">
            操作
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full px-2 text-[11px]"
            onClick={() => openAdd()}
          >
            <Plus className="mr-1 h-3 w-3" />
            {primaryActionLabel}
          </Button>
          <div ref={actionsMenuRef} className="relative mt-1 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 px-0 text-muted-foreground"
              aria-label="更多操作"
              title="更多操作"
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((open) => !open)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {actionsOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-8 z-50 w-36 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg"
              >
                <Link
                  role="menuitem"
                  href={buildProductInventoryEntryHref(cardProduct, currentHref)}
                  onClick={() => setActionsOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-accent"
                >
                  <PackagePlus className="h-4 w-4 text-muted-foreground" />
                  录入库存
                </Link>
                <Link
                  role="menuitem"
                  href={buildProductStocktakeHref(cardProduct, focusLocationId)}
                  onClick={() => setActionsOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-accent"
                >
                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                  调整库存
                </Link>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    setDetailsOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  查看明细
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    openProductQuickEdit();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  {hasVariantChildren ? "编辑商品组" : "编辑商品"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </article>

      {mounted && detailsOpen
        ? createPortal(
            <div className="fixed inset-0 z-[900] flex items-end justify-center p-3 sm:items-center sm:p-4">
              <div className="absolute inset-0 bg-black/45" onClick={() => setDetailsOpen(false)} />
              <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
                <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold tracking-tight">
                        {detailProduct.skuName}
                      </h2>
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {productKindLabel(kind)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      {detailProduct.skuCode && detailProduct.skuCode !== detailProduct.skuName ? (
                        <span className="font-mono">SKU {detailProduct.skuCode}</span>
                      ) : null}
                      {detailProduct.brand ? <span>{detailProduct.brand}</span> : null}
                      <span className={detailProduct.category ? undefined : "text-amber-700"}>
                        {detailProduct.category || "品类待补充"}
                      </span>
                      {detailProduct.referencePrice ? (
                        <span>
                          参考{" "}
                          {formatCurrency(
                            detailProduct.referencePrice,
                            detailProduct.referenceCurrency ?? "CNY"
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={openProductQuickEdit}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {hasVariantChildren ? "编辑商品组" : "编辑信息"}
                    </Button>
                    <Link href={detailCatalogHref}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                      >
                        完整档案
                      </Button>
                    </Link>
                    <span className="mx-1 h-4 w-px bg-border" />
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setDetailsOpen(false)}
                      aria-label="关闭"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="overflow-y-auto px-5 py-4">
                  <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-muted/35 px-3 py-2.5">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">
                        {palletLabel} · {primaryLocationLabel(detailProduct, focusLocationId)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        库存按最终可售仓库口径判断
                      </p>
                    </div>
                    {detailRisks.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {detailRisks.map((risk) => (
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
                  </div>

                  {variantViews.length > 1 ? (
                    <section className="mb-4 border-b pb-4">
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-foreground">选择规格</h3>
                        <span className="text-[10px] text-muted-foreground">
                          库存与上架明细将同步切换
                        </span>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
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
                          const isSelected = selectedVariant?.skuId === variant.skuId;

                          return (
                            <button
                              key={variant.skuId}
                              type="button"
                              onClick={() => setSelectedVariantSkuId(variant.skuId)}
                              className={cn(
                                "min-w-0 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                                isSelected
                                  ? "border-primary/50 bg-primary/5 shadow-sm"
                                  : "bg-background/80 hover:bg-muted/50"
                              )}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-1.5">
                                <p className="min-w-0 truncate font-medium leading-5">
                                  {shortVariantName(product.skuName, variant.skuName)}
                                </p>
                                {activeCount === 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="h-5 shrink-0 px-1.5 text-[10px]"
                                  >
                                    未上架
                                  </Badge>
                                ) : missingCount > 0 ? (
                                  <StockMetricBadge label="待" value={missingCount} tone="amber" />
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="h-5 shrink-0 px-1.5 text-[10px]"
                                  >
                                    已覆盖
                                  </Badge>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  <div className="grid items-start gap-3 lg:grid-cols-2">
                    <section className="rounded-lg border bg-background px-4 py-3.5">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">新品库存</h3>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            批量库存与 SKU 级平台上架
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          按当前规格统计
                        </span>
                      </div>
                      <div className="mb-3 flex items-end gap-8 border-b pb-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground">现货</p>
                          <p className="mt-0.5 text-xl font-semibold tabular-nums">
                            {detailProduct.sellableLotQty}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">在途</p>
                          <p className="mt-0.5 text-xl font-semibold tabular-nums">
                            {detailLotInTransitQty}
                          </p>
                        </div>
                      </div>
                      {detailProduct.sellableLotQty > 0 || detailLotInTransitQty > 0 ? (
                        <SellableStockBreakdown
                          product={detailProduct}
                          hideTotal
                          totalQty={detailProduct.sellableLotQty}
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">当前规格暂无批量库存</p>
                      )}

                      <div className="mt-3 border-t pt-3">
                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-semibold">新品上架平台</h4>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {detailProduct.platforms.length} 个目标平台，仅统计新品库存
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {detailNewStockSummary.activeListingCount > 0 ? (
                              <Badge variant="secondary" className="h-5 text-[10px]">
                                已上架 {detailNewStockSummary.activeListingCount}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="h-5 text-[10px]">
                                未上架
                              </Badge>
                            )}
                            {detailNewStockSummary.pendingListingCount > 0 ? (
                              <StockMetricBadge
                                label="待平台"
                                value={detailNewStockSummary.pendingListingCount}
                                tone="amber"
                              />
                            ) : null}
                          </div>
                        </div>

                        {detailSkuListingRecords.length > 0 ? (
                          <ul className="space-y-1.5">
                            {detailSkuListingRecords.map((record) => (
                              <li key={record.listingId}>
                                <ListingRecordCompactRow product={detailProduct} record={record} />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            当前规格的新品库存尚未建立上架记录
                          </p>
                        )}

                        {detailProduct.sellableLotQty > 0 &&
                        detailNewStockSummary.pendingListingCount > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2.5 h-8 text-xs"
                            onClick={() => openAdd(undefined, { listingScope: "SKU" })}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            {detailNewStockSummary.activeListingCount > 0
                              ? "补充新品平台"
                              : "添加新品上架"}
                          </Button>
                        ) : null}
                      </div>
                    </section>

                    <section className="rounded-lg border bg-background px-4 py-3.5">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">单件库存</h3>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            每一件独立显示库存与平台上架
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          可售 {detailSellableUnits.length}
                        </span>
                      </div>
                      {detailProduct.hasItemUnits && detailProduct.itemUnits.length > 0 ? (
                        <SellableItemUnitsList
                          units={detailProduct.itemUnits}
                          anchorId={`units-${detailProduct.skuId}`}
                          product={detailProduct}
                          records={detailProduct.records}
                          returnTo={currentHref}
                          onAddListing={(unitId) =>
                            openAdd(undefined, {
                              listingScope: "ITEM_UNIT",
                              itemUnitId: unitId,
                            })
                          }
                        />
                      ) : (
                        <p className="border-t pt-3 text-xs text-muted-foreground">
                          当前规格暂无单件库存
                        </p>
                      )}
                    </section>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t bg-muted/15 px-5 py-3">
                  <Link href={buildProductInventoryEntryHref(detailProduct, currentHref)}>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      <PackagePlus className="mr-1 h-3.5 w-3.5" />
                      录入库存
                    </Button>
                  </Link>
                  <Link href={buildProductStocktakeHref(detailProduct, focusLocationId)}>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
                      调整库存
                    </Button>
                  </Link>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {quickEditTarget ? (
        <SkuQuickEditDialog
          open
          sku={quickEditTarget}
          targetLabel={
            quickEditTarget.id === product.skuId && hasVariantChildren ? "商品组" : "SKU"
          }
          categoryOptions={categoryOptions}
          hasVariants={quickEditTarget.id === product.skuId && hasVariantChildren}
          fullDetailHref={withReturnTo(`/inventory/skus/${quickEditTarget.id}`, currentHref)}
          onClose={() => setQuickEditTarget(null)}
        />
      ) : null}

      <QuickAddListingDialog
        storeId={storeId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        product={cardProduct}
        initialPlatformId={addPlatformId}
        initialListingScope={addListingScope}
        initialItemUnitId={addItemUnitId}
      />
    </>
  );
}
