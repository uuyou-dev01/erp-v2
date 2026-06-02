import { AlertTriangle, CheckCircle, CircleDollarSign, PackageX, RefreshCw } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import type { ListingOpsStats as ListingOpsStatsType } from "@/components/listing/listing-ops-types";

interface ListingOpsStatsProps {
  stats: ListingOpsStatsType;
}

export function ListingOpsStats({ stats }: ListingOpsStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      <StatCard
        title="在售中"
        value={stats.activeCount}
        subtitle="当前 ACTIVE Listing"
        icon={CheckCircle}
        iconColor="text-emerald-500"
      />
      <StatCard
        title="库存不足"
        value={stats.lowStockCount}
        subtitle="在售但可发库存为 0"
        icon={AlertTriangle}
        iconColor="text-amber-500"
      />
      <StatCard
        title="未定价"
        value={stats.unpricedCount}
        subtitle="在售但缺少平台售价"
        icon={CircleDollarSign}
        iconColor="text-sky-500"
      />
      <StatCard
        title="已下架"
        value={stats.delistedCount}
        subtitle="DELISTED Listing"
        icon={PackageX}
        iconColor="text-slate-500"
      />
      <StatCard
        title="长期未售"
        value={stats.staleCount}
        subtitle="上架超过 30 天"
        icon={RefreshCw}
        iconColor="text-orange-500"
      />
    </div>
  );
}
