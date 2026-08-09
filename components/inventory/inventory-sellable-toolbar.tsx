"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FilterX, Layers3, Search } from "lucide-react";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface InventorySellableToolbarProps {
  platforms: Array<{ id: string; name: string; code: string }>;
  locations: Array<{ id: string; label: string; qty: number }>;
  categories: Array<{ value: string; label: string; count: number }>;
  activePlatformId?: string;
  locationId?: string;
  category?: string;
  productKind?: string;
  stockType?: string;
  status?: string;
  risk?: string;
  sort?: string;
  query?: string;
  scopeLabel: string;
  view?: "pools";
  resultCount: number;
  totalCount: number;
}

function withParam(searchParams: { toString(): string }, key: string, value?: string) {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("page");
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
  const search = params.toString();
  return search ? `/inventory/sellable?${search}` : "/inventory/sellable";
}

function clearFilterHref(searchParams: { toString(): string }) {
  const params = new URLSearchParams(searchParams.toString());
  [
    "page",
    "q",
    "platformId",
    "locationId",
    "category",
    "kind",
    "stockType",
    "status",
    "risk",
    "sort",
  ].forEach((key) => params.delete(key));
  const search = params.toString();
  return search ? `/inventory/sellable?${search}` : "/inventory/sellable";
}

export function InventorySellableToolbar({
  platforms,
  locations,
  categories,
  activePlatformId,
  locationId,
  category,
  productKind,
  stockType,
  status,
  risk,
  sort = "stockDesc",
  query,
  scopeLabel,
  view,
  resultCount,
  totalCount,
}: InventorySellableToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(query ?? "");
  const hasFilters = Boolean(
    query ||
    activePlatformId ||
    locationId ||
    category ||
    productKind ||
    stockType ||
    status ||
    risk ||
    (sort && sort !== "stockDesc")
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (search.trim()) {
      params.set("q", search.trim());
    } else {
      params.delete("q");
    }
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Link href={withParam(searchParams, "view")}>
            <Button variant={!view ? "default" : "ghost"} size="sm" className="h-8 px-3 text-xs">
              库存列表
            </Button>
          </Link>
          <Link href={withParam(searchParams, "view", "pools")}>
            <Button
              variant={view === "pools" ? "default" : "ghost"}
              size="sm"
              className="h-8 px-3 text-xs"
            >
              经营池
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Layers3 className="h-3.5 w-3.5" />
          <span>{scopeLabel}</span>
          <span className="text-border">/</span>
          <span className="tabular-nums">
            {hasFilters ? `${resultCount} / ${totalCount}` : resultCount} 个商品
          </span>
          {hasFilters ? (
            <Link
              href={clearFilterHref(searchParams)}
              className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
            >
              <FilterX className="h-3.5 w-3.5" />
              清除筛选
            </Link>
          ) : null}
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-[minmax(260px,1fr)_138px_128px_138px_138px_138px_minmax(160px,190px)_148px]">
          <form
            onSubmit={submitSearch}
            className="flex min-w-0 gap-1.5 md:col-span-2 2xl:col-span-1"
          >
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索商品、SKU、品牌或类目"
                className="h-9 pl-9"
              />
            </div>
            <Button type="submit" variant="outline" className="h-9 shrink-0 px-3 text-xs">
              搜索
            </Button>
          </form>

          <Select
            value={category ?? ""}
            className="h-9 text-xs"
            aria-label="商品品类"
            onChange={(event) =>
              router.push(withParam(searchParams, "category", event.target.value))
            }
          >
            <option value="">全部商品品类</option>
            {categories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label} · {item.count}
              </option>
            ))}
          </Select>

          <Select
            value={productKind ?? ""}
            className="h-9 text-xs"
            aria-label="新旧类型"
            onChange={(event) => router.push(withParam(searchParams, "kind", event.target.value))}
          >
            <option value="">全部新旧类型</option>
            <option value="NEW">全新商品</option>
            <option value="USED">中古商品</option>
          </Select>

          <Select
            value={stockType ?? ""}
            className="h-9 text-xs"
            aria-label="库存形态"
            onChange={(event) =>
              router.push(withParam(searchParams, "stockType", event.target.value))
            }
          >
            <option value="">全部库存形态</option>
            <option value="LOT">批量库存</option>
            <option value="ITEM_UNIT">单件库存</option>
            <option value="MIXED">混合库存</option>
          </Select>

          <Select
            value={status ?? ""}
            className="h-9 text-xs"
            aria-label="上架状态"
            onChange={(event) => router.push(withParam(searchParams, "status", event.target.value))}
          >
            <option value="">全部上架状态</option>
            <option value="ACTIVE">在售中</option>
            <option value="DELISTED">已下架</option>
            <option value="SOLD_OUT">已售罄</option>
          </Select>

          <Select
            value={risk ?? ""}
            className="h-9 text-xs"
            aria-label="库存风险"
            onChange={(event) => router.push(withParam(searchParams, "risk", event.target.value))}
          >
            <option value="">全部库存风险</option>
            <option value="lowStock">库存不足</option>
            <option value="unpriced">未定价</option>
            <option value="stale">长期未售</option>
          </Select>

          <Select
            value={locationId ?? ""}
            className="h-9 text-xs"
            aria-label="仓位"
            onChange={(event) =>
              router.push(withParam(searchParams, "locationId", event.target.value))
            }
          >
            <option value="">全部仓位</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label} · {location.qty}
              </option>
            ))}
          </Select>

          <Select
            value={sort}
            className="h-9 text-xs"
            aria-label="排序"
            onChange={(event) => router.push(withParam(searchParams, "sort", event.target.value))}
          >
            <option value="stockDesc">现货从多到少</option>
            <option value="updatedAt">最近更新</option>
            <option value="listedAt">最近上架</option>
            <option value="priceDesc">价格从高到低</option>
            <option value="priceAsc">价格从低到高</option>
          </Select>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">销售平台</span>
          <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5">
            <Link href={withParam(searchParams, "platformId")}>
              <Button
                variant={!activePlatformId ? "secondary" : "outline"}
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs"
              >
                全部平台
              </Button>
            </Link>
            {platforms.map((platform) => (
              <Link
                key={platform.id}
                href={withParam(searchParams, "platformId", platform.id)}
                title={platform.name}
              >
                <Button
                  variant={activePlatformId === platform.id ? "default" : "outline"}
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                >
                  <ListingPlatformMark
                    code={platform.code}
                    name={platform.name}
                    className="h-4 w-4 rounded border-0 bg-transparent p-0 shadow-none"
                  />
                  <span className="max-w-24 truncate">{platform.name}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
