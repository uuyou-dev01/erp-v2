"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ListingOpsPlatform } from "@/components/listing/listing-ops-types";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import {
  inferMarketFromPlatform,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";
import { Search } from "lucide-react";

interface ListingOpsToolbarProps {
  platforms: ListingOpsPlatform[];
  basePath?: string;
  activePlatformId?: string;
  activeMarket?: SellableMarketCode;
  status?: string;
  risk?: string;
  sort?: string;
  query?: string;
  showStockSort?: boolean;
  scopeLabel?: string;
  showStatusFilter?: boolean;
  showSoldOutStatus?: boolean;
  showRiskFilter?: boolean;
  embedded?: boolean;
}

function withParam(
  searchParams: { toString(): string },
  basePath: string,
  key: string,
  value?: string
) {
  const params = new URLSearchParams(searchParams.toString());
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function withParams(
  searchParams: { toString(): string },
  basePath: string,
  values: Record<string, string | undefined>
) {
  const params = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }
  params.delete("page");
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

const MARKET_OPTIONS: Array<{ value: SellableMarketCode; label: string }> = [
  { value: "JP", label: "日本" },
  { value: "CN", label: "中国" },
  { value: "GLOBAL", label: "全球" },
  { value: "US", label: "美国" },
  { value: "EU", label: "欧洲" },
  { value: "UNKNOWN", label: "未归类" },
];

function platformMarket(platform: ListingOpsPlatform) {
  return inferMarketFromPlatform({
    code: platform.code,
    country: platform.country ?? null,
  });
}

export function ListingOpsToolbar({
  platforms,
  basePath = "/listing",
  activePlatformId,
  activeMarket,
  status,
  risk,
  sort,
  query,
  showStockSort = false,
  scopeLabel,
  showStatusFilter = true,
  showSoldOutStatus = true,
  showRiskFilter = true,
  embedded = false,
}: ListingOpsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(query ?? "");
  const selectedPlatform = platforms.find((platform) => platform.id === activePlatformId);
  const effectiveMarket = selectedPlatform ? platformMarket(selectedPlatform) : activeMarket;
  const groupedPlatforms = MARKET_OPTIONS.map((market) => ({
    ...market,
    platforms: platforms.filter((platform) => platformMarket(platform) === market.value),
  })).filter((market) => market.platforms.length > 0);
  const visiblePlatformGroups = effectiveMarket
    ? groupedPlatforms.filter((market) => market.value === effectiveMarket)
    : groupedPlatforms;

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (search.trim()) {
      params.set("q", search.trim());
    } else {
      params.delete("q");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className={embedded ? "bg-card" : "rounded-xl border bg-card"}>
      <div className="flex items-center gap-2 overflow-x-auto border-b px-3 py-2.5">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">地区</span>
        <Link
          href={withParams(searchParams, basePath, { market: undefined, platformId: undefined })}
        >
          <Button
            variant={!effectiveMarket ? "secondary" : "ghost"}
            size="sm"
            className="h-8 shrink-0 px-3 text-xs"
            aria-current={!effectiveMarket ? "page" : undefined}
          >
            全部地区
            <span className="ml-1.5 text-[11px] text-muted-foreground">{platforms.length}</span>
          </Button>
        </Link>
        {groupedPlatforms.map((market) => (
          <Link
            key={market.value}
            href={withParams(searchParams, basePath, {
              market: market.value,
              platformId: undefined,
            })}
          >
            <Button
              variant={effectiveMarket === market.value ? "secondary" : "ghost"}
              size="sm"
              className="h-8 shrink-0 px-3 text-xs"
              aria-current={effectiveMarket === market.value ? "page" : undefined}
            >
              {market.label}
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                {market.platforms.length}
              </span>
            </Button>
          </Link>
        ))}
      </div>

      <div className="flex items-start gap-2 overflow-x-auto px-3 py-2.5">
        <span className="mt-2 shrink-0 text-xs font-medium text-muted-foreground">平台</span>
        {scopeLabel ? (
          <span className="inline-flex h-8 shrink-0 items-center rounded-md bg-muted px-2.5 text-xs font-medium text-muted-foreground">
            {scopeLabel} · {platforms.length} 个平台
          </span>
        ) : null}
        <Link
          href={withParams(searchParams, basePath, {
            market: effectiveMarket,
            platformId: undefined,
          })}
        >
          <Button
            variant={!activePlatformId ? "default" : "outline"}
            size="sm"
            className="h-8 shrink-0 px-3 text-xs"
            aria-current={!activePlatformId ? "page" : undefined}
          >
            {effectiveMarket
              ? `${MARKET_OPTIONS.find((market) => market.value === effectiveMarket)?.label ?? ""}全部`
              : "全部平台"}
          </Button>
        </Link>
        <div className="flex min-w-max items-center gap-3">
          {visiblePlatformGroups.map((market, index) => (
            <div key={market.value} className="flex items-center gap-1.5">
              {!effectiveMarket ? (
                <span
                  className={`shrink-0 text-[11px] font-medium text-muted-foreground ${
                    index > 0 ? "border-l pl-3" : ""
                  }`}
                >
                  {market.label}
                </span>
              ) : null}
              {market.platforms.map((platform) => (
                <Link
                  key={platform.id}
                  href={withParams(searchParams, basePath, {
                    market: market.value,
                    platformId: platform.id,
                  })}
                >
                  <Button
                    variant={activePlatformId === platform.id ? "default" : "outline"}
                    size="sm"
                    title={platform.name}
                    aria-label={`筛选平台：${platform.name}`}
                    aria-current={activePlatformId === platform.id ? "page" : undefined}
                    className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                  >
                    <ListingPlatformMark
                      code={platform.code}
                      name={platform.name}
                      className="h-5 w-5 rounded-md border-0 bg-transparent p-0 shadow-none"
                    />
                    <span className="max-w-28 truncate">{platform.name}</span>
                  </Button>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div
        className={`grid gap-2 border-t px-3 py-3 ${
          showStatusFilter && showRiskFilter
            ? "lg:grid-cols-[1fr_140px_140px_150px]"
            : showStatusFilter || showRiskFilter
              ? "lg:grid-cols-[1fr_140px_150px]"
              : "lg:grid-cols-[1fr_150px]"
        }`}
      >
        <form onSubmit={submitSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索商品 / SKU / Listing ID"
              className="h-9 pl-9"
            />
          </div>
          <Button type="submit" variant="outline" className="h-9 px-3">
            搜索
          </Button>
        </form>

        {showStatusFilter ? (
          <Select
            value={status ?? ""}
            className="h-9"
            aria-label="Listing 状态"
            onChange={(event) =>
              router.push(withParam(searchParams, basePath, "status", event.target.value))
            }
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">在售中</option>
            <option value="DELISTED">已下架</option>
            {showSoldOutStatus ? <option value="SOLD_OUT">已成交</option> : null}
          </Select>
        ) : null}

        {showRiskFilter ? (
          <Select
            value={risk ?? ""}
            className="h-9"
            aria-label="Listing 风险"
            onChange={(event) =>
              router.push(withParam(searchParams, basePath, "risk", event.target.value))
            }
          >
            <option value="">全部风险</option>
            <option value="lowStock">库存不足</option>
            <option value="unpriced">未定价</option>
            <option value="stale">长期未售</option>
          </Select>
        ) : null}

        <Select
          value={sort ?? (showStockSort ? "stockDesc" : "listedAt")}
          className="h-9"
          onChange={(event) =>
            router.push(withParam(searchParams, basePath, "sort", event.target.value))
          }
        >
          {showStockSort ? <option value="stockDesc">可售数优先</option> : null}
          <option value="listedAt">最近上架</option>
          <option value="updatedAt">最近更新</option>
          <option value="priceDesc">价格从高到低</option>
          <option value="priceAsc">价格从低到高</option>
        </Select>
      </div>
    </div>
  );
}
