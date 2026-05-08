import { getInventoryLots } from "@/app/actions/inventory-lots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, TrendingUp, Warehouse } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/decimal";
import { ResponsiveTable, Column } from "@/components/shared/responsive-table";
import { LotImportButton } from "@/components/inventory/lot-import-button";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

type LotRow = Awaited<ReturnType<typeof getInventoryLots>>[number];

export default async function LotsPage() {
  const lots = await getInventoryLots(STORE_ID);

  const activeLots = lots.filter((l) => l.status === "ACTIVE");
  const totalValue = lots.reduce((sum, lot) => {
    return sum + parseFloat(lot.unitCost.toString());
  }, 0);

  const columns: Column<LotRow>[] = [
    {
      key: "sku",
      header: "SKU",
      cell: (row) => (
        <div>
          <p className="font-medium font-mono">{row.sku.code}</p>
          <p className="text-sm text-muted-foreground">{row.sku.name}</p>
        </div>
      ),
    },
    {
      key: "location",
      header: "位置",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.location.code}</p>
          <p className="text-sm text-muted-foreground">{row.location.name}</p>
        </div>
      ),
    },
    {
      key: "unitCost",
      header: "单位成本",
      cell: (row) => (
        <span className="font-mono">{formatCurrency(row.unitCost, row.costCurrency)}</span>
      ),
    },
    {
      key: "status",
      header: "状态",
      cell: (row) => (
        <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>
          {row.status === "ACTIVE" ? "活跃" : "已消耗"}
        </Badge>
      ),
    },
    {
      key: "receivedAt",
      header: "入库时间",
      hideOnMobile: true,
      cell: (row) => new Date(row.receivedAt).toLocaleDateString("zh-CN"),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      cell: (row) => (
        <Link href={`/inventory/lots/${row.id}`}>
          <Button variant="ghost" size="sm">
            查看
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">入库库存</h1>
          <p className="text-muted-foreground">按来源、位置和成本追踪可用库存</p>
        </div>
        <div className="flex items-center gap-2">
          <LotImportButton />
          <Link href="/inventory/lots/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新增入库库存
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
            <p className="text-xs text-muted-foreground">所有入库库存</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可用来源</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLots.length}</div>
            <p className="text-xs text-muted-foreground">状态为活跃</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总成本</CardTitle>
            <Warehouse className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">库存总成本</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SKU种类</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {[...new Set(lots.map((l) => l.skuId))].length}
            </div>
            <p className="text-xs text-muted-foreground">不同SKU数量</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>所有入库库存</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={columns}
            data={lots}
            keyExtractor={(row) => row.id}
            emptyState={
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
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
