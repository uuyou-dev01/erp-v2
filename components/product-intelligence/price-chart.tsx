"use client";

import { useMemo } from "react";
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
import { formatCurrency } from "@/lib/decimal";

export interface ProductIntelligencePricePoint {
  date: string;
  variant: string;
  currency: string;
  condition: string;
  price: number | null;
}

const SERIES_COLORS = [
  "#2563eb",
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#64748b",
];

function colorForSeries(seriesKey: string, seriesKeys: string[]) {
  const index = Math.max(0, seriesKeys.indexOf(seriesKey));
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function dateDistanceInDays(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00`).getTime();
  const endTime = new Date(`${end}T00:00:00`).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
}

function compactDateRange(start: string, end: string) {
  return start === end ? start : `${start} - ${end}`;
}

function signedCurrency(value: number, currency: string) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCurrency(value, currency)}`;
}

function percentageChange(current: number, base: number) {
  if (base === 0) return null;
  return ((current - base) / base) * 100;
}

function formatPercentage(value: number | null) {
  if (value === null) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

type NumericPricePoint = ProductIntelligencePricePoint & {
  condition: string;
  price: number;
};

function toNumericPoint(point: ProductIntelligencePricePoint): NumericPricePoint | null {
  if (point.price === null || !Number.isFinite(point.price)) return null;
  return {
    ...point,
    condition: point.condition || "未标注",
    price: point.price,
  };
}

function buildDailyAverages(points: NumericPricePoint[]) {
  const byDate = new Map<string, number[]>();
  for (const point of points) {
    const values = byDate.get(point.date) ?? [];
    values.push(point.price);
    byDate.set(point.date, values);
  }
  return Array.from(byDate.entries())
    .map(([date, values]) => ({ date, average: average(values), count: values.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function seriesKey(point: Pick<NumericPricePoint, "variant" | "condition">) {
  return `${point.variant} · ${point.condition}`;
}

function buildSeriesRows(points: NumericPricePoint[]) {
  const dateRows = new Map<string, Record<string, number | string>>();
  const groupedValues = new Map<string, number[]>();

  for (const point of points) {
    const key = seriesKey(point);
    const groupKey = `${point.date}::${key}`;
    const values = groupedValues.get(groupKey) ?? [];
    values.push(point.price);
    groupedValues.set(groupKey, values);
    if (!dateRows.has(point.date)) {
      dateRows.set(point.date, { date: point.date });
    }
  }

  for (const [groupKey, values] of groupedValues.entries()) {
    const [date, key] = groupKey.split("::");
    const row = dateRows.get(date);
    if (row) row[key] = average(values);
  }

  return Array.from(dateRows.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function buildSeriesSummaries(points: NumericPricePoint[], seriesKeys: string[]) {
  return seriesKeys
    .map((key) => {
      const seriesPoints = points.filter((point) => seriesKey(point) === key);
      if (seriesPoints.length === 0) return null;
      const values = seriesPoints.map((point) => point.price);
      return {
        key,
        count: seriesPoints.length,
        min: Math.min(...values),
        average: average(values),
        max: Math.max(...values),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function ProductIntelligencePriceChart({
  data,
  activeVariants,
  activeConditions,
}: {
  data: ProductIntelligencePricePoint[];
  activeVariants?: string[];
  activeConditions?: string[];
}) {
  const variants = useMemo(
    () => Array.from(new Set(data.map((point) => point.variant || "未命名 SKU"))).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [data],
  );
  const conditions = useMemo(
    () => Array.from(new Set(data.map((point) => point.condition || "未标注"))).sort(),
    [data],
  );
  const activeVariantList = activeVariants && activeVariants.length > 0 ? activeVariants : variants;
  const activeConditionList = activeConditions && activeConditions.length > 0 ? activeConditions : conditions;
  const currencies = Array.from(new Set(data.map((point) => point.currency))).sort();

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        暂无可绘制的价格数据。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {currencies.map((currency) => {
        const currencyPoints = data
          .filter(
            (point) =>
              point.currency === currency &&
              activeVariantList.includes(point.variant || "未命名 SKU") &&
              activeConditionList.includes(point.condition || "未标注"),
          )
          .map(toNumericPoint)
          .filter((point): point is NumericPricePoint => Boolean(point))
          .sort((a, b) => a.date.localeCompare(b.date));
        const rows = buildSeriesRows(currencyPoints);
        const chartSeriesKeys = Array.from(new Set(currencyPoints.map(seriesKey))).sort((a, b) => a.localeCompare(b, "zh-CN"));
        const prices = currencyPoints.map((point) => point.price);
        const minPoint = currencyPoints.reduce<NumericPricePoint | null>(
          (min, point) => (!min || point.price < min.price ? point : min),
          null,
        );
        const maxPoint = currencyPoints.reduce<NumericPricePoint | null>(
          (max, point) => (!max || point.price > max.price ? point : max),
          null,
        );
        const dailyAverages = buildDailyAverages(currencyPoints);
        const firstDay = dailyAverages[0];
        const latestDay = dailyAverages[dailyAverages.length - 1];
        const trendDelta = firstDay && latestDay ? latestDay.average - firstDay.average : 0;
        const trendPercent = firstDay && latestDay ? percentageChange(latestDay.average, firstDay.average) : null;
        const startDate = firstDay?.date ?? "";
        const endDate = latestDay?.date ?? "";
        const spanDays = startDate && endDate ? dateDistanceInDays(startDate, endDate) : 0;
        const seriesSummaries = buildSeriesSummaries(currencyPoints, chartSeriesKeys);

        return (
          <div key={currency} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{currency} 价格走势</p>
                <p className="text-xs text-slate-500">多条统计用不同颜色表示，横轴为看到价格的日期。</p>
              </div>
              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                {currencyPoints.length} 条
              </span>
            </div>
            {rows.length === 0 ? (
              <div className="rounded-md border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                当前筛选下暂无数据。
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-md bg-white px-2.5 py-1.5">
                      <p className="text-[11px] text-slate-500">当前均价</p>
                      <p className="text-sm font-semibold text-slate-950">
                        {formatCurrency(average(prices), currency)}
                      </p>
                    </div>
                    <div className="rounded-md bg-white px-2.5 py-1.5">
                      <p className="text-[11px] text-emerald-700">最低价</p>
                      <p className="text-sm font-semibold text-emerald-900">
                        {minPoint ? formatCurrency(minPoint.price, currency) : "-"}
                        <span className="ml-1 text-[11px] font-normal text-emerald-700">
                          {minPoint ? `${minPoint.variant} · ${minPoint.condition}` : ""}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-md bg-white px-2.5 py-1.5">
                      <p className="text-[11px] text-amber-700">最高价</p>
                      <p className="text-sm font-semibold text-amber-900">
                        {maxPoint ? formatCurrency(maxPoint.price, currency) : "-"}
                        <span className="ml-1 text-[11px] font-normal text-amber-700">
                          {maxPoint ? `${maxPoint.variant} · ${maxPoint.condition}` : ""}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-md bg-white px-2.5 py-1.5">
                      <p className="text-[11px] text-indigo-700">最近日均价</p>
                      <p className="text-sm font-semibold text-indigo-900">
                        {latestDay ? formatCurrency(latestDay.average, currency) : "-"}
                        <span className="ml-1 text-[11px] font-normal text-indigo-700">
                          {latestDay ? `${latestDay.count} 条` : ""}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-md bg-white px-2.5 py-1.5">
                      <p
                        className={`text-[11px] ${
                          trendDelta > 0 ? "text-rose-700" : trendDelta < 0 ? "text-cyan-700" : "text-slate-500"
                        }`}
                      >
                        首末日均价变化
                      </p>
                      <p
                        className={`text-sm font-semibold ${
                          trendDelta > 0 ? "text-rose-900" : trendDelta < 0 ? "text-cyan-900" : "text-slate-950"
                        }`}
                      >
                        {dailyAverages.length > 1 ? signedCurrency(trendDelta, currency) : "样本不足"}
                        <span className="ml-1 text-[11px] font-normal text-slate-500">
                          {dailyAverages.length > 1 ? formatPercentage(trendPercent) : "跨日期"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">
                      样本 {prices.length} 条
                    </span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">
                      区间 {compactDateRange(startDate, endDate)}
                    </span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">
                      {spanDays === 0 ? "同日样本" : `${spanDays + 1} 天`}
                    </span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">
                      价差 {minPoint && maxPoint ? formatCurrency(maxPoint.price - minPoint.price, currency) : "-"}
                    </span>
                        {seriesSummaries.map((summary) => (
                          <span
                            key={summary.key}
                            className="rounded-md border border-slate-200 bg-white px-2 py-0.5"
                          >
                            <span
                              className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                              style={{ backgroundColor: colorForSeries(summary.key, chartSeriesKeys) }}
                            />
                            {summary.key} {summary.count} 条 · 低 {formatCurrency(summary.min, currency)} · 均{" "}
                            {formatCurrency(summary.average, currency)} · 高 {formatCurrency(summary.max, currency)}
                          </span>
                        ))}
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={rows} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} width={72} />
                    <Tooltip
                      formatter={(value, name) => [
                        value === null ? "-" : `${currency} ${Number(value).toFixed(2)}`,
                        name,
                      ]}
                      labelFormatter={(_, payload) => {
                        const point = payload?.[0]?.payload as { date?: string; variant?: string } | undefined;
                        return point ? `${point.date ?? ""} · ${point.variant ?? ""}` : "";
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {chartSeriesKeys
                      .map((key) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={key}
                          stroke={colorForSeries(key, chartSeriesKeys)}
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 2 }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                      ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
