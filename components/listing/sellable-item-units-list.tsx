import Link from "next/link";
import { ProductImage } from "@/components/ui/product-image";
import type { SellableItemUnitRow } from "@/lib/application/listing-coverage";
import { MapPin } from "lucide-react";

const MAX_VISIBLE = 5;

interface SellableItemUnitsListProps {
  units: SellableItemUnitRow[];
  anchorId?: string;
}

export function SellableItemUnitsList({ units, anchorId }: SellableItemUnitsListProps) {
  const sellable = units.filter((u) => u.sellable);
  const inTransit = units.filter((u) => u.inTransit);
  const visible = sellable.slice(0, MAX_VISIBLE);
  const hiddenCount = Math.max(sellable.length - MAX_VISIBLE, 0);

  if (sellable.length === 0 && inTransit.length === 0) return null;

  return (
    <div id={anchorId} className="space-y-1.5">
      {sellable.length > 0 ? (
        <ul className="space-y-1">
          {visible.map((unit) => (
            <li key={unit.id}>
              <Link
                href={`/inventory/items/${unit.id}`}
                className="flex items-center gap-2 rounded-md border bg-background/80 px-2 py-1.5 text-[11px] transition-colors hover:bg-muted/50"
              >
                <ProductImage
                  src={unit.imageUrl}
                  alt=""
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {unit.conditionGrade ? `品相 ${unit.conditionGrade}` : "中古单件"}
                  </p>
                  <p className="inline-flex items-center gap-1 truncate text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {unit.locationName}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">可售</span>
              </Link>
            </li>
          ))}
          {hiddenCount > 0 ? (
            <li className="px-2 text-[10px] text-muted-foreground">
              另有 {hiddenCount} 件中古可售
            </li>
          ) : null}
        </ul>
      ) : null}

      {inTransit.length > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          在途中古 {inTransit.length} 件（不可售）
        </p>
      ) : null}
    </div>
  );
}
