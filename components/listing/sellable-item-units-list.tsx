import { ProductImage } from "@/components/ui/product-image";
import { Button } from "@/components/ui/button";
import { ListingRecordCompactRow } from "@/components/listing/listing-record-compact-row";
import type {
  ListingCoverageProduct,
  ListingRecord,
  SellableItemUnitRow,
} from "@/lib/application/listing-coverage";
import { getMissingPlatforms } from "@/lib/application/sellable-listing-guide";
import { MapPin, Plus } from "lucide-react";

const MAX_VISIBLE = 8;

interface SellableItemUnitsListProps {
  units: SellableItemUnitRow[];
  anchorId?: string;
  product: ListingCoverageProduct;
  records?: ListingRecord[];
  onAddListing?: (unitId: string) => void;
}

function conditionDisplayLabel(condition?: string | null) {
  const normalized = condition?.trim().replace(/\s+/g, " ");
  if (!normalized) return "未确认";
  if (normalized === "全新") return "全新";
  if (normalized === "未标注") return "未标";
  const usedMatch = normalized.match(/^二手\s*([A-Z])$/i);
  if (usedMatch) return usedMatch[1].toUpperCase();
  if (/^[SABC]$/i.test(normalized)) return normalized.toUpperCase();
  if (normalized === "LIKE_NEW") return "S";
  if (normalized === "GOOD") return "A";
  if (normalized === "FAIR") return "B";
  if (normalized === "POOR") return "C";
  return normalized.replace(/^二手\s*/i, "");
}

export function SellableItemUnitsList({
  units,
  anchorId,
  product,
  records = [],
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
        {visible.map((unit) => {
          const unitRecords = records.filter(
            (record) =>
              record.itemUnitId === unit.id && record.listingScope === "ITEM_UNIT"
          );
          const canAddListing =
            getMissingPlatforms(product, {
              listingScope: "ITEM_UNIT",
              itemUnitId: unit.id,
            }).length > 0;

          return (
            <article key={unit.id} className="rounded-lg border bg-background/80 p-2">
              <div className="flex items-center gap-2">
                <ProductImage
                  src={unit.imageUrl}
                  alt={conditionDisplayLabel(unit.conditionGrade)}
                  size="sm"
                  className="h-10 w-10 shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    单件商品 · 品相 {conditionDisplayLabel(unit.conditionGrade)}
                  </p>
                  <p className="mt-0.5 inline-flex min-w-0 items-center gap-1 truncate text-[10px] text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {unit.locationName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {onAddListing && canAddListing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onAddListing(unit.id)}
                      title="添加上架"
                      aria-label="添加上架"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>

              {unitRecords.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {unitRecords.map((record) => (
                    <ListingRecordCompactRow
                      key={record.listingId}
                      product={product}
                      record={record}
                    />
                  ))}
                </div>
              ) : null}
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
