import { AlertTriangle, CheckCircle, PackageCheck, PackageX, PanelsTopLeft } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import type { ListingCoverageStats as ListingCoverageStatsType } from "@/lib/application/listing-coverage";

interface ListingCoverageStatsProps {
  stats: ListingCoverageStatsType;
}

export function ListingCoverageStats({ stats }: ListingCoverageStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      <StatCard
        title="覆盖商品"
        value={stats.totalProducts}
        subtitle="按 SKU / 单品聚合"
        icon={PanelsTopLeft}
      />
      <StatCard
        title="已有平台"
        value={stats.activeProducts}
        subtitle="至少一个平台在售"
        icon={CheckCircle}
        iconColor="text-emerald-500"
      />
      <StatCard
        title="可售商品"
        value={stats.sellableProducts}
        subtitle="库存可直接发货"
        icon={PackageCheck}
        iconColor="text-sky-500"
      />
      <StatCard
        title="覆盖不全"
        value={stats.incompleteProducts}
        subtitle="仍有平台未记录"
        icon={AlertTriangle}
        iconColor="text-amber-500"
      />
      <StatCard
        title="已售罄"
        value={stats.soldOutProducts}
        subtitle="存在售罄平台记录"
        icon={PackageX}
        iconColor="text-slate-500"
      />
    </div>
  );
}
