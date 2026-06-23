"use client";

import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import { formatListedDaysShort } from "@/lib/application/listing-record-display";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface ListingPlatformStripProps {
  product: ListingCoverageProduct;
  onAddPlatform: (platformId: string) => void;
}

function findRecordForPlatform(product: ListingCoverageProduct, platformId: string) {
  return product.records.find((record) => record.platformId === platformId);
}

export function ListingPlatformStrip({ product, onAddPlatform }: ListingPlatformStripProps) {
  if (product.platforms.length === 0) {
    return <p className="text-xs text-muted-foreground">请先在销售平台配置中添加平台</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {product.platforms.map((platform) => {
        const record = findRecordForPlatform(product, platform.id);
        const isListed = platform.state === "active" || platform.state === "sold_out";
        const isSoldOut = platform.state === "sold_out";
        const isMissing = platform.state === "missing";

        return (
          <button
            key={platform.id}
            type="button"
            title={
              isMissing
                ? `在 ${platform.name} 添加上架`
                : record
                  ? `${platform.name} · ${formatListedDaysShort(record.listedAt)}`
                  : platform.name
            }
            disabled={!isMissing && platform.state === "delisted"}
            onClick={() => {
              if (isMissing) onAddPlatform(platform.id);
            }}
            className={cn(
              "relative rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSoldOut && "opacity-60",
              isMissing && "opacity-40 grayscale hover:opacity-75 hover:grayscale-0",
              platform.state === "delisted" && "opacity-30 cursor-not-allowed"
            )}
          >
            <ListingPlatformMark
              code={platform.code}
              name={platform.name}
              className={cn(
                "h-5 w-5 rounded-md border-0 bg-transparent p-0 text-[10px] shadow-none",
                isListed && "font-semibold"
              )}
            />
            {isMissing ? (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-background text-muted-foreground">
                <Plus className="h-1.5 w-1.5" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
