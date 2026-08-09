import Link from "next/link";
import { ChevronDown, ClipboardCheck, MapPinned, PackagePlus } from "lucide-react";
import { SKUImportButton } from "@/components/inventory/sku-import-button";
import { Button } from "@/components/ui/button";

interface InventoryDashboardActionsProps {
  storeId: string;
  pendingFirstListingCount: number;
  pendingHref: string;
}

export function InventoryDashboardActions({
  storeId,
  pendingFirstListingCount,
  pendingHref,
}: InventoryDashboardActionsProps) {
  return (
    <div className="relative z-20 flex flex-wrap justify-end gap-1.5">
      <Link href={pendingHref}>
        <Button variant="outline" size="sm" className="h-9 shrink-0">
          首上架 {pendingFirstListingCount}
        </Button>
      </Link>
      <SKUImportButton storeId={storeId} label="导主档" size="sm" className="h-9 shrink-0" />
      <details className="group relative">
        <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <ClipboardCheck className="h-3.5 w-3.5" />
          库存操作
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
          <Link
            href="/inventory/lots/new"
            className="flex items-start gap-2.5 rounded-md px-2.5 py-2 hover:bg-accent"
          >
            <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="block text-xs font-medium">录入库存</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                在指定仓库建立新的库存批次
              </span>
            </span>
          </Link>
          <Link
            href="/inventory/stocktake"
            className="flex items-start gap-2.5 rounded-md px-2.5 py-2 hover:bg-accent"
          >
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="block text-xs font-medium">批量调整库存</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                按 SKU 和仓位修正账面数量
              </span>
            </span>
          </Link>
          <Link
            href="/inventory/opening-stock/new"
            className="flex items-start gap-2.5 rounded-md px-2.5 py-2 hover:bg-accent"
          >
            <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-xs font-medium">录入期初库存</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                系统启用时建立初始库存
              </span>
            </span>
          </Link>
        </div>
      </details>
      <Link href="/inventory/locations">
        <Button variant="ghost" size="sm" className="h-9 shrink-0">
          <MapPinned className="h-3.5 w-3.5" />
          仓位
        </Button>
      </Link>
    </div>
  );
}
