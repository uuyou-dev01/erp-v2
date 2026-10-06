export interface PresaleInput {
  isPresale?: boolean;
  expectedShipDate?: string;
  buyerNoticeConfirmed?: boolean;
}

export function validatePresale(input: PresaleInput, listingType: string, now = new Date()) {
  if (!input.isPresale) return null;
  if (listingType !== "SKU") throw new Error("中古单件不支持缺货预售");
  if (!input.buyerNoticeConfirmed) throw new Error("请确认已在销售平台告知买家预售及延迟发货时间");
  const raw = input.expectedShipDate ?? "";
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== raw
  ) {
    throw new Error("请填写有效的预计发货日期");
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (raw < today) throw new Error("预计发货日期不能早于今天，请重新确认交期");
  return date;
}

export function presaleDateExpired(date: Date | null | undefined, now = new Date()) {
  if (!date) return true;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return date.toISOString().slice(0, 10) < today;
}
