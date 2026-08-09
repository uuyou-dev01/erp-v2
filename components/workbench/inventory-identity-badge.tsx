import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { itemConditionTypeLabel, normalizeItemConditionType } from "@/lib/inventory/item-condition";

const CONDITION_STYLES: Record<string, string> = {
  NEW: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  USED: "bg-amber-500/10 text-amber-800 border-amber-500/20",
};

interface InventoryIdentityBadgeProps {
  conditionType?: string | null;
  className?: string;
}

export function InventoryIdentityBadge({ conditionType, className }: InventoryIdentityBadgeProps) {
  const normalized = normalizeItemConditionType(conditionType);
  const label = itemConditionTypeLabel(normalized);
  return (
    <Badge
      variant="outline"
      className={cn("h-5 px-1.5 text-[10px] font-normal", CONDITION_STYLES[normalized], className)}
    >
      {label}
    </Badge>
  );
}
