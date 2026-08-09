"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Box, Search } from "lucide-react";
import type { SkuCatalogDisplayGroup } from "@/lib/application/catalog-display-groups";
import { buildSkuCatalogDisplayGroups } from "@/lib/application/catalog-display-groups";
import type { SkuCatalogListItem } from "@/lib/application/sku-catalog";
import {
  catalogStatusLabel,
} from "@/lib/application/sku-catalog";
import type { SkuCatalogRole } from "@/lib/application/sku-identity";
import { SkuCatalogRowActions } from "@/components/inventory/sku-catalog-row-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/ui/product-image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/decimal";

interface SkuCatalogGridProps {
  items: SkuCatalogListItem[];
}

type CatalogBusiness = SkuCatalogListItem["business"];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function money(value: string | null, currency?: string | null) {
  return value ? formatCurrency(value, currency || "CNY") : "—";
}

function weightedAverage(
  items: SkuCatalogListItem[],
  valueKey: "averageSalePrice",
  weightKey: "salesCount"
) {
  let amount = 0;
  let weight = 0;
  for (const item of items) {
    const value = Number(item.business[valueKey]);
    const itemWeight = Number(item.business[weightKey]);
    if (!Number.isFinite(value) || !Number.isFinite(itemWeight) || itemWeight <= 0) {
      continue;
    }
    amount += value * itemWeight;
    weight += itemWeight;
  }
  return weight > 0 ? (amount / weight).toFixed(2) : null;
}

function summarizeGroup(group: SkuCatalogDisplayGroup): CatalogBusiness {
  if (!group.isDisplayGroup) return group.head.business;

  const items = group.variantItems.length ? group.variantItems : [group.head];
  const latestItem =
    [...items]
      .filter((item) => item.business.lastSoldAt)
      .sort(
        (a, b) =>
          new Date(b.business.lastSoldAt ?? 0).getTime() -
          new Date(a.business.lastSoldAt ?? 0).getTime()
      )[0] ?? items[0];
  const salesCount = items.reduce((sum, item) => sum + item.business.salesCount, 0);
  const salesAmount = items
    .reduce((sum, item) => sum + Number(item.business.salesAmount || 0), 0)
    .toFixed(2);
  const averageSalePrice = weightedAverage(items, "averageSalePrice", "salesCount");
  const purchaseSource =
    items.find((item) => item.business.averagePurchasePrice)?.business ?? group.head.business;
  const averagePurchasePrice = purchaseSource.averagePurchasePrice;
  const purchaseCurrency = purchaseSource.purchaseCurrency;
  const saleCurrency = latestItem.business.salesCurrency;
  const canComputeMargin =
    averageSalePrice &&
    averagePurchasePrice &&
    (!saleCurrency || !purchaseCurrency || saleCurrency === purchaseCurrency);
  const grossProfitPerUnit = canComputeMargin
    ? (Number(averageSalePrice) - Number(averagePurchasePrice)).toFixed(2)
    : null;
  const grossMarginRate =
    canComputeMargin && Number(averageSalePrice) > 0
      ? (((Number(averageSalePrice) - Number(averagePurchasePrice)) / Number(averageSalePrice)) * 100).toFixed(1)
      : null;

  return {
    sellableQty: "0",
    inTransitQty: "0",
    activeListingCount: 0,
    latestSalePrice: latestItem.business.latestSalePrice,
    averageSalePrice,
    salesCurrency: saleCurrency,
    salesCount,
    salesAmount,
    lastSoldAt: latestItem.business.lastSoldAt,
    averagePurchasePrice,
    purchaseCurrency,
    grossProfitPerUnit,
    grossMarginRate,
    primaryPlatformName:
      items.find((item) => item.business.primaryPlatformName)?.business.primaryPlatformName ??
      null,
    primaryPlatformCode:
      items.find((item) => item.business.primaryPlatformCode)?.business.primaryPlatformCode ??
      null,
  };
}

function marginTone(rate: string | null) {
  if (!rate) return "text-muted-foreground";
  const value = Number(rate);
  if (!Number.isFinite(value)) return "text-muted-foreground";
  if (value < 0) return "text-red-600";
  if (value < 15) return "text-amber-700";
  return "text-emerald-700";
}

function words(value: string) {
  return value
    .replace(/[·・|/：:()（）]/g, " ")
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function compactVariantName(group: SkuCatalogDisplayGroup, variant: SkuCatalogListItem) {
  if (variant.variantLabel) return variant.variantLabel;

  const raw = variant.name.trim();
  const directPrefixes = [group.displayName, group.head.name, group.head.series]
    .filter((item): item is string => Boolean(item?.trim()))
    .sort((a, b) => b.length - a.length);

  for (const prefix of directPrefixes) {
    if (!raw.startsWith(prefix) || raw.length <= prefix.length) continue;
    const stripped = raw
      .slice(prefix.length)
      .replace(/^[\s·・\-_:：|/]+/, "")
      .trim();
    if (stripped) return stripped;
  }

  const rawWords = words(raw);
  const groupWords = words(group.displayName);
  let commonCount = 0;
  while (
    commonCount < rawWords.length &&
    commonCount < groupWords.length &&
    rawWords[commonCount].toLowerCase() === groupWords[commonCount].toLowerCase()
  ) {
    commonCount += 1;
  }

  if (commonCount >= 2 && commonCount < rawWords.length) {
    return rawWords.slice(commonCount).join(" ");
  }

  return raw;
}

function roleLabel(group: SkuCatalogDisplayGroup) {
  if (group.head.catalogRole === "GROUP" || group.isSeries) return "商品组";
  if (group.head.catalogRole === "VARIANT") return "规格 SKU";
  return "独立 SKU";
}

function groupMatchesRole(group: SkuCatalogDisplayGroup, role: "all" | SkuCatalogRole) {
  if (role === "all") return true;
  if (role === "GROUP") return group.head.catalogRole === "GROUP" || group.isSeries;
  if (role === "VARIANT") return group.variantItems.length > 0 || group.head.catalogRole === "VARIANT";
  return !group.isSeries && group.head.catalogRole === "SIMPLE";
}

export function SkuCatalogGrid({ items }: SkuCatalogGridProps) {
  const [query, setQuery] = useState("");
  const [catalogStatus, setCatalogStatusFilter] = useState<
    "all" | "active" | "disabled"
  >("all");
  const [catalogRole, setCatalogRoleFilter] = useState<"all" | SkuCatalogRole>("all");
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

  const grouped = useMemo(() => buildSkuCatalogDisplayGroups(items), [items]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return grouped.filter((group) => {
      if (!groupMatchesRole(group, catalogRole)) return false;
      const candidates = [group.head, ...group.variantItems];
      const matchesFilters = candidates.some((item) => {
        if (catalogStatus !== "all" && item.catalogStatus !== catalogStatus) return false;
        if (brand !== "all" && item.brand !== brand) return false;
        if (category !== "all" && item.category !== category) return false;
        return true;
      });
      if (!matchesFilters) return false;
      if (!q) return true;
      return candidates.some((item) => {
        return (
          item.code.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.manufacturerCode || "").toLowerCase().includes(q) ||
          (item.variantLabel || "").toLowerCase().includes(q) ||
          (item.brand || "").toLowerCase().includes(q) ||
          (item.category || "").toLowerCase().includes(q) ||
          (item.series || "").toLowerCase().includes(q)
        );
      });
    });
  }, [grouped, query, catalogStatus, catalogRole, brand, category]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="搜索商品组、规格、SKU、货号、品牌…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={catalogRole}
              onChange={(e) => setCatalogRoleFilter(e.target.value as "all" | SkuCatalogRole)}
            >
              <option value="all">全部类型</option>
              <option value="GROUP">商品组</option>
              <option value="VARIANT">含规格 SKU</option>
              <option value="SIMPLE">独立 SKU</option>
            </select>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={catalogStatus}
              onChange={(e) =>
                setCatalogStatusFilter(e.target.value as typeof catalogStatus)
              }
            >
              <option value="all">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">已停用</option>
            </select>
            {brands.length > 0 ? (
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
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
                className="h-9 rounded-md border bg-background px-3 text-sm"
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
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          共 {filteredGroups.length} 组档案；商品组用于聚合规格，业务单据请选择规格 SKU 或独立 SKU。
        </p>
      </div>

      {filteredGroups.length === 0 ? (
        <EmptyState
          icon={Box}
          title="暂无商品档案"
          description={
            items.length === 0
              ? "添加第一个商品，系统会根据是否有多个规格引导创建。"
              : "没有符合筛选条件的商品。"
          }
          actionHref={items.length === 0 ? "/inventory/skus/new" : undefined}
          actionLabel={items.length === 0 ? "新增商品" : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[320px]">商品档案</TableHead>
                <TableHead className="min-w-[120px]">层级 / 状态</TableHead>
                <TableHead className="text-right">参考价</TableHead>
                <TableHead className="text-right">平均进货价</TableHead>
                <TableHead className="text-right">近销价</TableHead>
                <TableHead className="text-right">均售价</TableHead>
                <TableHead className="text-right">成交</TableHead>
                <TableHead className="text-right">毛利率</TableHead>
                <TableHead>主销平台</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group) => {
                const head = group.head;
                const business = summarizeGroup(group);
                const visibleVariants = group.variantItems.slice(0, 3);
                const hiddenVariantCount = Math.max(
                  group.variantItems.length - visibleVariants.length,
                  0
                );
                const salesCurrency = business.salesCurrency || head.currency || "CNY";
                const purchaseCurrency =
                  business.purchaseCurrency || head.currency || salesCurrency;
                const referenceCurrency = head.currency || salesCurrency;

                return (
                  <TableRow key={group.key}>
                    <TableCell>
                      <div className="flex min-w-0 gap-3">
                        <ProductImage
                          src={head.imageUrl}
                          alt={head.name}
                          className="h-10 w-10 shrink-0"
                        />
                        <div className="min-w-0">
                          {group.isDisplayGroup ? (
                            <span className="font-medium">{group.displayName}</span>
                          ) : (
                            <Link
                              href={`/inventory/skus/${head.id}`}
                              className="font-medium hover:text-primary hover:underline"
                            >
                              {group.displayName}
                            </Link>
                          )}
                          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            {group.displayCode}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {group.displayMeta || "未设置品牌 / 分类"}
                          </p>
                          {visibleVariants.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {visibleVariants.map((variant) => (
                                <Link
                                  key={variant.id}
                                  href={`/inventory/skus/${variant.id}`}
                                >
                                  <Badge
                                    variant="outline"
                                    className="max-w-[140px] truncate text-[10px]"
                                  >
                                    {compactVariantName(group, variant)}
                                  </Badge>
                                </Link>
                              ))}
                              {hiddenVariantCount > 0 ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  +{hiddenVariantCount}
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge
                          variant={group.isSeries ? "secondary" : "outline"}
                          className="whitespace-nowrap"
                        >
                          {roleLabel(group)}
                        </Badge>
                        {group.isSeries ? (
                          <Badge variant="outline" className="whitespace-nowrap">
                            {group.variantLabel}
                          </Badge>
                        ) : null}
                        <Badge
                          variant={head.catalogStatus === "active" ? "default" : "secondary"}
                          className="whitespace-nowrap"
                        >
                          {catalogStatusLabel(head.catalogStatus)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(head.referencePrice, referenceCurrency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(business.averagePurchasePrice, purchaseCurrency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(business.latestSalePrice, salesCurrency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(business.averageSalePrice, salesCurrency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <p className="font-medium">{business.salesCount} 次</p>
                      <p className="text-xs text-muted-foreground">
                        最近 {formatDate(business.lastSoldAt)}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <p className={`font-medium ${marginTone(business.grossMarginRate)}`}>
                        {business.grossMarginRate ? `${business.grossMarginRate}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {business.grossProfitPerUnit
                          ? money(business.grossProfitPerUnit, salesCurrency)
                          : "单件 —"}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {business.primaryPlatformName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {group.isDisplayGroup ? (
                        <span className="text-xs text-muted-foreground">
                          查看具体 SKU
                        </span>
                      ) : (
                        <SkuCatalogRowActions item={head} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
