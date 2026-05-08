import Link from "next/link";
import { getItemUnits } from "@/app/actions/item-units";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/decimal";
import { Plus, Package, CheckCircle, Clock, XCircle } from "lucide-react";
import { ResponsiveTable, Column } from "@/components/shared/responsive-table";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

const statusColors = {
  AVAILABLE: "default",
  ALLOCATED: "secondary",
  CONSUMED: "outline",
  RETURN_CHECK: "secondary",
} as const;

const statusLabels = {
  AVAILABLE: "可用",
  ALLOCATED: "已分配",
  CONSUMED: "已消耗",
  RETURN_CHECK: "退货检查",
} as const;

const conditionLabels = {
  NEW: "全新",
  LIKE_NEW: "准新",
  EXCELLENT: "优秀",
  GOOD: "良好",
  FAIR: "一般",
  POOR: "较差",
  DEFECTIVE: "有缺陷",
} as const;

type ItemRow = Awaited<ReturnType<typeof getItemUnits>>[number];

export default async function ItemUnitsPage() {
  const items = await getItemUnits(STORE_ID);

  const stats = {
    total: items.length,
    available: items.filter((i) => i.status === "AVAILABLE").length,
    allocated: items.filter((i) => i.status === "ALLOCATED").length,
    consumed: items.filter((i) => i.status === "CONSUMED").length,
  };

  const columns: Column<ItemRow>[] = [
    {
      key: "id",
      header: "ID",
      hideOnMobile: true,
      cell: (row) => <span className="font-mono text-xs">{row.id.slice(0, 8)}</span>,
    },
    {
      key: "sku",
      header: "SKU",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.sku.code}</p>
          <p className="text-xs text-muted-foreground">{row.sku.name}</p>
        </div>
      ),
    },
    {
      key: "location",
      header: "位置",
      cell: (row) => row.location.code,
    },
    {
      key: "condition",
      header: "成色",
      cell: (row) =>
        row.conditionGrade ? (
          <Badge variant="outline">
            {conditionLabels[row.conditionGrade as keyof typeof conditionLabels] || row.conditionGrade}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "cost",
      header: "成本",
      cell: (row) => formatCurrency(row.unitCost.toString(), row.costCurrency),
    },
    {
      key: "status",
      header: "状态",
      cell: (row) => (
        <Badge variant={statusColors[row.status as keyof typeof statusColors]}>
          {statusLabels[row.status as keyof typeof statusLabels] || row.status}
        </Badge>
      ),
    },
    {
      key: "owner",
      header: "所有者",
      hideOnMobile: true,
      cell: (row) => row.ownerId || <span className="text-muted-foreground">-</span>,
    },
    {
      key: "actions",
      header: "操作",
      cell: (row) => (
        <Link href={`/inventory/items/${row.id}`}>
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
          <h1 className="text-3xl font-bold">单品管理</h1>
          <p className="text-muted-foreground">
            管理二手、有缺陷或独特的单个商品
          </p>
        </div>
        <Link href="/inventory/items/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            添加单品
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总单品数</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">所有单品</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可用</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.available}</div>
            <p className="text-xs text-muted-foreground">可售单品</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已分配</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.allocated}</div>
            <p className="text-xs text-muted-foreground">已分配订单</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已消耗</CardTitle>
            <XCircle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.consumed}</div>
            <p className="text-xs text-muted-foreground">已售出</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>所有单品</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={columns}
            data={items}
            keyExtractor={(row) => row.id}
            emptyState={
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">暂无单品</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  创建第一个单品开始追踪独立商品
                </p>
                <Link href="/inventory/items/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    添加单品
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
