"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SkuPriceHistoryChartProps {
  data: Array<{
    date: string;
    salePrice: string | null;
    purchasePrice: string | null;
    currency: string | null;
  }>;
}

const chartDataLimit = 80;

function formatNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "—";
}

export function SkuPriceHistoryChart({ data }: SkuPriceHistoryChartProps) {
  const chartData = data.slice(-chartDataLimit).map((point) => ({
    date: point.date.slice(5),
    salePrice: point.salePrice ? Number(point.salePrice) : null,
    purchasePrice: point.purchasePrice ? Number(point.purchasePrice) : null,
    currency: point.currency ?? "",
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        暂无价格记录
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickMargin={8} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={56} />
        <Tooltip
          formatter={(value, name, item) => {
            const currency = item.payload.currency ? `${item.payload.currency} ` : "";
            const label = name === "salePrice" ? "成交价" : "进货价";
            return [`${currency}${formatNumber(value)}`, label];
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="salePrice"
          connectNulls
          stroke="#0ea5e9"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 5 }}
          name="成交价"
        />
        <Line
          type="monotone"
          dataKey="purchasePrice"
          connectNulls
          stroke="#f97316"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 5 }}
          name="进货价"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
