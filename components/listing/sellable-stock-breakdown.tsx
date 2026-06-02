import Link from "next/link";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import { MapPin } from "lucide-react";

interface SellableStockBreakdownProps {
  product: ListingCoverageProduct;
  /** 顶栏已展示合计时可隐藏，避免重复 */
  hideTotal?: boolean;
  /** 仅展示批次数量时使用（合并卡片） */
  totalQty?: number;
}

export function SellableStockBreakdown({
  product,
  hideTotal = false,
  totalQty,
}: SellableStockBreakdownProps) {
  const sellableLocs = product.sellableLocations;
  const inTransitLocs = product.inTransitLocations;
  const multiWarehouse = sellableLocs.length > 1;
  const displayQty = totalQty ?? product.sellableQty;
  const lotInTransit =
    totalQty !== undefined
      ? product.inTransitQty -
        product.itemUnits.filter((u) => u.inTransit).length
      : product.inTransitQty;

  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-2">
      {!hideTotal ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">可售库存</span>
          <span className="text-base font-semibold tabular-nums tracking-tight">
            {displayQty}
          </span>
        </div>
      ) : null}

      {sellableLocs.length > 0 ? (
        <div className="space-y-1">
          {multiWarehouse ? (
            <p className="text-[10px] text-muted-foreground">
              分布在 {sellableLocs.length} 个可售仓位
            </p>
          ) : null}
          <ul className="space-y-1">
            {sellableLocs.map((loc) => (
              <li key={loc.locationId}>
                <Link
                  href={`/inventory/locations/${loc.locationId}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-background/80"
                >
                  <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate font-medium text-foreground">
                      {loc.code}
                    </span>
                    <span className="truncate text-muted-foreground">{loc.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-foreground">
                    {loc.qty}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : product.locationName ? (
        <p className="text-[11px] text-muted-foreground">
          <MapPin className="mr-1 inline h-3 w-3" />
          {product.locationName}
        </p>
      ) : null}

      {lotInTransit > 0 ? (
        <div className="border-t border-border/60 pt-2">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-muted-foreground">在途（不可售）</span>
            <span className="tabular-nums font-medium">{lotInTransit}</span>
          </div>
          {inTransitLocs.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {inTransitLocs.map((loc) => (
                <li
                  key={loc.locationId}
                  className="flex justify-between text-[10px] text-muted-foreground"
                >
                  <span>{loc.code}</span>
                  <span className="tabular-nums">{loc.qty}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
