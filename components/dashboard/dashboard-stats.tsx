"use client";

import { StatCard } from "@/components/shared/stat-card";
import { DollarSign, Percent, ShoppingCart, TrendingUp } from "lucide-react";

interface DashboardStatsProps {
  salesAmount: string;
  salesOrderCount: number;
  purchaseAmount: string;
  purchaseOrderCount: number;
  grossProfit: string;
  profitRate: string;
  movingSkuRatio: string;
  soldSkuCount: number;
  stockedSkuCount: number;
}

export function DashboardStats({
  salesAmount,
  salesOrderCount,
  purchaseAmount,
  purchaseOrderCount,
  grossProfit,
  profitRate,
  movingSkuRatio,
  soldSkuCount,
  stockedSkuCount,
}: DashboardStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="销售额"
        value={salesAmount}
        subtitle={`${salesOrderCount} 笔已确认订单`}
        icon={DollarSign}
        iconColor="text-green-500"
        href="/sales"
      />
      <StatCard
        title="采购额"
        value={purchaseAmount}
        subtitle={`${purchaseOrderCount} 笔采购单`}
        icon={ShoppingCart}
        iconColor="text-orange-500"
        href="/procurement"
      />
      <StatCard
        title="毛利 / 利润率"
        value={grossProfit}
        subtitle={`利润率 ${profitRate}`}
        icon={TrendingUp}
        iconColor="text-blue-500"
        href="/reports"
      />
      <StatCard
        title="动销比例"
        value={movingSkuRatio}
        subtitle={`${soldSkuCount} 个动销 / ${stockedSkuCount} 个有库存 SKU`}
        icon={Percent}
        iconColor="text-purple-500"
        href="/inventory/skus"
      />
    </div>
  );
}
