"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface StocktakeToolbarProps {
  locations: Array<{ id: string; code: string; name: string }>;
  activeLocationId?: string;
  query?: string;
  onlyDiff?: boolean;
}

export function StocktakeToolbar({
  locations,
  activeLocationId,
  query,
  onlyDiff,
}: StocktakeToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [keyword, setKeyword] = useState(query ?? "");

  const pushWith = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value.trim()) params.set(key, value);
      else params.delete(key);
    }
    const search = params.toString();
    router.push(search ? `/inventory/stocktake?${search}` : "/inventory/stocktake");
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            pushWith({ q: keyword, page: undefined });
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索 SKU 编码/名称"
            />
          </div>
          <Button type="submit" variant="outline">
            搜索
          </Button>
        </form>

        <Select
          value={activeLocationId ?? ""}
          onChange={(event) => pushWith({ locationId: event.target.value })}
        >
          <option value="">全部仓位</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} · {location.name}
            </option>
          ))}
        </Select>

        <Button
          type="button"
          variant={onlyDiff ? "default" : "outline"}
          onClick={() => pushWith({ onlyDiff: onlyDiff ? undefined : "1" })}
        >
          {onlyDiff ? "只看已修改：开" : "只看已修改：关"}
        </Button>
      </div>
    </div>
  );
}
