import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ShipmentLeg } from "@/lib/application/next-actions";
import { Truck } from "lucide-react";

interface ShipmentTimelineProps {
  legs: ShipmentLeg[];
  className?: string;
}

export function ShipmentTimeline({ legs, className }: ShipmentTimelineProps) {
  if (legs.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无物流段记录</p>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {legs.map((leg) => (
        <div key={leg.id} className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">第 {leg.legIndex} 段</span>
            </div>
            <Badge variant="outline" className="font-normal">
              {leg.statusLabel}
            </Badge>
          </div>
          {leg.trackingNo && (
            <p className="mt-2 text-sm">
              单号：<span className="font-mono">{leg.trackingNo}</span>
            </p>
          )}
          {(leg.fromLocation || leg.toLocation) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[leg.fromLocation, leg.toLocation].filter(Boolean).join(" → ")}
            </p>
          )}
          {leg.etaDate && (
            <p className="mt-1 text-xs text-muted-foreground">
              预计到达：{new Date(leg.etaDate).toLocaleDateString("zh-CN")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
