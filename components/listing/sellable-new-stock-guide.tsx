import Link from "next/link";
import { ArrowRight, Layers, PackageOpen, Sparkles, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import { buildListingCreateHref } from "@/lib/application/sellable-listing-guide";

interface SellableNewStockGuideProps {
  awaitingCount: number;
  expandableCount: number;
  previewProducts: ListingCoverageProduct[];
  fromWorkbench?: boolean;
  showUnlistedFilter?: boolean;
}

export function SellableNewStockGuide({
  awaitingCount,
  expandableCount,
  previewProducts,
  fromWorkbench = false,
  showUnlistedFilter = false,
}: SellableNewStockGuideProps) {
  if (awaitingCount === 0 && expandableCount === 0 && !fromWorkbench) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <Sparkles className="h-5 w-5 shrink-0" />
            <p className="font-semibold">
              {fromWorkbench ? "入库已完成 · 下一步去上架" : "新入库商品待上架"}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {fromWorkbench
              ? "工作台里的采购/分流流程已结束，商品已进入可售库存。请在此为它们添加首个平台上架记录。"
              : "可售库存中已有新到货商品尚未记录上架。建议先记录主销平台，再按需扩展到其他平台。"}
          </p>

          <ol className="grid gap-2 text-sm sm:grid-cols-3">
            <li className="flex gap-2 rounded-lg border bg-background/70 px-3 py-2">
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">① 工作台入库</span>
                <br />
                <span className="text-muted-foreground">采购收货、确认可售位置</span>
              </span>
            </li>
            <li className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <PackageOpen className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <span>
                <span className="font-medium">② 添加上架记录</span>
                <br />
                <span className="text-muted-foreground">
                  {awaitingCount > 0 ? `${awaitingCount} 个待首次上架` : "已完成首次上架"}
                </span>
              </span>
            </li>
            <li className="flex gap-2 rounded-lg border bg-background/70 px-3 py-2">
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">③ 扩展其他平台</span>
                <br />
                <span className="text-muted-foreground">
                  {expandableCount > 0
                    ? `${expandableCount} 个可继续上架`
                    : "主平台记录后可复制到其他平台"}
                </span>
              </span>
            </li>
          </ol>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          {awaitingCount > 0 ? (
            <Link href="/inventory/sellable?unlisted=1">
              <Button className="w-full sm:w-auto">
                查看待上架 ({awaitingCount})
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : null}
          <Link href="/workbench?queue=pendingListing">
            <Button variant="outline" className="w-full sm:w-auto">
              返回工作台待上架
            </Button>
          </Link>
        </div>
      </div>

      {showUnlistedFilter && previewProducts.length > 0 ? (
        <div className="border-t bg-muted/20 px-5 py-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            待首次上架（节选）
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {previewProducts.slice(0, 6).map((product) => (
              <li
                key={product.key}
                className="flex items-center gap-3 rounded-xl border bg-background p-3"
              >
                <ProductImage
                  src={product.imageUrl}
                  alt={product.skuName}
                  size="sm"
                  className="rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product.skuName}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {product.skuCode} · 可售 {product.sellableQty}
                  </p>
                </div>
                <Link href={buildListingCreateHref(product)}>
                  <Button size="sm" variant="secondary">
                    去上架
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
