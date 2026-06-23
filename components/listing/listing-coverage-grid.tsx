import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListingCoverageCard } from "@/components/listing/listing-coverage-card";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";

interface ListingCoverageGridProps {
  products: ListingCoverageProduct[];
  emptyTitle?: string;
  emptyDescription?: string;
  /** 保留兼容旧调用；卡片详情现在统一使用弹窗展示。 */
  expandIfUnlisted?: boolean;
}

export function ListingCoverageGrid({
  products,
  emptyTitle = "暂无符合条件的商品",
  emptyDescription = "调整平台、状态、风险或搜索条件后再查看。",
  expandIfUnlisted: _expandIfUnlisted = false,
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {products.map((product) => (
        <ListingCoverageCard key={product.key} product={product} />
      ))}
    </div>
  );
}
