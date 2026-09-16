import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import type { ListingOpsStats as ListingOpsStatsType } from "@/components/listing/listing-ops-types";

interface ListingOpsStatsProps {
  stats: ListingOpsStatsType;
  embedded?: boolean;
  compact?: boolean;
}

export function ListingOpsStats({
  stats,
  embedded = false,
  compact = false,
}: ListingOpsStatsProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-flex h-6 items-center gap-1 rounded-md bg-emerald-50 px-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          在售 <strong className="tabular-nums text-foreground">{stats.activeCount}</strong>
        </span>
        <span className="inline-flex h-6 items-center gap-1 rounded-md bg-amber-50 px-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          库存不足 <strong className="tabular-nums text-foreground">{stats.lowStockCount}</strong>
        </span>
        <span className="inline-flex h-6 items-center gap-1 rounded-md bg-orange-50 px-2 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
          <Clock3 className="h-3.5 w-3.5" />
          长期未售 <strong className="tabular-nums text-foreground">{stats.staleCount}</strong>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm ${
        embedded ? "border-b bg-muted/15" : "border-y"
      }`}
    >
      <span className="inline-flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        在售 <strong className="tabular-nums">{stats.activeCount}</strong>
      </span>
      <span className="inline-flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        库存不足 <strong className="tabular-nums">{stats.lowStockCount}</strong>
      </span>
      <span className="inline-flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-orange-600" />
        长期未售 <strong className="tabular-nums">{stats.staleCount}</strong>
      </span>
    </div>
  );
}
