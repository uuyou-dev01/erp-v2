import { requireUserContext } from "@/lib/auth/user-context";
import { getInventoryLots } from "@/app/actions/inventory-lots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, TrendingUp, Warehouse } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { LotImportButton } from "@/components/inventory/lot-import-button";
import { buildInventoryLotDisplayGroups } from "@/lib/application/catalog-display-groups";

export const dynamic = "force-dynamic";


type LotRow = Awaited<ReturnType<typeof getInventoryLots>>[number];

export default async function LotsPage() {
  const { activeStoreId: storeId } = await requireUserContext();
  const lots = await getInventoryLots(storeId);
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
            <p className="text-xs text-muted-foreground">所有批次记录</p>
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
          <CardTitle>按商品组汇总</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lotGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无入库库存</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                创建第一条入库库存开始管理来源和成本
              </p>
              <Link href="/inventory/lots/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  新增入库库存
                </Button>
              </Link>
            </div>
          ) : (
            lotGroups.map((group) => (
              <section key={group.key} className="overflow-hidden rounded-lg border">
                <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-lg font-semibold">{group.title}</p>
                    <p className="font-mono text-sm text-muted-foreground">{group.code}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm lg:min-w-[420px]">
                    <div className="rounded-md border bg-background px-3 py-2">
                      <p className="text-xs text-muted-foreground">账面数量</p>
                      <p className="font-semibold">{formatQuantity(group.totalOnHand)}</p>
                    </div>
                    <div className="rounded-md border bg-background px-3 py-2">
                      <p className="text-xs text-muted-foreground">批次数</p>
                      <p className="font-semibold">{group.lots.length}</p>
                    </div>
                    <div className="rounded-md border bg-background px-3 py-2">
                      <p className="text-xs text-muted-foreground">库存成本</p>
                      <p className="font-semibold">¥{group.totalValue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 p-4 xl:grid-cols-[minmax(260px,360px)_1fr]">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">规格 SKU / 变体</p>
                    {group.variants.map((variant) => (
                      <div key={variant.skuId} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{variant.skuName}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {variant.skuCode}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {formatQuantity(variant.totalOnHand)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {variant.lots.length} 个批次来源
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-md border">
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
                        className="grid grid-cols-1 gap-2 border-b px-3 py-3 text-sm last:border-b-0 md:grid-cols-[1.3fr_0.7fr_1fr_0.8fr_0.8fr_0.6fr] md:gap-3 md:items-center"
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
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
