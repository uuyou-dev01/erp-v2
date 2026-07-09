"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SkuSalesLifecycleChartProps {
  data: Array<{
    date: string;
    soldQty: string;
    orderCount: number;
    salesAmount: string;
    currency: string | null;
    listedCount: number;
  }>;
}

const chartDataLimit = 90;

function formatNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("zh-CN") : "-";
}

export function SkuSalesLifecycleChart({ data }: SkuSalesLifecycleChartProps) {
  const chartData = data.slice(-chartDataLimit).map((point) => ({
    date: point.date.slice(5),
    soldQty: Number(point.soldQty),
    orderCount: point.orderCount,
    salesAmount: Number(point.salesAmount),
    currency: point.currency ?? "",
    listedCount: point.listedCount,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        暂无销售动销记录
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickMargin={8} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="qty" tick={{ fontSize: 12 }} width={42} allowDecimals={false} />
        <YAxis yAxisId="listing" orientation="right" tick={{ fontSize: 12 }} width={36} allowDecimals={false} />
        <Tooltip
          formatter={(value, name, item) => {
            if (name === "soldQty") return [`${formatNumber(value)} 件`, "销售件数"];
            if (name === "listedCount") return [`${formatNumber(value)} 条`, "新增上架"];
            if (name === "orderCount") return [`${formatNumber(value)} 笔`, "订单数"];
            const currency = item.payload.currency ? `${item.payload.currency} ` : "";
            return [`${currency}${formatNumber(value)}`, "销售额"];
          }}
        />
        <Bar
          yAxisId="qty"
          dataKey="soldQty"
          name="销售件数"
          fill="#2563eb"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Line
          yAxisId="listing"
          type="monotone"
          dataKey="listedCount"
          name="新增上架"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
