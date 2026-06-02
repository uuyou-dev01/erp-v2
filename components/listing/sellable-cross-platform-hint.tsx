import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import {
  buildListingCreateHref,
  getMissingPlatforms,
} from "@/lib/application/sellable-listing-guide";

interface SellableCrossPlatformHintProps {
  product: ListingCoverageProduct;
}

export function SellableCrossPlatformHint({ product }: SellableCrossPlatformHintProps) {
  const missing = getMissingPlatforms(product);
  const isFirstListing = product.records.length === 0;

  if (missing.length === 0 && !isFirstListing) return null;

  if (missing.length === 0 && isFirstListing) {
    return (
      <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-4 text-center">
        <p className="text-sm font-medium">新入库 · 待首次上架</p>
        <p className="mt-1 text-xs text-muted-foreground">
          请先在「销售平台配置」中添加平台，再记录上架。
        </p>
        <Link href={buildListingCreateHref(product)} className="mt-3 inline-block">
          <Button size="sm">添加上架记录</Button>
        </Link>
      </div>
    );
  }

  return (
    <div
      className={
        isFirstListing
          ? "rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-3"
          : "rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-3"
      }
    >
      <p className="text-xs font-medium text-foreground">
        {isFirstListing ? "新入库 · 待首次上架" : "还可上架到其他平台"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isFirstListing
          ? "从销售平台配置中选择平台，记录该商品已在某平台上架。"
          : `已在 ${product.records.filter((r) => r.state === "active").length} 个平台有记录，以下平台尚未覆盖：`}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(isFirstListing ? missing.slice(0, 4) : missing).map((platform) => (
          <Link key={platform.id} href={buildListingCreateHref(product, platform.id)}>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 pr-2">
              <ListingPlatformMark
                code={platform.code}
                name={platform.name}
                className="h-5 w-5"
              />
              <span>{platform.name}</span>
              <Plus className="h-3 w-3 opacity-60" />
            </Button>
          </Link>
        ))}
        {isFirstListing && missing.length > 4 ? (
          <Link href={buildListingCreateHref(product)}>
            <Button variant="ghost" size="sm">
              更多平台…
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
