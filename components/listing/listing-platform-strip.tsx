"use client";

import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import { formatListedDaysShort } from "@/lib/application/listing-record-display";
import { cn } from "@/lib/utils";

interface ListingPlatformStripProps {
  product: ListingCoverageProduct;
  onAddPlatform: (platformId: string) => void;
  platforms?: ListingCoverageProduct["platforms"];
}

function findRecordForPlatform(product: ListingCoverageProduct, platformId: string) {
  return product.records.find((record) => record.platformId === platformId);
}

function platformTitle(
  platform: ListingCoverageProduct["platforms"][number],
  record?: ReturnType<typeof findRecordForPlatform>
) {
  if (platform.state === "missing") return `${platform.name} 未上架`;
  if (platform.state === "sold_out") return `${platform.name} 已上架（已售罄）`;
  if (platform.state === "delisted") return `${platform.name} 已下架`;
  if (record) return `${platform.name} 已上架 · ${formatListedDaysShort(record.listedAt)}`;
  return `${platform.name} 已上架`;
}

export function ListingPlatformStrip({
  product,
  onAddPlatform,
  platforms = product.platforms,
}: ListingPlatformStripProps) {
  if (platforms.length === 0) {
    return <p className="text-xs text-muted-foreground">请先在销售平台配置中添加平台</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {platforms.map((platform) => {
        const record = findRecordForPlatform(product, platform.id);
        const isListed = platform.state === "active" || platform.state === "sold_out";
        const isSoldOut = platform.state === "sold_out";
        const isMissing = platform.state === "missing";

        return (
          <button
            key={platform.id}
            type="button"
            title={platformTitle(platform, record)}
            disabled={!isMissing && platform.state === "delisted"}
            onClick={() => {
              if (isMissing) onAddPlatform(platform.id);
            }}
            className={cn(
              "relative rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSoldOut && "opacity-60",
              isMissing && "hover:opacity-80",
              platform.state === "delisted" && "opacity-30 cursor-not-allowed"
            )}
          >
            <ListingPlatformMark
              code={platform.code}
              name={platform.name}
              muted={isMissing || platform.state === "delisted"}
              className={cn(
                "h-5 w-5 rounded-md border-0 bg-transparent p-0 text-[10px] shadow-none",
                isListed && "font-semibold"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
