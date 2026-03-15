import { getCustomerOrders } from "@/app/actions/customer-orders";
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
import { Plus, Package, ShoppingBag, CheckCircle, Truck, Search } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/decimal";
import Decimal from "decimal.js";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

const statusColors = {
  DRAFT: "secondary",
  PLACED: "default",
  PAID: "default",
  CONFIRMED: "outline",
  SHIPPED: "outline",
  DELIVERED: "outline",
  RETURNED: "destructive",
  CANCELLED: "destructive",
} as const;

const statusLabels = {
  DRAFT: "草稿",
  PLACED: "已下单",
  PAID: "已付款",
  CONFIRMED: "已确认",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  RETURNED: "已退货",
  CANCELLED: "已取消",
} as const;

export default async function SalesPage() {
  const orders = await getCustomerOrders(STORE_ID);

  // 统计数据
  const stats = {
    total: orders.length,
    draft: orders.filter((o) => o.orderStatus === "DRAFT").length,
    confirmed: orders.filter((o) => o.orderStatus === "CONFIRMED").length,
    shipped: orders.filter((o) => o.orderStatus === "SHIPPED").length,
    totalRevenue: orders
      .filter((o) => o.orderStatus !== "CANCELLED" && o.orderStatus !== "RETURNED")
      .reduce((sum, o) => sum.plus(new Decimal(o.totalPaid)), new Decimal(0)),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">销售管理</h1>
          <p className="text-muted-foreground">管理客户订单和发货</p>
        </div>
        <Link href="/sales/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新建订单
          </Button>
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总订单数</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">所有客户订单</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待处理</CardTitle>
            <Package className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
            <p className="text-xs text-muted-foreground">草稿订单</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已确认</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.confirmed}</div>
            <p className="text-xs text-muted-foreground">等待发货</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已发货</CardTitle>
            <Truck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.shipped}</div>
            <p className="text-xs text-muted-foreground">运输中</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>客户订单</CardTitle>
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
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无订单</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                创建第一个客户订单
              </p>
              <Link href="/sales/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  新建订单
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单ID</TableHead>
                  <TableHead>外部订单号</TableHead>
                  <TableHead>商品数</TableHead>
                  <TableHead>总金额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium font-mono text-xs">
                      {order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      {order.externalOrderNo || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{order.lines.length} 项</TableCell>
                    <TableCell>
                      {formatCurrency(order.totalPaid, order.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          statusColors[order.orderStatus as keyof typeof statusColors]
                        }
                      >
                        {statusLabels[order.orderStatus as keyof typeof statusLabels] || order.orderStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(order.createdAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/sales/${order.id}`}>
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
