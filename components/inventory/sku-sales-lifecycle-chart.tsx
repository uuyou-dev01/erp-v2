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
type TimelinePoint = {
  date: string;
  soldQty: number;
  orderCount: number;
  salesAmount: number;
  currency: string;
  listedCount: number;
};

function formatNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("zh-CN") : "-";
}

export function SkuSalesLifecycleChart({ data }: SkuSalesLifecycleChartProps) {
  const chartData: TimelinePoint[] = data.slice(-chartDataLimit).map((point) => ({
    date: point.date.slice(5),
    soldQty: Number(point.soldQty),
    orderCount: point.orderCount,
    salesAmount: Number(point.salesAmount),
    currency: point.currency ?? "",
    listedCount: point.listedCount,
  }));
  const salesData = chartData.filter(
    (point) => point.soldQty > 0 || point.orderCount > 0 || point.salesAmount > 0
  );
  const listingData = chartData.filter((point) => point.listedCount > 0);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        暂无销售或上架记录
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-md border border-slate-200 p-3">
        <div className="mb-2">
          <h4 className="text-sm font-medium text-slate-900">销售动销</h4>
          <p className="text-xs text-muted-foreground">仅统计已确认、已发货或已送达的真实订单。</p>
        </div>
        {salesData.length === 0 ? (
          <div className="flex h-[190px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            暂无销售记录
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={salesData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickMargin={8} tick={{ fontSize: 12 }} />
              <YAxis yAxisId="qty" tick={{ fontSize: 12 }} width={42} allowDecimals={false} />
              <Tooltip
                formatter={(value, name, item) => {
                  const dataKey = String(item.dataKey ?? "");
                  if (dataKey === "soldQty" || name === "销售件数") {
                    return [`${formatNumber(value)} 件`, "销售件数"];
                  }
                  if (dataKey === "orderCount" || name === "订单数") {
                    return [`${formatNumber(value)} 笔`, "订单数"];
                  }
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
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="rounded-md border border-slate-200 p-3">
        <div className="mb-2">
          <h4 className="text-sm font-medium text-slate-900">上架活动</h4>
          <p className="text-xs text-muted-foreground">按日期统计新增 Listing，不代表商品售出。</p>
        </div>
        {listingData.length === 0 ? (
          <div className="flex h-[190px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            暂无上架记录
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={listingData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickMargin={8} tick={{ fontSize: 12 }} />
              <YAxis yAxisId="listing" tick={{ fontSize: 12 }} width={42} allowDecimals={false} />
              <Tooltip
                formatter={(value, name, item) => {
                  const dataKey = String(item.dataKey ?? "");
                  if (dataKey === "listedCount" || name === "新增上架") {
                    return [`${formatNumber(value)} 条`, "新增上架"];
                  }
                  return [formatNumber(value), String(name)];
                }}
              />
              <Line
                yAxisId="listing"
                type="monotone"
                dataKey="listedCount"
                name="新增上架"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
