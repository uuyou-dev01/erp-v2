import Decimal from "decimal.js";

// Reporting dates have one explicit timezone, independent of the server host.
export const REPORT_TIME_ZONE = "Asia/Shanghai";
export const REPORT_BASE_CURRENCY = "CNY";
export function reportDay(date: Date) {
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function resolveReportRange(
  params: { range?: string; from?: string; to?: string },
  now = new Date()
) {
  const today = reportDay(now);
  const [year, month] = today.split("-").map(Number);
  let from = `${today.slice(0, 7)}-01`;
  let to = today;
  let error: string | null = null;
  if (params.range === "lastMonth") {
    from = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
    to = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  } else if (params.range === "thisQuarter") {
    from = `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  } else if (params.range === "custom") {
    const validDay = (value?: string): value is string => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if (!validDay(params.from) || !validDay(params.to) || params.from > params.to) {
      error = "日期范围无效，已显示本月。请选择有效的起止日期。";
    } else if (new Date(params.to).getTime() - new Date(params.from).getTime() > 366 * 86_400_000) {
      error = "单次最多查询 366 天，已显示本月。";
    } else {
      from = params.from;
      to = params.to;
    }
  }
  return {
    from,
    to,
    error,
    dateFrom: new Date(`${from}T00:00:00+08:00`),
    dateTo: new Date(`${to}T23:59:59.999+08:00`),
  };
}

/** Missing valuation is never silently represented by zero or a partial total. */
export function sumReportMoney(values: Array<string | null>): string | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<Decimal>((sum, value) => sum.plus(value!), new Decimal(0)).toFixed(2);
}

export function reportProfit(revenue: string | null, costs: Array<string | null>): string | null {
  const cost = sumReportMoney(costs);
  return revenue === null || cost === null ? null : new Decimal(revenue).minus(cost).toFixed(2);
}

export function reportMoney(value: string | number | null, currency = REPORT_BASE_CURRENCY) {
  if (value === null) return "待核算";
  return `${currency} ${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}

export function reportCsv(rows: Array<Array<string | number | null>>) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = value === null ? "待核算" : String(value);
            const trimmed = text.trimStart();
            const formula =
              /^[=+@\t\r]/.test(trimmed) ||
              (trimmed.startsWith("-") && !/^-\d+(\.\d+)?$/.test(trimmed));
            const safe = formula ? `'${text}` : text;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(",")
      )
      .join("\r\n")
  );
}
