import Link from "next/link";
import {
  Boxes,
  ClipboardCheck,
  MapPinned,
  PackageCheck,
  Store,
  Truck,
} from "lucide-react";
import { LotImportButton } from "@/components/inventory/lot-import-button";
import { SKUImportButton } from "@/components/inventory/sku-import-button";
import { Button } from "@/components/ui/button";
import type { InventoryDashboardSummary } from "@/lib/application/inventory-dashboard";
import { cn } from "@/lib/utils";

interface InventoryDashboardOverviewProps {
  summary: InventoryDashboardSummary;
  pendingFirstListingCount: number;
  pendingHref: string;
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Boxes;
  tone: string;
}) {
  return (
    <div className="flex min-h-[52px] min-w-[132px] items-center justify-between rounded-md border bg-background px-2.5 py-1.5 sm:min-w-0">
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums leading-none">{value}</span>
          <span className="truncate text-[11px] text-muted-foreground">{detail}</span>
        </div>
      </div>
      <Icon className={cn("h-4 w-4 shrink-0", tone)} />
    </div>
  );
}

export function InventoryDashboardOverview({
  summary,
  pendingFirstListingCount,
  pendingHref,
}: InventoryDashboardOverviewProps) {
  return (
    <section className="rounded-xl border bg-card px-3 py-2.5">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 sm:pb-0 lg:grid-cols-5">
          <Metric
            label="现货"
            value={summary.sellableQty}
            detail={`${summary.productCount} 商品`}
            icon={Boxes}
            tone="text-emerald-600"
          />
          <Metric
            label="在途"
            value={summary.inTransitQty}
            detail="转运 / 不可售"
            icon={Truck}
            tone="text-blue-600"
          />
          <Metric
            label="可操作 SKU"
            value={summary.readySkuCount}
            detail={`${summary.locationCount} 仓位`}
            icon={PackageCheck}
            tone="text-cyan-600"
          />
          <Metric
            label="平台缺口"
            value={summary.listingGapCount}
            detail={`${summary.platformGapCount} 平台 / ${summary.itemUnitGapCount} 单件`}
            icon={Store}
            tone="text-amber-600"
          />
          <Metric
            label="主档待补"
            value={summary.catalogIssueCount}
            detail="图 / 价 / 类目"
            icon={ClipboardCheck}
            tone="text-violet-600"
          />
        </div>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0 xl:max-w-[430px] xl:justify-end">
          <Link href={pendingHref}>
            <Button variant="outline" size="sm" className="h-8 shrink-0">
              首上架 {pendingFirstListingCount}
            </Button>
          </Link>
          <SKUImportButton label="导主档" size="sm" className="h-8 shrink-0" />
          <LotImportButton label="导期初" size="sm" className="h-8 shrink-0" />
          <Link href="/inventory/stocktake">
            <Button variant="outline" size="sm" className="h-8 shrink-0">
              <ClipboardCheck className="h-3.5 w-3.5" />
              盘点
            </Button>
          </Link>
          <Link href="/inventory/locations">
            <Button variant="ghost" size="sm" className="h-8 shrink-0">
              <MapPinned className="h-3.5 w-3.5" />
              仓位
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
