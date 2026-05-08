"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SalesChartProps {
  data: Array<{ month: string; amount: number }>;
}

export function SalesChart({ data }: SalesChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        暂无数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip formatter={(value) => `¥${Number(value).toFixed(2)}`} />
        <Legend />
        <Line
          type="monotone"
          dataKey="amount"
          stroke="#3B82F6"
          strokeWidth={2}
          activeDot={{ r: 6, fill: "#EC4899" }}
          name="销售额"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
