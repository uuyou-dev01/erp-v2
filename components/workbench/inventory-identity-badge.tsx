import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CONDITION_STYLES: Record<string, string> = {
  新品: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  中古: "bg-amber-500/10 text-amber-800 border-amber-500/20",
  瑕疵: "bg-orange-500/10 text-orange-800 border-orange-500/20",
  非统一: "bg-muted text-muted-foreground",
};

interface InventoryIdentityBadgeProps {
  conditionType?: string | null;
  className?: string;
}

export function InventoryIdentityBadge({ conditionType, className }: InventoryIdentityBadgeProps) {
  const label = conditionType?.trim() || "新品";
  return (
    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] font-normal", CONDITION_STYLES[label] ?? CONDITION_STYLES["新品"], className)}>
      {label}
    </Badge>
  );
}
