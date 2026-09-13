"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import { formatListedDaysShort } from "@/lib/application/listing-record-display";
import { cn } from "@/lib/utils";

interface ListingPlatformStripProps {
  product: ListingCoverageProduct;
  onAddPlatform: (platformId: string) => void;
  platforms?: ListingCoverageProduct["platforms"];
  showLabels?: boolean;
}

function findRecordForPlatform(product: ListingCoverageProduct, platformId: string) {
  return product.records.find((record) => record.platformId === platformId);
}

function platformTitle(
  platform: ListingCoverageProduct["platforms"][number],
  record?: ReturnType<typeof findRecordForPlatform>
) {
  if (platform.state === "missing") return `${platform.name} 未上架`;
  if (platform.state === "sold_out") return `${platform.name} 已成交（本次上架结束）`;
  if (platform.state === "delisted") return `${platform.name} 已下架`;
  if (record) return `${platform.name} 已上架 · ${formatListedDaysShort(record.listedAt)}`;
  return `${platform.name} 已上架`;
}

function PlatformStripContent({
  platform,
  isListed,
  isMissing,
  showLabels,
  stateLabel,
}: {
  platform: ListingCoverageProduct["platforms"][number];
  isListed: boolean;
  isMissing: boolean;
  showLabels: boolean;
  stateLabel: string;
}) {
  return (
    <>
      <ListingPlatformMark
        code={platform.code}
        name={platform.name}
        muted={isMissing || platform.state === "delisted"}
        className={cn(
          "h-5 w-5 rounded-md border-0 bg-transparent p-0 text-[10px] shadow-none",
          isListed && "font-semibold"
        )}
      />
      {showLabels ? (
        <>
          <span className="max-w-[76px] truncate">{platform.name}</span>
          <span
            className={cn(
              "rounded px-1 text-[10px]",
              isMissing
                ? "bg-amber-500/10 text-amber-700"
                : isListed
                  ? "bg-emerald-500/10 text-emerald-700"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {stateLabel}
          </span>
        </>
      ) : null}
    </>
  );
}

export function ListingPlatformStrip({
  product,
  onAddPlatform,
  platforms = product.platforms,
  showLabels = false,
}: ListingPlatformStripProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

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
        const stateLabel =
          platform.state === "missing"
            ? "待上"
            : platform.state === "sold_out"
              ? "成交"
              : platform.state === "delisted"
                ? "下架"
                : "在售";
        const baseClassName = cn(
          "relative rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          showLabels && "inline-flex items-center gap-1 border bg-background px-2 py-1 text-[11px]",
          isSoldOut && "opacity-60",
          isMissing && "hover:opacity-80",
          platform.state === "delisted" && "opacity-50"
        );
        const content = (
          <PlatformStripContent
            platform={platform}
            isListed={isListed}
            isMissing={isMissing}
            showLabels={showLabels}
            stateLabel={stateLabel}
          />
        );

        if (isMissing) {
          return (
            <button
              key={platform.id}
              type="button"
              title={platformTitle(platform, record)}
              onClick={() => onAddPlatform(platform.id)}
              className={baseClassName}
            >
              {content}
            </button>
          );
        }

        if (platform.listingId) {
          return (
            <Link
              key={platform.id}
              href={`/listing/${platform.listingId}?returnTo=${encodeURIComponent(returnTo)}`}
              title={platformTitle(platform, record)}
              className={cn(baseClassName, "hover:bg-muted/50")}
            >
              {content}
            </Link>
          );
        }

        return (
          <span
            key={platform.id}
            title={platformTitle(platform, record)}
            className={cn(baseClassName, "cursor-default")}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
