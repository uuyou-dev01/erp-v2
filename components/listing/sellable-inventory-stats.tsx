import Link from "next/link";
import { AlertTriangle, Layers, PackageCheck, PackageOpen } from "lucide-react";
import type { SellableInventoryStats } from "@/lib/application/listing-coverage";
import { cn } from "@/lib/utils";

interface SellableInventoryStatsProps {
  stats: SellableInventoryStats;
}

export function SellableInventoryStats({ stats }: SellableInventoryStatsProps) {
  const items = [
    {
      title: "可售商品",
      value: stats.totalProducts,
      subtitle: "当前货盘",
      icon: PackageCheck,
      iconColor: "text-emerald-500",
    },
    {
      title: "已有上架",
      value: stats.withListings,
      subtitle: "当前筛选",
      icon: Layers,
      iconColor: "text-sky-500",
    },
    {
      title: "待上架",
      value: stats.withoutListings,
      subtitle: "当前筛选",
      icon: PackageOpen,
      iconColor: "text-amber-500",
      href: "/inventory/sellable?unlisted=1",
    },
    {
      title: "在售记录",
      value: stats.activeListingCount,
      subtitle: stats.riskProducts > 0 ? `${stats.riskProducts} 个提醒` : "ACTIVE",
      icon: AlertTriangle,
      iconColor: stats.riskProducts > 0 ? "text-amber-500" : "text-muted-foreground",
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const content = (
          <div className="flex min-h-[58px] items-center justify-between rounded-lg border bg-card px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{item.title}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums leading-none">
                  {item.value}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {item.subtitle}
                </span>
              </div>
            </div>
            <item.icon className={cn("h-4 w-4 shrink-0", item.iconColor)} />
          </div>
        );

        return item.href ? (
          <Link key={item.title} href={item.href}>
            {content}
          </Link>
        ) : (
          <div key={item.title}>{content}</div>
        );
      })}
    </div>
  );
}
