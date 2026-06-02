"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
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
import {
  AlertTriangle,
  ChevronDown,
  Eye,
  Plus,
} from "lucide-react";

interface ListingCoverageCardProps {
  product: ListingCoverageProduct;
  defaultExpanded?: boolean;
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

function collapsedStockLine(product: ListingCoverageProduct) {
  const parts: string[] = [];
  if (product.sellableLotQty > 0) {
    const locs = product.sellableLocations;
    if (locs.length > 0) {
      const detail = locs.map((loc) => `${loc.code} ${loc.qty}`).join(" · ");
      parts.push(`批次 ${product.sellableLotQty} · ${detail}`);
    } else {
      parts.push(`批次 ${product.sellableLotQty}`);
    }
  }
  if (product.sellableItemUnitCount > 0) {
    parts.push(`中古 ${product.sellableItemUnitCount} 件`);
  }
  if (parts.length === 0) return `可售 ${product.sellableQty}`;
  return parts.join(" · ");
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

export function ListingCoverageCard({
  product,
  defaultExpanded = false,
}: ListingCoverageCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [addPlatformId, setAddPlatformId] = useState<string | undefined>();

  const hasUnlisted = product.records.length === 0;
  const missingPlatforms = countMissingPlatforms(product);
  const summary = listingSummary(product);
  const kind = product.hasItemUnits && !product.hasLotStock ? "USED" : product.productKind;
  const sellableUnits = product.itemUnits.filter((u) => u.sellable);
  const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const catalogHref = withReturnTo(`/inventory/skus/${product.skuId}`, currentHref);

  const openAdd = (platformId?: string) => {
    setAddPlatformId(platformId);
    setAddOpen(true);
  };

  return (
    <>
      <article
        className={cn(
          "flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow",
          expanded && "shadow-md"
        )}
      >
        {/* 共用顶栏：折叠/展开均保留，避免重复商品头图 */}
        <div
          className={cn(
            "flex items-stretch gap-0",
            expanded && "border-b"
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
            aria-expanded={expanded}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-180"
              )}
            />
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

        {!expanded ? (
          <div className="space-y-2 px-3 pb-3 pt-1">
            <p className="truncate text-[11px] text-muted-foreground">
              {collapsedStockLine(product)}
            </p>

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
                onClick={() => setExpanded(true)}
              >
                展开
              </Button>
              <Link href={catalogHref}>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
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

              {product.hasLotStock ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    批次库存
                  </p>
                  <SellableStockBreakdown
                    product={product}
                    hideTotal
                    totalQty={product.sellableLotQty}
                  />
                </div>
              ) : null}

              {product.hasItemUnits ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    中古单件（{product.sellableItemUnitCount} 件可售）
                  </p>
                  <SellableItemUnitsList units={product.itemUnits} anchorId={`units-${product.skuId}`} />
                </div>
              ) : null}

              {product.aggregateRisks.length > 0 ? (
                <div className="flex flex-wrap gap-1">
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

              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  平台覆盖
                </p>
                <ListingPlatformStrip product={product} onAddPlatform={openAdd} />
                {hasUnlisted ? (
                  <p className="text-[11px] text-muted-foreground">
                    点击灰色平台图标快速添加上架记录
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2 border-t bg-muted/15 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                已上架
              </p>
              {product.records.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">暂无记录</p>
              ) : (
                <ul className="space-y-1.5">
                  {product.records.map((record) => (
                    <li key={record.listingId}>
                      <ListingRecordCompactRow product={product} record={record} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-4 py-3">
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
                  href={withReturnTo(
                    `/inventory/items/${sellableUnits[0].id}`,
                    currentHref
                  )}
                >
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
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
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-8 text-xs text-muted-foreground"
                onClick={() => setExpanded(false)}
              >
                收起
              </Button>
            </div>
          </>
        )}
      </article>

      <QuickAddListingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        product={product}
        initialPlatformId={addPlatformId}
      />
    </>
  );
}
