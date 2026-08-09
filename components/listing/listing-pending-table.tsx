"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { BatchListingDialog } from "@/components/listing/batch-listing-dialog";
import type { ListingPendingItem, ListingPendingPlatform } from "@/lib/application/listing-pending";
import { CheckCircle, PackageOpen, Plus, Truck } from "lucide-react";
import { formatItemUnitCondition } from "@/lib/inventory/item-unit-display";

interface ListingPendingTableProps {
  storeId: string;
  items: ListingPendingItem[];
  platforms: ListingPendingPlatform[];
}

type PendingTab = "sellable" | "inTransit";

function stockLabel(item: ListingPendingItem) {
  if (item.sellableQty > 0) return `可发 ${item.sellableQty}`;
  if (item.inTransitQty > 0) return `转运 ${item.inTransitQty}`;
  return "无库存";
}

function listingCreateHref(item: ListingPendingItem, platformId?: string) {
  const params = new URLSearchParams();
  params.set("listingType", item.type);
  if (platformId) params.set("platformId", platformId);
  if (item.type === "ITEM_UNIT" && item.itemUnitId) {
    params.set("itemUnitId", item.itemUnitId);
  } else {
    params.set("skuId", item.skuId);
  }
  return `/listing/new?${params.toString()}`;
}

export function ListingPendingTable({ storeId, items, platforms }: ListingPendingTableProps) {
  const [tab, setTab] = useState<PendingTab>("sellable");

  const { sellableItems, inTransitItems } = useMemo(() => {
    return {
      sellableItems: items.filter((item) => item.sellableQty > 0),
      inTransitItems: items.filter((item) => item.sellableQty === 0 && item.inTransitQty > 0),
    };
  }, [items]);

  const visibleItems = tab === "sellable" ? sellableItems : inTransitItems;
  const batchSkus = sellableItems
    .filter((item) => item.type === "SKU")
    .map((item) => ({
      id: item.skuId,
      code: item.skuCode,
      name: item.skuName,
      sellableQty: item.sellableQty,
      inTransitQty: item.inTransitQty,
    }));

  const columns: Column<ListingPendingItem>[] = [
    {
      key: "product",
      header: "商品",
      cell: (item) => (
        <div className="flex min-w-0 items-center gap-3">
          <ProductImage src={item.imageUrl} alt={item.skuName} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{item.skuCode}</p>
              <Badge variant={item.type === "ITEM_UNIT" ? "secondary" : "outline"}>
                {item.type === "ITEM_UNIT" ? "中古单品" : "SKU"}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{item.skuName}</p>
            {item.conditionGrade || item.locationName ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {[formatItemUnitCondition(item.conditionGrade), item.locationName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "stock",
      header: "可售状态",
      cell: (item) => (
        <div className="space-y-1">
          {item.sellableQty > 0 ? (
            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700">
              <CheckCircle className="mr-1 h-3 w-3" />
              可发 {item.sellableQty}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700">
              <Truck className="mr-1 h-3 w-3" />
              转运 {item.inTransitQty}
            </Badge>
          )}
          <p className="text-xs text-muted-foreground">
            {(item.sellableQty > 0 ? item.sellableLocations : item.inTransitLocations)
              .map((location) => `${location.code} ${location.qty}`)
              .join(" · ") ||
              item.locationName ||
              stockLabel(item)}
          </p>
        </div>
      ),
    },
    {
      key: "platforms",
      header: "平台覆盖",
      cell: (item) => (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {item.activePlatforms.length > 0 ? (
              item.activePlatforms.map((platform) => (
                <Badge key={platform.id} variant="default">
                  {platform.name}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">暂无在售平台</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            可创建 {item.availablePlatforms.length} 个平台
          </p>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: "price",
      header: "建议售价",
      cell: (item) =>
        item.suggestedPrice ? (
          <span className="font-mono text-sm">
            {item.suggestedCurrency ?? ""} {item.suggestedPrice}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">暂无参考价</span>
        ),
      hideOnMobile: true,
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      cell: (item) => {
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {item.availablePlatforms.length === 0 ? (
              <Button size="sm" disabled>
                已覆盖
              </Button>
            ) : (
              item.availablePlatforms.slice(0, 3).map((platform) => (
                <Link key={platform.id} href={listingCreateHref(item, platform.id)}>
                  <Button size="sm">
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    记录到 {platform.name}
                  </Button>
                </Link>
              ))
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-lg border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setTab("sellable")}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === "sellable" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            可发货 {sellableItems.length}
          </button>
          <button
            type="button"
            onClick={() => setTab("inTransit")}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === "inTransit" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            仅转运 {inTransitItems.length}
          </button>
        </div>
        <BatchListingDialog storeId={storeId} platforms={platforms} skus={batchSkus} />
      </div>

      <ResponsiveTable
        columns={columns}
        data={visibleItems}
        keyExtractor={(item) => item.id}
        emptyState={
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <PackageOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">暂无待上架检查</h3>
            <p className="text-sm text-muted-foreground">当前筛选下没有需要补充平台覆盖的商品。</p>
          </div>
        }
      />
    </div>
  );
}
