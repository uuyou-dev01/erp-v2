export type ProcurementPeriodKey = "all" | "thisMonth" | "last3Months" | "thisYear" | "custom";

export const PROCUREMENT_PERIOD_OPTIONS: Array<{
  value: ProcurementPeriodKey;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "thisMonth", label: "本月" },
  { value: "last3Months", label: "近 3 个月" },
  { value: "thisYear", label: "今年" },
  { value: "custom", label: "自定义" },
];

export function normalizeProcurementPeriod(value?: string): ProcurementPeriodKey {
  return PROCUREMENT_PERIOD_OPTIONS.some((option) => option.value === value)
    ? (value as ProcurementPeriodKey)
    : "all";
}

function parseDateInput(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function resolveProcurementDateRange(
  period: ProcurementPeriodKey,
  fromValue: string | undefined,
  toValue: string | undefined,
  now: Date
) {
  if (period === "all") {
    return { start: null, end: null, label: "全部时间" };
  }

  if (period === "custom") {
    const start = parseDateInput(fromValue);
    const to = parseDateInput(toValue);
    const label =
      start && to
        ? `${fromValue} 至 ${toValue}`
        : start
          ? `${fromValue} 起`
          : to
            ? `截至 ${toValue}`
            : "自定义时间";
    return {
      start,
      end: to ? addDays(to, 1) : null,
      label,
    };
  }

  const endOfToday = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  if (period === "last3Months") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      end: endOfToday,
      label: "近 3 个月",
    };
  }
  if (period === "thisYear") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: endOfToday,
      label: "今年",
    };
  }

  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: endOfToday,
    label: "本月",
  };
}
