import { AlertTriangle, Layers, PackageCheck, PackageOpen } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import type { SellableInventoryStats } from "@/lib/application/listing-coverage";

interface SellableInventoryStatsProps {
  stats: SellableInventoryStats;
}

export function SellableInventoryStats({ stats }: SellableInventoryStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="可售商品"
        value={stats.totalProducts}
        subtitle="库存可直接发货"
        icon={PackageCheck}
        iconColor="text-emerald-500"
      />
      <StatCard
        title="已有上架记录"
        value={stats.withListings}
        subtitle="至少记录到一个平台"
        icon={Layers}
        iconColor="text-sky-500"
      />
      <StatCard
        title="待添加上架"
        value={stats.withoutListings}
        subtitle="可售但尚未记录 · 新入库引导"
        icon={PackageOpen}
        iconColor="text-amber-500"
        href="/inventory/sellable?unlisted=1"
      />
      <StatCard
        title="在售记录"
        value={stats.activeListingCount}
        subtitle={stats.riskProducts > 0 ? `${stats.riskProducts} 个商品有运营提醒` : "ACTIVE 上架记录"}
        icon={AlertTriangle}
      />
    </div>
  );
}
