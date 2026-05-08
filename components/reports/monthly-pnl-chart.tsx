"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

interface MonthlyPnLData {
  month: string;
  revenue: number;
  platformFee: number;
  shippingFee: number;
  purchaseCost: number;
  profit: number;
}

interface MonthlyPnLChartProps {
  data: MonthlyPnLData[];
}

export function MonthlyPnLChart({ data }: MonthlyPnLChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[350px] items-center justify-center text-muted-foreground">
        暂无数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={((value: unknown, name: unknown) => [
            `¥${Number(value ?? 0).toFixed(2)}`,
            name ?? "",
          ]) as never}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
          }}
        />
        <Legend />
        <Bar dataKey="revenue" name="收入" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="platformFee" name="平台费" fill="#EC4899" radius={[4, 4, 0, 0]} />
        <Bar dataKey="shippingFee" name="运费" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
        <Bar dataKey="profit" name="利润" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`profit-${index}`}
              fill={entry.profit >= 0 ? "#22C55E" : "#EF4444"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
