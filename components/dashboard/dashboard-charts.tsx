"use client";

import { ChartCard } from "@/components/shared/chart-card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface MonthlyData {
  month: string;
  revenue: number;
  profit: number;
}

interface PlatformData {
  name: string;
  totalSales: number;
}

const PIE_COLORS = ["#3B82F6", "#EC4899", "#60A5FA", "#F472B6", "#93C5FD"];

function formatMonth(month: string) {
  const parts = month.split("-");
  return `${parseInt(parts[1])}月`;
}

function formatCurrency(value: number) {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function SalesTrendChart({ data }: { data: MonthlyData[] }) {
  return (
    <ChartCard title="销售趋势（近 6 个月）" timeRanges={[]}>
      <div className="h-[300px] min-w-0">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            暂无销售数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EC4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tickFormatter={formatMonth} fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => `¥${v}`} width={70} />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  name === "revenue" ? "收入" : "利润",
                ]}
                labelFormatter={(label) => formatMonth(String(label))}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#gradRevenue)"
                name="revenue"
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="#EC4899"
                strokeWidth={2}
                fill="url(#gradProfit)"
                name="profit"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

export function PlatformPieChart({ data }: { data: PlatformData[] }) {
  return (
    <ChartCard title="平台销售分布" timeRanges={[]}>
      <div className="h-[300px] min-w-0">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            暂无平台数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={100}
                dataKey="totalSales"
                nameKey="name"
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [formatCurrency(Number(value)), "销售额"]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}
