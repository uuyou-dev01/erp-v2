import { getBusinessOverview, getInventoryReport, getSalesReport } from "@/app/actions/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Package,
  ShoppingCart,
  TrendingUp,
  Warehouse,
  DollarSign,
  Globe,
  CheckCircle,
} from "lucide-react";
import { InventoryChart } from "@/components/reports/inventory-chart";
import { SalesChart } from "@/components/reports/sales-chart";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

export default async function ReportsPage() {
  const overview = await getBusinessOverview(STORE_ID);
  const inventoryReport = await getInventoryReport(STORE_ID);
  const salesReport = await getSalesReport(STORE_ID);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">报表分析</h1>
        <p className="text-muted-foreground">
          业务数据分析和可视化报表
        </p>
      </div>

      {/* 业务概览 */}
      <div>
        <h2 className="text-xl font-semibold mb-4">业务概览</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">库存总值</CardTitle>
              <Warehouse className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">¥{overview.inventory.totalValue}</div>
              <p className="text-xs text-muted-foreground">
                {overview.inventory.lotCount} 批次 + {overview.inventory.itemCount} 单品
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">采购总额</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">¥{overview.procurement.totalAmount}</div>
              <p className="text-xs text-muted-foreground">
                {overview.procurement.orderCount} 订单，{overview.procurement.receivedCount} 已收货
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">销售总额</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">¥{overview.sales.totalAmount}</div>
              <p className="text-xs text-muted-foreground">
                {overview.sales.orderCount} 订单，{overview.sales.confirmedCount} 已确认
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">上架商品</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.listing.activeCount}</div>
              <p className="text-xs text-muted-foreground">
                共 {overview.listing.totalCount} 个上架记录
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 库存分析 */}
      <div>
        <h2 className="text-xl font-semibold mb-4">库存分析</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>库存分布（按位置）</CardTitle>
            </CardHeader>
            <CardContent>
              <InventoryChart data={inventoryReport.byLocation} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>库存状态</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">活跃批次</span>
                  </div>
                  <span className="text-sm font-medium">{inventoryReport.byStatus.active}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">可用单品</span>
                  </div>
                  <span className="text-sm font-medium">{inventoryReport.byStatus.available}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">已分配</span>
                  </div>
                  <span className="text-sm font-medium">{inventoryReport.byStatus.allocated}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">已消耗</span>
                  </div>
                  <span className="text-sm font-medium">{inventoryReport.byStatus.consumed}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 销售分析 */}
      <div>
        <h2 className="text-xl font-semibold mb-4">销售分析</h2>
        <Card>
          <CardHeader>
            <CardTitle>销售趋势（按月）</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart data={salesReport.byMonth} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
