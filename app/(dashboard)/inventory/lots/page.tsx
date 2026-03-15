import { getInventoryLots } from "@/app/actions/inventory-lots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Package, Search, TrendingUp, Warehouse } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/decimal";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

export default async function LotsPage() {
  const lots = await getInventoryLots(STORE_ID);

  // 统计数据
  const activeLots = lots.filter((l) => l.status === "ACTIVE");
  const totalValue = lots.reduce((sum, lot) => {
    return sum + parseFloat(lot.unitCost.toString());
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">库存批次</h1>
          <p className="text-muted-foreground">新品批次和数量追踪管理</p>
        </div>
        <Link href="/inventory/lots/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            添加批次
          </Button>
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总批次数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lots.length}</div>
            <p className="text-xs text-muted-foreground">所有库存批次</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活跃批次</CardTitle>
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
          <div className="flex items-center justify-between">
            <CardTitle>所有批次</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="搜索批次..." className="pl-8 w-[200px]" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {lots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无库存批次</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                创建第一个库存批次开始管理库存
              </p>
              <Link href="/inventory/lots/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  添加批次
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>位置</TableHead>
                  <TableHead>单位成本</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>入库时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium font-mono">{lot.sku.code}</p>
                        <p className="text-sm text-muted-foreground">{lot.sku.name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{lot.location.code}</p>
                        <p className="text-sm text-muted-foreground">
                          {lot.location.name}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatCurrency(lot.unitCost, lot.costCurrency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={lot.status === "ACTIVE" ? "default" : "secondary"}>
                        {lot.status === "ACTIVE" ? "活跃" : "已消耗"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(lot.receivedAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/inventory/lots/${lot.id}`}>
                        <Button variant="ghost" size="sm">
                          查看
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
