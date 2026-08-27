import { requireUserContext } from "@/lib/auth/user-context";
import { getInventoryLots } from "@/app/actions/inventory-lots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Package, Plus, Search, TrendingUp, Warehouse, X } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { LotImportButton } from "@/components/inventory/lot-import-button";
import { buildInventoryLotDisplayGroups } from "@/lib/application/catalog-display-groups";
import { InventoryLotDeleteButton } from "@/components/inventory/inventory-lot-delete-button";

export const dynamic = "force-dynamic";

type LotRow = Awaited<ReturnType<typeof getInventoryLots>>[number];

function compactVariantName(groupTitle: string, variantName: string) {
  const compact = variantName
    .replace(groupTitle, "")
    .replace(/^[\s·・—-]+/, "")
    .trim();
  return compact || variantName;
}

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { query: rawQuery } = await searchParams;
  const query = rawQuery?.trim() ?? "";
  const allLots = await getInventoryLots(storeId);
  const normalizedQuery = query.toLocaleLowerCase();
  const lots = normalizedQuery
    ? allLots.filter((lot) =>
        [lot.sku.code, lot.sku.name, lot.batchLabel, lot.location.code, lot.location.name].some(
          (value) => value?.toLocaleLowerCase().includes(normalizedQuery)
        )
      )
    : allLots;
  const lotGroups = buildInventoryLotDisplayGroups(lots);

  const activeLots = lots.filter((l) => Number(l.onHandQuantity) > 0);
  const totalValue = lots.reduce((sum, lot) => {
    return sum + parseFloat(lot.inventoryValue);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">库存批次</h1>
          <p className="text-muted-foreground">
            新品数量型库存；数量和价值按 StockLedger 流水汇总。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LotImportButton storeId={storeId} />
          <Link href="/inventory/lots/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新增库存批次
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">入库库存数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lots.length}</div>
            <p className="text-xs text-muted-foreground">
              {query ? "当前筛选范围" : "所有批次记录"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可用来源</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLots.length}</div>
            <p className="text-xs text-muted-foreground">账面数量大于 0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总成本</CardTitle>
            <Warehouse className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">按流水数量计算</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">商品组数</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lotGroups.length}</div>
            <p className="text-xs text-muted-foreground">商品组 / 独立 SKU 汇总</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>按商品组汇总</CardTitle>
              {query ? (
                <p className="mt-1 text-sm font-normal text-muted-foreground">
                  正在筛选“{query}”，找到 {lots.length} 个批次
                </p>
              ) : null}
            </div>
            <form className="flex w-full min-w-0 gap-2 lg:w-auto" action="/inventory/lots">
              <label className="relative min-w-0 flex-1 lg:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="query"
                  defaultValue={query}
                  placeholder="搜索 SKU、商品或仓库"
                  className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
              <Button type="submit" variant="outline" size="sm">
                搜索
              </Button>
              {query ? (
                <Link href="/inventory/lots" aria-label="清除筛选">
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
                    <X className="h-4 w-4" />
                  </Button>
                </Link>
              ) : null}
            </form>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {lotGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">
                {query ? "没有匹配的库存批次" : "暂无入库库存"}
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {query
                  ? "请更换关键词，或清除筛选查看全部批次"
                  : "创建第一条入库库存开始管理来源和成本"}
              </p>
              <Link href={query ? "/inventory/lots" : "/inventory/lots/new"}>
                <Button>
                  {query ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {query ? "清除筛选" : "新增入库库存"}
                </Button>
              </Link>
            </div>
          ) : (
            lotGroups.map((group) => (
              <details
                key={group.key}
                className="group overflow-hidden rounded-lg border bg-background open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none flex-col gap-3 bg-muted/15 px-4 py-3.5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                      <p className="truncate text-base font-semibold">{group.title}</p>
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted-foreground">
                      <span className="font-mono">{group.code}</span>
                      <span>{group.variants.length} 个规格</span>
                      <span>
                        {new Set(group.lots.map((lot) => lot.locationId)).size} 个库存位置
                      </span>
                      <span className="hidden max-w-[520px] truncate xl:inline">
                        {group.variants
                          .slice(0, 3)
                          .map((variant) => compactVariantName(group.title, variant.skuName))
                          .join("、")}
                        {group.variants.length > 3 ? ` 等 ${group.variants.length} 个规格` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-[repeat(3,minmax(72px,1fr))_auto] items-center gap-x-5 pl-6 text-sm lg:min-w-[500px] lg:pl-0">
                    <div>
                      <p className="text-[11px] text-muted-foreground">账面数量</p>
                      <p className="font-semibold tabular-nums">
                        {formatQuantity(group.totalOnHand)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">批次</p>
                      <p className="font-semibold tabular-nums">{group.lots.length}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">库存成本</p>
                      <p className="font-semibold tabular-nums">¥{group.totalValue.toFixed(2)}</p>
                    </div>
                    <div className="flex min-w-16 justify-end text-xs font-medium text-primary">
                      <span className="group-open:hidden">展开详情</span>
                      <span className="hidden group-open:inline">收起详情</span>
                    </div>
                  </div>
                </summary>

                <div className="border-t">
                  <div className="flex flex-wrap items-center gap-1.5 bg-muted/10 px-3 py-2.5">
                    <span className="mr-1 text-xs font-medium text-muted-foreground">规格概览</span>
                    {group.variants.map((variant) => (
                      <span
                        key={variant.skuId}
                        title={`${variant.skuName} · ${variant.skuCode}`}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs"
                      >
                        <span className="max-w-32 truncate font-medium">
                          {compactVariantName(group.title, variant.skuName)}
                        </span>
                        <span className="text-muted-foreground">
                          {formatQuantity(variant.totalOnHand)} 件 · {variant.lots.length} 批
                        </span>
                      </span>
                    ))}
                  </div>

                  <div className="overflow-hidden border-t">
                    <div className="grid grid-cols-[1.3fr_0.7fr_1fr_0.8fr_0.8fr_0.6fr] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>批次</span>
                      <span>数量</span>
                      <span>位置</span>
                      <span>单位成本</span>
                      <span>入库时间</span>
                      <span className="text-right">操作</span>
                    </div>
                    {group.lots.map((lot: LotRow) => (
                      <div
                        key={lot.id}
                        className="grid grid-cols-1 gap-2 border-b px-3 py-2.5 text-sm last:border-b-0 md:grid-cols-[1.3fr_0.7fr_1fr_0.8fr_0.8fr_0.6fr] md:items-center md:gap-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{lot.sku.name}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {lot.sku.code}
                          </p>
                        </div>
                        <div className="font-mono">{formatQuantity(lot.onHandQuantity)}</div>
                        <div>
                          <p className="font-medium">{lot.location.code}</p>
                          <p className="text-xs text-muted-foreground">{lot.location.name}</p>
                        </div>
                        <div className="font-mono">
                          {formatCurrency(lot.unitCost, lot.costCurrency)}
                        </div>
                        <div className="text-muted-foreground">
                          {new Date(lot.receivedAt).toLocaleDateString("zh-CN")}
                        </div>
                        <div className="flex items-center justify-between gap-2 md:justify-end">
                          <Badge variant={lot.status === "ACTIVE" ? "default" : "secondary"}>
                            {lot.status === "ACTIVE"
                              ? "活跃"
                              : lot.status === "CONSOLIDATING"
                                ? "转运锁定"
                                : "已消耗"}
                          </Badge>
                          <Link href={`/inventory/lots/${lot.id}`}>
                            <Button variant="ghost" size="sm">
                              查看
                            </Button>
                          </Link>
                          <InventoryLotDeleteButton
                            id={lot.id}
                            skuCode={lot.sku.code}
                            storeId={storeId}
                            compact
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
