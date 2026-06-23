"use client";

import { useMemo, useState } from "react";
import { Box, Filter, Search } from "lucide-react";
import type { SkuCatalogListItem } from "@/lib/application/sku-catalog";
import {
  catalogStatusLabel,
  productKindLabel,
  type ProductKind,
} from "@/lib/application/sku-catalog";
import { SkuCatalogRowActions } from "@/components/inventory/sku-catalog-row-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/ui/product-image";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { formatCurrency, formatQuantity } from "@/lib/decimal";

interface SkuCatalogGridProps {
  items: SkuCatalogListItem[];
}

export function SkuCatalogGrid({ items }: SkuCatalogGridProps) {
  const [query, setQuery] = useState("");
  const [productKind, setProductKind] = useState<"all" | ProductKind>("all");
  const [catalogStatus, setCatalogStatusFilter] = useState<
    "all" | "active" | "disabled"
  >("all");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");

  const brands = useMemo(
    () => [...new Set(items.map((i) => i.brand).filter(Boolean))] as string[],
    [items]
  );
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))] as string[],
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (productKind !== "all" && item.productKind !== productKind) return false;
      if (catalogStatus !== "all" && item.catalogStatus !== catalogStatus) return false;
      if (brand !== "all" && item.brand !== brand) return false;
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.brand || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q)
      );
    });
  }, [items, query, productKind, catalogStatus, brand, category]);

  const columns: Column<SkuCatalogListItem>[] = [
    {
      key: "cover",
      header: "",
      className: "w-14",
      cell: (row) => (
        <ProductImage src={row.imageUrl} alt={row.name} size="sm" className="rounded-md" />
      ),
    },
    {
      key: "name",
      header: "商品",
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{row.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
        </div>
      ),
    },
    {
      key: "kind",
      header: "类型 / 层级",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{productKindLabel(row.productKind)}</Badge>
          <Badge variant={row.variantCount > 0 ? "default" : "secondary"}>
            {row.variantCount > 0 ? "父 SKU" : row.parentSkuId ? "子 SKU" : "独立 SKU"}
          </Badge>
        </div>
      ),
    },
    {
      key: "meta",
      header: "品牌 / 分类",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {[row.brand, row.category].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
    {
      key: "variants",
      header: "子款",
      cell: (row) =>
        row.variantCount > 0 ? `${row.variantCount} 个子 SKU` : row.parentSkuId ? "具体规格" : "—",
    },
    {
      key: "price",
      header: "价格参考",
      cell: (row) => (
        <div className="min-w-[132px] text-sm">
          <p>
            <span className="text-muted-foreground">参考 </span>
            {row.referencePrice
              ? formatCurrency(row.referencePrice, row.currency ?? "CNY")
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            近销{" "}
            {row.business.latestSalePrice
              ? formatCurrency(row.business.latestSalePrice, row.business.salesCurrency ?? "CNY")
              : "—"}
          </p>
        </div>
      ),
    },
    {
      key: "stock",
      header: "库存",
      cell: (row) => (
        <div className="min-w-[112px] text-sm">
          <p>
            <span className="text-muted-foreground">可售 </span>
            <span className={Number(row.business.sellableQty) > 0 ? "font-medium" : ""}>
              {formatQuantity(row.business.sellableQty)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {row.variantCount > 0 ? "子款汇总 · " : ""}
            在途 {formatQuantity(row.business.inTransitQty)}
          </p>
        </div>
      ),
    },
    {
      key: "sales",
      header: "销售",
      cell: (row) => (
        <div className="min-w-[128px] text-sm">
          <p>
            <span className="text-muted-foreground">次数 </span>
            <span className={row.business.salesCount > 0 ? "font-medium" : ""}>
              {row.business.salesCount}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            均价{" "}
            {row.business.averageSalePrice
              ? formatCurrency(row.business.averageSalePrice, row.business.salesCurrency ?? "CNY")
              : "—"}
          </p>
        </div>
      ),
    },
    {
      key: "platform",
      header: "平台",
      cell: (row) => (
        <div className="min-w-[112px] text-sm">
          <p className="truncate">
            {row.business.primaryPlatformName ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            上架中 {row.business.activeListingCount}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "状态",
      cell: (row) => (
        <Badge variant={row.catalogStatus === "active" ? "default" : "outline"}>
          {catalogStatusLabel(row.catalogStatus)}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right w-[140px]",
      cell: (row) => <SkuCatalogRowActions item={row} />,
    },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-3.5 w-3.5" />
            筛选
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索编码、名称、品牌…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border px-3 text-sm"
            value={productKind}
            onChange={(e) => setProductKind(e.target.value as typeof productKind)}
          >
            <option value="all">全部类型</option>
            <option value="NEW">全新</option>
            <option value="USED">中古</option>
          </select>
          <select
            className="h-10 rounded-md border px-3 text-sm"
            value={catalogStatus}
            onChange={(e) => setCatalogStatusFilter(e.target.value as typeof catalogStatus)}
          >
            <option value="all">全部状态</option>
            <option value="active">启用</option>
            <option value="disabled">已停用</option>
          </select>
          {brands.length > 0 ? (
            <select
              className="h-10 rounded-md border px-3 text-sm"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="all">全部品牌</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : null}
          {categories.length > 0 ? (
            <select
              className="h-10 rounded-md border px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">全部分类</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : null}
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Box}
          title="暂无商品档案"
          description={items.length === 0 ? "添加第一个 SKU 开始维护主数据。" : "没有符合筛选条件的商品。"}
          actionHref={items.length === 0 ? "/inventory/skus/new" : undefined}
          actionLabel={items.length === 0 ? "添加 SKU" : undefined}
        />
      ) : (
        <ResponsiveTable columns={columns} data={filtered} keyExtractor={(row) => row.id} />
      )}
    </div>
  );
}
