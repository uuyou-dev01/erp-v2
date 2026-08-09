import Link from "next/link";
import { ProductImage } from "@/components/ui/product-image";
import { Button } from "@/components/ui/button";
import { ListingRecordCompactRow } from "@/components/listing/listing-record-compact-row";
import type {
  ListingCoverageProduct,
  ListingRecord,
  SellableItemUnitRow,
} from "@/lib/application/listing-coverage";
import { getMissingPlatforms } from "@/lib/application/sellable-listing-guide";
import { ChevronRight, MapPin, Plus } from "lucide-react";
import { formatItemUnitCondition } from "@/lib/inventory/item-unit-display";

const MAX_VISIBLE = 8;

interface SellableItemUnitsListProps {
  units: SellableItemUnitRow[];
  anchorId?: string;
  product: ListingCoverageProduct;
  records?: ListingRecord[];
  returnTo?: string;
  onAddListing?: (unitId: string) => void;
}

function conditionDisplayLabel(condition?: string | null) {
  return formatItemUnitCondition(condition);
}

export function SellableItemUnitsList({
  units,
  anchorId,
  product,
  records = [],
  returnTo,
  onAddListing,
}: SellableItemUnitsListProps) {
  const sellable = units.filter((u) => u.sellable);
  const inTransit = units.filter((u) => u.inTransit);
  const visible = [...sellable, ...inTransit].slice(0, MAX_VISIBLE);
  const hiddenCount = Math.max(sellable.length + inTransit.length - MAX_VISIBLE, 0);

  if (sellable.length === 0 && inTransit.length === 0) return null;

  return (
    <div id={anchorId} className="space-y-2">
      <div className="grid gap-2">
        {visible.map((unit, index) => {
          const unitRecords = records.filter(
            (record) => record.itemUnitId === unit.id && record.listingScope === "ITEM_UNIT"
          );
          const missingPlatforms = getMissingPlatforms(product, {
            listingScope: "ITEM_UNIT",
            itemUnitId: unit.id,
          });
          const activePlatformCount = new Set(
            unitRecords
              .filter((record) => record.state === "active")
              .map((record) => record.platformId)
          ).size;
          const canAddListing = unit.sellable && missingPlatforms.length > 0;
          const itemDetailHref = `/inventory/items/${unit.id}${
            returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
          }`;

          return (
            <article key={unit.id} className="overflow-hidden rounded-lg border bg-background/80">
              <div className="flex items-center gap-2 p-2.5">
                <Link
                  href={itemDetailHref}
                  aria-label={`查看单件 ${index + 1} 详情`}
                  title="查看单件详情"
                  className="group -m-1 flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <ProductImage
                    src={unit.imageUrl}
                    alt={conditionDisplayLabel(unit.conditionGrade)}
                    size="sm"
                    className="h-10 w-10 shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                      单件 {index + 1} · 品相 {conditionDisplayLabel(unit.conditionGrade)}
                    </p>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {unit.locationName}
                      </span>
                      <span>{unit.sellable ? "现货" : "在途"}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {activePlatformCount > 0 ? `已上架 ${activePlatformCount}` : "未上架"}
                    {missingPlatforms.length > 0 ? ` · 待平台 ${missingPlatforms.length}` : ""}
                  </span>
                  {onAddListing && canAddListing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => onAddListing(unit.id)}
                      title="添加上架"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {activePlatformCount > 0 ? "补充平台" : "添加上架"}
                    </Button>
                  ) : null}
                </div>
              </div>

              {unitRecords.length > 0 ? (
                <div className="space-y-1 border-t bg-muted/10 p-2">
                  {unitRecords.map((record) => (
                    <ListingRecordCompactRow
                      key={record.listingId}
                      product={product}
                      record={record}
                    />
                  ))}
                </div>
              ) : (
                <p className="border-t bg-muted/10 px-2.5 py-2 text-[10px] text-muted-foreground">
                  该单件尚未建立上架记录
                </p>
              )}
            </article>
          );
        })}
      </div>

      {hiddenCount > 0 ? (
        <p className="px-1 text-[10px] text-muted-foreground">
          另有 {hiddenCount} 件单件商品，进入商品详情查看完整列表。
        </p>
      ) : null}
    </div>
  );
}
