"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  Filter,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { getSKUs } from "@/app/actions/skus";
import { deleteSKU } from "@/app/actions/skus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/ui/product-image";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { formatQuantity } from "@/lib/decimal";

type SKURow = Awaited<ReturnType<typeof getSKUs>>[number];
type DisplaySKURow = SKURow & {
  groupDepth: number;
  visibleChildCount: number;
};

interface SKUManagementTableProps {
  skus: SKURow[];
  categories: string[];
  brands: string[];
}

type AttributeFilter = "all" | "with" | "without";
type SortKey = "newest" | "oldest" | "code" | "name";

function formatAttributeValue(value: unknown) {
  if (value == null || value === "") return "未填写";
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ") || "未填写";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function SKUManagementTable({ skus, categories, brands }: SKUManagementTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [attributeFilter, setAttributeFilter] = useState<AttributeFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [deletingSku, setDeletingSku] = useState<SKURow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filteredSkus = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return skus
      .filter((sku) => {
        const attributes = (sku.attributes || {}) as Record<string, unknown>;
        const attributeCount = Object.keys(attributes).length;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          sku.code.toLowerCase().includes(normalizedQuery) ||
          sku.name.toLowerCase().includes(normalizedQuery) ||
          (sku.category || "").toLowerCase().includes(normalizedQuery) ||
          (sku.brand || "").toLowerCase().includes(normalizedQuery);
        const matchesCategory = category === "all" || sku.category === category;
        const matchesBrand = brand === "all" || sku.brand === brand;
        const matchesAttributes =
          attributeFilter === "all" ||
          (attributeFilter === "with" && attributeCount > 0) ||
          (attributeFilter === "without" && attributeCount === 0);

        return matchesQuery && matchesCategory && matchesBrand && matchesAttributes;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }

        if (sortBy === "code") {
          return a.code.localeCompare(b.code, "zh-CN");
        }

        if (sortBy === "name") {
          return a.name.localeCompare(b.name, "zh-CN");
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [attributeFilter, brand, category, query, skus, sortBy]);

  const displaySkus = useMemo<DisplaySKURow[]>(() => {
    const filteredIdSet = new Set(filteredSkus.map((sku) => sku.id));
    const childrenByParentId = filteredSkus.reduce<Record<string, SKURow[]>>((acc, sku) => {
      if (!sku.parentSkuId || !filteredIdSet.has(sku.parentSkuId)) return acc;
      acc[sku.parentSkuId] = [...(acc[sku.parentSkuId] || []), sku];
      return acc;
    }, {});

    return filteredSkus.flatMap((sku) => {
      if (sku.parentSkuId && filteredIdSet.has(sku.parentSkuId)) return [];

      const children = childrenByParentId[sku.id] || [];
      const parentRow: DisplaySKURow = {
        ...sku,
        groupDepth: 0,
        visibleChildCount: children.length,
      };

      if (children.length === 0 || !expandedGroups.has(sku.id)) {
        return [parentRow];
      }

      return [
        parentRow,
        ...children.map((child) => ({
          ...child,
          groupDepth: 1,
          visibleChildCount: 0,
        })),
      ];
    });
  }, [expandedGroups, filteredSkus]);

  const hasFilters =
    query.trim().length > 0 ||
    category !== "all" ||
    brand !== "all" ||
    attributeFilter !== "all" ||
    sortBy !== "newest";

  const resetFilters = () => {
    setQuery("");
    setCategory("all");
    setBrand("all");
    setAttributeFilter("all");
    setSortBy("newest");
  };

  const handleDelete = async () => {
    if (!deletingSku) return;

    setDeleteLoading(true);
    try {
      await deleteSKU(deletingSku.id);
      setDeletingSku(null);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete SKU:", error);
      alert(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: Column<DisplaySKURow>[] = [
    {
      key: "image",
      header: "图片",
      hideOnMobile: true,
      className: "w-[76px]",
      cell: (row) => <ProductImage src={row.imageUrl} alt={row.name} size="md" />,
    },
    {
      key: "identity",
      header: "SKU信息",
      cell: (row) => (
        <div className="flex min-w-0 items-start gap-2">
          <div className={row.groupDepth > 0 ? "w-6 shrink-0 border-t border-dashed border-muted-foreground/40" : "w-0"} />
          {row.visibleChildCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 h-7 w-7 shrink-0"
              onClick={() =>
                setExpandedGroups((current) => {
                  const next = new Set(current);
                  if (next.has(row.id)) {
                    next.delete(row.id);
                  } else {
                    next.add(row.id);
                  }
                  return next;
                })
              }
            >
              {expandedGroups.has(row.id) ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <div className="h-7 w-7 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{row.name}</span>
              {row.visibleChildCount > 0 && (
                <Badge variant="outline" className="shrink-0">
                  {row.visibleChildCount} 个子款
                </Badge>
              )}
              {row.groupDepth > 0 && (
                <Badge variant="secondary" className="shrink-0">
                  子 SKU
                </Badge>
              )}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{row.code}</div>
            {row.parentSku && (
              <div className="mt-1 text-xs text-muted-foreground">
                父 SKU：{row.parentSku.code}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "分类",
      cell: (row) =>
        row.category ? (
          <Badge variant="secondary">{row.category}</Badge>
        ) : (
          <span className="text-muted-foreground">未分类</span>
        ),
    },
    {
      key: "brand",
      header: "品牌",
      hideOnMobile: true,
      cell: (row) => row.brand || <span className="text-muted-foreground">未设置</span>,
    },
    {
      key: "attributes",
      header: "属性",
      hideOnMobile: true,
      cell: (row) => {
        const attributes = (row.attributes || {}) as Record<string, unknown>;
        const attributeNames = Object.keys(attributes);

        if (attributeNames.length === 0) {
          return <span className="text-muted-foreground">无属性</span>;
        }

        return (
          <div className="flex max-w-[240px] flex-wrap gap-1.5">
            {attributeNames.slice(0, 2).map((name) => {
              const value = formatAttributeValue(attributes[name]);

              return (
                <Badge key={name} variant="outline" className="max-w-full">
                  <span className="truncate">
                    {name}: {value}
                  </span>
                </Badge>
              );
            })}
            {attributeNames.length > 2 && (
              <Badge variant="outline">+{attributeNames.length - 2}</Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "usage",
      header: "业务状态",
      hideOnMobile: true,
      cell: (row) => {
        const summary = row.businessSummary;

        return (
          <div className="grid min-w-[220px] grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div>
              <span className="text-muted-foreground">入库库存</span>{" "}
              <span className={summary.hasAvailableStock ? "font-medium text-gray-900" : "text-muted-foreground"}>
                {formatQuantity(summary.availableLotQuantity)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">单件</span>{" "}
              <span className={summary.availableItemUnits > 0 ? "font-medium text-gray-900" : "text-muted-foreground"}>
                {summary.availableItemUnits}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">上架中</span>{" "}
              <span className={summary.activeListings > 0 ? "font-medium text-blue-700" : "text-muted-foreground"}>
                {summary.activeListings}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">采购/销售</span>{" "}
              <span className="text-gray-900">
                {summary.purchaseLineCount}/{summary.salesLineCount}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: "createdAt",
      header: "创建时间",
      hideOnMobile: true,
      cell: (row) => new Date(row.createdAt).toLocaleDateString("zh-CN"),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Link href={`/inventory/skus/${row.id}`}>
            <Button variant="outline" size="sm">
              <Eye className="mr-1.5 h-4 w-4" />
              详情
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={() => setDeletingSku(row)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-white/40 bg-white/45">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>SKU资料库</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                按库存、上架、采购和销售状态查看商品主数据。
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-sm text-blue-700">
              <Filter className="h-4 w-4" />
              当前显示 {filteredSkus.length} / {skus.length}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px_160px_150px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="搜索代码、名称、分类或品牌"
              />
            </div>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 rounded-lg glass-input px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              <option value="all">全部分类</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              className="h-10 rounded-lg glass-input px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              <option value="all">全部品牌</option>
              {brands.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={attributeFilter}
              onChange={(event) => setAttributeFilter(event.target.value as AttributeFilter)}
              className="h-10 rounded-lg glass-input px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              <option value="all">全部属性</option>
              <option value="with">有属性</option>
              <option value="without">无属性</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
              className="h-10 rounded-lg glass-input px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              <option value="newest">最新创建</option>
              <option value="oldest">最早创建</option>
              <option value="code">按代码</option>
              <option value="name">按名称</option>
            </select>
            <Button variant="outline" onClick={resetFilters} disabled={!hasFilters}>
              <X className="mr-2 h-4 w-4" />
              清除
            </Button>
          </div>

          <ResponsiveTable
            columns={columns}
            data={displaySkus}
            keyExtractor={(row) => row.id}
            emptyState={
              <EmptyState
                icon={Box}
                title={skus.length === 0 ? "暂无SKU" : "没有匹配的SKU"}
                description={
                  skus.length === 0
                    ? "创建第一个商品SKU开始管理产品目录"
                    : "调整关键词或筛选条件后再试"
                }
                actionLabel={skus.length === 0 ? "添加SKU" : undefined}
                actionHref={skus.length === 0 ? "/inventory/skus/new" : undefined}
              />
            }
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(deletingSku)}
        title="确认删除SKU"
        description={
          deletingSku
            ? `确认要删除「${deletingSku.name}（${deletingSku.code}）」吗？若该SKU已有库存、采购、销售或刊登记录，系统会阻止删除。`
            : ""
        }
        confirmText="确认删除"
        cancelText="取消"
        loading={deleteLoading}
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingSku(null)}
      />
    </>
  );
}
