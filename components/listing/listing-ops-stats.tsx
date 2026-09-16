import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import type { ListingOpsStats as ListingOpsStatsType } from "@/components/listing/listing-ops-types";

interface ListingOpsStatsProps {
  stats: ListingOpsStatsType;
  embedded?: boolean;
}

export function ListingOpsStats({ stats, embedded = false }: ListingOpsStatsProps) {
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
