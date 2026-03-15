import { getPurchaseOrders } from "@/app/actions/purchase-orders";
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
import { Plus, ShoppingCart, FileText, Package, CheckCircle, Search } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/decimal";
import Decimal from "decimal.js";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

const statusColors = {
  DRAFT: "secondary",
  ORDERED: "default",
  RECEIVED: "outline",
  CANCELLED: "destructive",
} as const;

const statusLabels = {
  DRAFT: "草稿",
  ORDERED: "已下单",
  RECEIVED: "已收货",
  CANCELLED: "已取消",
} as const;

export default async function ProcurementPage() {
  const orders = await getPurchaseOrders(STORE_ID);

  // 统计数据
  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.status === "DRAFT").length,
    ordered: orders.filter((o) => o.status === "ORDERED").length,
    received: orders.filter((o) => o.status === "RECEIVED").length,
    totalValue: orders.reduce((sum, o) => sum.plus(new Decimal(o.totalAmount)), new Decimal(0)),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">采购管理</h1>
          <p className="text-muted-foreground">管理采购订单和供应商</p>
        </div>
        <Link href="/procurement/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新建采购单
          </Button>
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总订单数</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">所有采购订单</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">草稿</CardTitle>
            <FileText className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
            <p className="text-xs text-muted-foreground">待提交订单</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已下单</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ordered}</div>
            <p className="text-xs text-muted-foreground">等待收货</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已收货</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.received}</div>
            <p className="text-xs text-muted-foreground">已完成订单</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>采购订单</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="搜索订单..." className="pl-8 w-[200px]" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无采购订单</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                创建第一个采购订单开始管理库存
              </p>
              <Link href="/procurement/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  新建采购单
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>商品数</TableHead>
                  <TableHead>总金额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>下单时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.orderNo}</TableCell>
                    <TableCell>
                      {order.supplierName || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{order.lines.length} 项</TableCell>
                    <TableCell>
                      {formatCurrency(order.totalAmount, order.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          statusColors[order.status as keyof typeof statusColors]
                        }
                      >
                        {statusLabels[order.status as keyof typeof statusLabels] || order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.orderedAt
                        ? new Date(order.orderedAt).toLocaleDateString("zh-CN")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/procurement/${order.id}`}>
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
