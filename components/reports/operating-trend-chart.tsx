"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OperatingReport } from "@/lib/application/operating-report";
import { reportMoney, sumReportMoney } from "@/lib/application/operating-report-math";

export function OperatingTrendChart({
  rows,
  dailyRows,
}: {
  rows: OperatingReport["monthly"];
  dailyRows: OperatingReport["daily"];
}) {
  const [granularity, setGranularity] = useState<"day" | "month">("day");
  const selectedRows =
    granularity === "day"
      ? dailyRows.map((row) => ({ ...row, period: row.date }))
      : rows.map((row) => ({ ...row, period: row.month }));
  if (!rows.some((row) => row.orderCount > 0))
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <p>所选期间暂无已成交订单</p>
        <p className="text-xs">调整日期范围后可查看收入与利润趋势。</p>
      </div>
    );
  const data = selectedRows
    .map((row) => ({
      ...row,
      revenue: row.revenue === null ? null : Number(row.revenue),
      profit: row.profit === null ? null : Number(row.profit),
      expenses: sumReportMoney([row.cost, row.platformFee, row.shippingFee]),
    }))
    .map((row) => ({ ...row, expenses: row.expenses === null ? null : Number(row.expenses) }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {granularity === "day" ? "按日统计 · 北京时间" : "按月汇总 · 北京时间"}
        </p>
        <div className="flex gap-1" role="group" aria-label="趋势统计粒度">
          <Button
            type="button"
            size="sm"
            variant={granularity === "day" ? "default" : "outline"}
            aria-pressed={granularity === "day"}
            onClick={() => setGranularity("day")}
          >
            按日
          </Button>
          <Button
            type="button"
            size="sm"
            variant={granularity === "month" ? "default" : "outline"}
            aria-pressed={granularity === "month"}
            onClick={() => setGranularity("month")}
          >
            按月
          </Button>
        </div>
      </div>
      <div
        className="h-72 w-full min-w-0"
        role="img"
        aria-label={`${granularity === "day" ? "按日" : "按月"}对比销售收入、订单成本及费用、订单贡献利润`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 0 }} barGap={5}>
            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="period"
              minTickGap={24}
              tickFormatter={(value: string) =>
                granularity === "day" ? value.slice(5).replace("-", "/") : value
              }
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
              dy={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
              width={64}
              tickFormatter={(value: number) =>
                Math.abs(value) >= 10000
                  ? `${(value / 10000).toFixed(1)}万`
                  : value.toLocaleString()
              }
            />
            <Tooltip
              formatter={(value) => reportMoney(Number(value))}
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ paddingTop: 18, fontSize: 12 }} />
            <Bar
              dataKey="revenue"
              name="销售收入"
              fill="#2563eb"
              maxBarSize={36}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="expenses"
              name="订单成本及费用"
              fill="#94a3b8"
              maxBarSize={36}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              dataKey="profit"
              name="订单贡献利润"
              stroke="#0f766e"
              strokeWidth={2}
              dot={data.length <= 31 ? { r: 3 } : false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
