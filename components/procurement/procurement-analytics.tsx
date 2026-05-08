"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PIE_COLORS = ["#3B82F6", "#EC4899", "#60A5FA", "#F472B6", "#2563EB", "#DB2777"];

interface MonthlyProcurementPoint {
  key: string;
  period: string;
  amountCny: number;
  orderCount: number;
  receivedCount: number;
}

interface SupplierProcurementPoint {
  name: string;
  orderCount: number;
}

interface ProcurementAnalyticsProps {
  monthlyData: MonthlyProcurementPoint[];
  supplierData: SupplierProcurementPoint[];
}

type ViewMode = "month" | "quarter" | "year";

function formatCny(value: number) {
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function ProcurementAnalytics({
  monthlyData,
  supplierData,
}: ProcurementAnalyticsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  const chartData = useMemo(() => {
    if (viewMode === "month") {
      return monthlyData.map((item) => ({
        period: item.period,
        amountCny: item.amountCny,
        orderCount: item.orderCount,
        receivedCount: item.receivedCount,
      }));
    }

    const grouped = new Map<
      string,
      { period: string; amountCny: number; orderCount: number; receivedCount: number; sortKey: string }
    >();

    for (const item of monthlyData) {
      const [yearStr, monthStr] = item.key.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);

      if (!Number.isFinite(year) || !Number.isFinite(month)) continue;

      if (viewMode === "quarter") {
        const quarter = Math.floor((month - 1) / 3) + 1;
        const groupKey = `${year}-Q${quarter}`;
        const prev = grouped.get(groupKey);
        if (prev) {
          prev.amountCny += item.amountCny;
          prev.orderCount += item.orderCount;
          prev.receivedCount += item.receivedCount;
        } else {
          grouped.set(groupKey, {
            period: `${year} Q${quarter}`,
            amountCny: item.amountCny,
            orderCount: item.orderCount,
            receivedCount: item.receivedCount,
            sortKey: `${year}-${String(quarter).padStart(2, "0")}`,
          });
        }
      } else {
        const groupKey = `${year}`;
        const prev = grouped.get(groupKey);
        if (prev) {
          prev.amountCny += item.amountCny;
          prev.orderCount += item.orderCount;
          prev.receivedCount += item.receivedCount;
        } else {
          grouped.set(groupKey, {
            period: `${year}年`,
            amountCny: item.amountCny,
            orderCount: item.orderCount,
            receivedCount: item.receivedCount,
            sortKey: `${year}`,
          });
        }
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((item) => ({
        period: item.period,
        amountCny: item.amountCny,
        orderCount: item.orderCount,
        receivedCount: item.receivedCount,
      }));
  }, [monthlyData, viewMode]);

  const title =
    viewMode === "month" ? "采购趋势（月度）" : viewMode === "quarter" ? "采购趋势（季度）" : "采购趋势（年度）";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{title}</CardTitle>
            <div className="flex items-center gap-1 rounded-full bg-muted p-1">
              <button
                onClick={() => setViewMode("month")}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  viewMode === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                月
              </button>
              <button
                onClick={() => setViewMode("quarter")}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  viewMode === "quarter" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                季
              </button>
              <button
                onClick={() => setViewMode("year")}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  viewMode === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                年
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              暂无采购数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} width={80} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} width={50} />
                <Tooltip
                  formatter={((value: number, name: string) => {
                    if (name === "amountCny") return [formatCny(value), "采购金额（CNY）"];
                    if (name === "orderCount") return [`${value} 单`, "采购单数"];
                    if (name === "receivedCount") return [`${value} 单`, "已收货单数"];
                    return [value, name];
                  }) as never}
                />
                <Legend
                  formatter={((value: string) => {
                    if (value === "amountCny") return "采购金额（CNY）";
                    if (value === "orderCount") return "采购单数";
                    if (value === "receivedCount") return "已收货单数";
                    return value;
                  }) as never}
                />
                <Bar yAxisId="left" dataKey="amountCny" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orderCount"
                  stroke="#EC4899"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="receivedCount"
                  stroke="#16A34A"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>供应商采购单占比</CardTitle>
        </CardHeader>
        <CardContent>
          {supplierData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              暂无供应商数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={supplierData}
                  dataKey="orderCount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {supplierData.map((_item, index) => (
                    <Cell
                      key={`supplier-cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} 单`, "采购单数"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
