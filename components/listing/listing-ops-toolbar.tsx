"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ListingOpsPlatform } from "@/components/listing/listing-ops-types";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import { Search } from "lucide-react";

interface ListingOpsToolbarProps {
  platforms: ListingOpsPlatform[];
  basePath?: string;
  activePlatformId?: string;
  status?: string;
  risk?: string;
  sort?: string;
  query?: string;
  showStockSort?: boolean;
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

export function ListingOpsToolbar({
  platforms,
  basePath = "/listing",
  activePlatformId,
  status,
  risk,
  sort,
  query,
  showStockSort = false,
}: ListingOpsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(query ?? "");

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
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        <Link href={withParam(searchParams, basePath, "platformId")}>
          <Button
            variant={!activePlatformId ? "default" : "outline"}
            size="sm"
            className="h-8 px-3 text-xs"
          >
            全部
          </Button>
        </Link>
        {platforms.map((platform) => (
          <Link
            key={platform.id}
            href={withParam(searchParams, basePath, "platformId", platform.id)}
          >
            <Button
              variant={activePlatformId === platform.id ? "default" : "outline"}
              size="sm"
              title={platform.name}
              aria-label={platform.name}
              className="h-8 w-8 px-0"
            >
              <ListingPlatformMark
                code={platform.code}
                name={platform.name}
                className="h-5 w-5 rounded-md border-0 bg-transparent p-0 shadow-none"
              />
            </Button>
          </Link>
        ))}
      </div>

      <div className="grid gap-2 lg:grid-cols-[1fr_140px_140px_150px]">
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

        <Select
          value={status ?? ""}
          className="h-9"
          onChange={(event) =>
            router.push(withParam(searchParams, basePath, "status", event.target.value))
          }
        >
          <option value="">全部状态</option>
          <option value="ACTIVE">在售中</option>
          <option value="DELISTED">已下架</option>
          <option value="SOLD_OUT">已售罄</option>
        </Select>

        <Select
          value={risk ?? ""}
          className="h-9"
          onChange={(event) =>
            router.push(withParam(searchParams, basePath, "risk", event.target.value))
          }
        >
          <option value="">全部风险</option>
          <option value="lowStock">库存不足</option>
          <option value="unpriced">未定价</option>
          <option value="stale">长期未售</option>
        </Select>

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
