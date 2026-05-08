"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

const BRAND_COLORS = ["#3B82F6", "#EC4899", "#60A5FA", "#F472B6", "#2563EB", "#DB2777"];

interface PlatformData {
  name: string;
  totalSales: number;
  orderCount: number;
  totalPlatformFee: number;
}

interface PlatformPieChartProps {
  data: PlatformData[];
}

export function PlatformPieChart({ data }: PlatformPieChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        暂无数据
      </div>
    );
  }

  const chartData = data.map((d) => ({ name: d.name, value: d.totalSales }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) =>
            `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`
          }
          outerRadius={90}
          dataKey="value"
        >
          {chartData.map((_entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={BRAND_COLORS[index % BRAND_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip formatter={(value) => `¥${Number(value ?? 0).toFixed(2)}`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
