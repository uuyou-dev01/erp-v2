import { reportDay } from "./operating-report-math";

type Params = { period?: string; from?: string; to?: string; month?: string; weekday?: string };
export function salesDateFilter(params: Params, now = new Date()) {
  const today = reportDay(now);
  const date = new Date(`${today}T00:00:00Z`);
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000)
    .toISOString()
    .slice(0, 10);
  const validDay = (v?: string) =>
    !!v &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  let from = "",
    to = "",
    error = "";
  if (params.period === "today") from = to = today;
  if (params.period === "week") {
    from = monday;
    to = today;
  }
  if (params.period === "month") {
    from = `${today.slice(0, 7)}-01`;
    to = today;
  }
  if (params.period === "custom") {
    if (validDay(params.from) && validDay(params.to) && params.from! <= params.to!) {
      from = params.from!;
      to = params.to!;
    } else error = "请选择有效的起止日期，开始日期不能晚于结束日期。";
  }
  if (params.period === "selectedMonth") {
    if (params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)) {
      from = `${params.month}-01`;
      const [y, m] = params.month.split("-").map(Number);
      to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    } else error = "请选择有效月份。";
  }
  const matches = (value: Date) => {
    if (error) return false;
    const day = reportDay(value);
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!/^[0-6]$/.test(params.weekday ?? "") ||
        new Date(`${day}T00:00:00Z`).getUTCDay() === Number(params.weekday))
    );
  };
  return { matches, error, from, to, today, monday };
}
