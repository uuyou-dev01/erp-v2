"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, PackageSearch, ShoppingCart, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export interface IntelligenceBusinessSku {
  id: string;
  code: string;
  name: string;
  label: string;
}

function withQuery(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `${path}?${query.toString()}`;
}

export function IntelligenceBusinessActions({
  itemId,
  linkedSkus,
  catalogSkuId,
}: {
  itemId: string;
  linkedSkus: IntelligenceBusinessSku[];
  catalogSkuId?: string | null;
}) {
  const [selectedSkuId, setSelectedSkuId] = useState(linkedSkus[0]?.id ?? "");
  const selectedSku = useMemo(
    () => linkedSkus.find((sku) => sku.id === selectedSkuId) ?? linkedSkus[0] ?? null,
    [linkedSkus, selectedSkuId]
  );
  const returnTo = `/product-intelligence/${itemId}`;

  if (!selectedSku) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">
          还没有可执行采购、库存和上架动作的正式 SKU。商品组本身不承载库存，请先补充具体规格。
        </p>
        <Button variant="outline" className="w-full" asChild>
          <Link href={catalogSkuId ? `/inventory/skus/${catalogSkuId}` : `${returnTo}/edit`}>
            <PackageSearch className="mr-2 h-4 w-4" />
            {catalogSkuId ? "前往商品主档补充规格" : "编辑并关联商品主档"}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {linkedSkus.length > 1 ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">操作规格</span>
          <Select
            value={selectedSku.id}
            onChange={(event) => setSelectedSkuId(event.target.value)}
            aria-label="选择业务操作 SKU"
          >
            {linkedSkus.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.label} · {sku.code}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <div className="rounded-md bg-muted/45 px-3 py-2">
          <p className="text-xs text-muted-foreground">当前操作 SKU</p>
          <p className="mt-0.5 truncate text-sm font-medium">{selectedSku.label}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{selectedSku.code}</p>
        </div>
      )}

      <Button className="h-10 w-full" asChild>
        <Link
          href={withQuery("/procurement/new", {
            skuId: selectedSku.id,
            returnTo,
            source: "product-intelligence",
          })}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          登记采购
        </Link>
      </Button>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="justify-start" asChild>
          <Link href={withQuery(`/inventory/skus/${selectedSku.id}`, { returnTo })}>
            <PackageSearch className="mr-1.5 h-3.5 w-3.5" />
            商品主档
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="justify-start" asChild>
          <Link href={`/inventory/sellable?q=${encodeURIComponent(selectedSku.code)}`}>
            <Boxes className="mr-1.5 h-3.5 w-3.5" />
            查看库存
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="col-span-2 justify-start" asChild>
          <Link
            href={withQuery("/listing/new", {
              skuId: selectedSku.id,
              listingType: "SKU",
              returnTo,
            })}
          >
            <Tags className="mr-1.5 h-3.5 w-3.5" />
            创建上架记录
          </Link>
        </Button>
      </div>

      <p className="text-[10px] leading-4 text-muted-foreground">
        采购会生成采购单并进入物流、到货和入库流程；不会从商品情报直接增加库存。
      </p>
    </div>
  );
}
