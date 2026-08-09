import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListingCoverageCard } from "@/components/listing/listing-coverage-card";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import type { SellableMarketCode } from "@/lib/application/sellable-market";

interface ListingCoverageGridProps {
  products: ListingCoverageProduct[];
  storeId: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** 保留兼容旧调用；卡片详情现在统一使用弹窗展示。 */
  expandIfUnlisted?: boolean;
  focusLocationId?: string;
  focusMarket?: SellableMarketCode;
  categoryOptions?: string[];
}

export function ListingCoverageGrid({
  products,
  storeId,
  emptyTitle = "暂无符合条件的商品",
  emptyDescription = "调整平台、状态、风险或搜索条件后再查看。",
  expandIfUnlisted: _expandIfUnlisted = false,
  focusLocationId,
  focusMarket,
  categoryOptions = [],
}: ListingCoverageGridProps) {
  void _expandIfUnlisted;

  if (products.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel="查看可售库存"
        actionHref="/inventory/sellable"
      />
    );
  }

  return (
    <div className="relative">
      <div className="sticky top-0 z-10 hidden grid-cols-[minmax(210px,1.35fr)_82px_108px_minmax(170px,1.15fr)_minmax(125px,.8fr)_104px_96px_154px] items-center gap-3 rounded-lg border bg-muted/95 px-3 py-2 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur xl:grid">
        <span>商品信息</span>
        <span>新旧 / 形态</span>
        <span>库存</span>
        <span>SKU 规格</span>
        <span>仓位</span>
        <span>SKU 平台</span>
        <span>状态</span>
        <span className="text-right">操作</span>
      </div>
      <div className="mt-2 space-y-2">
        {products.map((product) => (
          <ListingCoverageCard
            key={product.key}
            storeId={storeId}
            product={product}
            focusLocationId={focusLocationId}
            focusMarket={focusMarket}
            categoryOptions={categoryOptions}
          />
        ))}
      </div>
    </div>
  );
}
