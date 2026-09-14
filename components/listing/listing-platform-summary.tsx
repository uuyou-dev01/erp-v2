import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import { summarizeListingPlatforms } from "@/lib/application/listing-platform-summary";
import type { ListingCoverageVariantView } from "@/lib/application/listing-coverage";
import { cn } from "@/lib/utils";

export function ListingPlatformSummary({
  variants,
  onViewPending,
}: {
  variants: ListingCoverageVariantView[];
  onViewPending: (platformId: string, scope: "SKU" | "ITEM_UNIT") => void;
}) {
  const platforms = summarizeListingPlatforms(variants);
  if (!platforms.length) {
    return (
      <p className="text-xs text-muted-foreground">
        {variants.some((variant) => variant.scopedSellableQty > 0)
          ? "暂无适用平台"
          : "暂无可售现货"}
      </p>
    );
  }
  const renderPlatform = (platform: (typeof platforms)[number]) => {
    const missing =
      platform.skuTotal - platform.skuListed + platform.unitTotal - platform.unitListed;
    return (
      <div key={platform.id} className="space-y-1.5 py-2 first:pt-0 last:pb-0">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <ListingPlatformMark
              code={platform.code}
              name={platform.name}
              className="h-4 w-4 shrink-0 rounded border-0 bg-transparent p-0 text-[9px] shadow-none"
            />
            <span className="truncate text-xs font-medium" title={platform.name}>
              {platform.name}
            </span>
          </span>
          <span
            className={cn("shrink-0 text-[11px]", missing ? "text-amber-700" : "text-emerald-700")}
          >
            {missing ? "待上架" : "全部在售"}
          </span>
        </div>
        {[
          { total: platform.skuTotal, listed: platform.skuListed, unit: "SKU" },
          { total: platform.unitTotal, listed: platform.unitListed, unit: "件单品" },
        ]
          .filter((row) => row.total > 0)
          .map((row) => (
            <div key={row.unit}>
              <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
                <span>
                  <span className="font-semibold">{row.listed}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    / {row.total} {row.unit} 在售
                  </span>
                </span>
                {row.listed < row.total ? (
                  <button
                    type="button"
                    className="rounded text-amber-700 underline decoration-amber-700/30 underline-offset-2 hover:decoration-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`查看 ${platform.name} 待上架的 ${row.total - row.listed} ${row.unit}`}
                    onClick={() =>
                      onViewPending(platform.id, row.unit === "SKU" ? "SKU" : "ITEM_UNIT")
                    }
                  >
                    待上 {row.total - row.listed}
                  </button>
                ) : null}
              </div>
              <div aria-hidden="true" className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${(row.listed / row.total) * 100}%` }}
                />
              </div>
            </div>
          ))}
      </div>
    );
  };
  return (
    <div className="space-y-2">
      <div className="divide-y">{platforms.slice(0, 2).map(renderPlatform)}</div>
      {platforms.length > 2 ? (
        <details>
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
            另 {platforms.length - 2} 个平台
          </summary>
          <div className="mt-2 divide-y">{platforms.slice(2).map(renderPlatform)}</div>
        </details>
      ) : null}
    </div>
  );
}
