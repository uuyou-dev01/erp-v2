/** All dates and demand forecasts in this module are estimates, at SKU level. */
export interface ReplenishmentPolicy {
  leadTimeDays: number;
  safetyDays: number;
  targetCoverDays: number;
}

/** Initial planning assumptions; these are not a supplier's promised lead time. */
export const DEFAULT_REPLENISHMENT_POLICY: ReplenishmentPolicy = {
  leadTimeDays: 14,
  safetyDays: 7,
  targetCoverDays: 30,
};

export interface ReplenishmentSales {
  sales7Qty: number;
  sales30Qty: number;
  sales90Qty: number;
  orderCount30: number;
}

export interface ReplenishmentInput extends ReplenishmentSales {
  sellableQty: number;
  inTransitQty?: number;
  onOrderQty?: number;
  /**
   * Confirmed receipts in the replenishment window: from now through the later of
   * the current stock coverage and procurement lead time. This offsets planned
   * purchases, not the current stockout risk; unknown or overdue ETAs do not count.
   */
  timelyIncomingQty?: number;
  productKind?: "NEW" | "USED";
  catalogStatus?: "active" | "disabled";
  policy?: ReplenishmentPolicy;
  now?: Date;
}

export interface ReplenishmentDecision extends ReplenishmentSales {
  status:
    | "out_of_stock"
    | "reorder_now"
    | "reorder_soon"
    | "covered"
    | "insufficient_data"
    | "paused"
    | "non_replenishable";
  label: string;
  /** Larger values are more urgent. */
  priority: number;
  dailySales: number;
  coverageDays: number | null;
  daysUntilReorder: number | null;
  suggestedQty: number | null;
  /** ISO calendar dates (YYYY-MM-DD), estimated in UTC. */
  projectedStockoutDate: string | null;
  reorderByDate: string | null;
  inTransitQty: number;
  onOrderQty: number;
  timelyIncomingQty: number;
  confidence: "low" | "normal";
  reason: string;
  action: string;
}

function boundedDays(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return fallback;
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function resolveReplenishmentPolicy(params: {
  leadDays?: string;
  bufferDays?: string;
  coverDays?: string;
}): ReplenishmentPolicy {
  return {
    leadTimeDays: boundedDays(params.leadDays, 1, 180, DEFAULT_REPLENISHMENT_POLICY.leadTimeDays),
    safetyDays: boundedDays(params.bufferDays, 0, 60, DEFAULT_REPLENISHMENT_POLICY.safetyDays),
    targetCoverDays: boundedDays(
      params.coverDays,
      1,
      180,
      DEFAULT_REPLENISHMENT_POLICY.targetCoverDays
    ),
  };
}

function quantity(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, value))
    : 0;
}

function utcDateAfter(now: Date, days: number) {
  // A date more than ten years away is not a useful demand forecast.
  if (!Number.isFinite(days) || Math.abs(days) > 3650) return null;
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function isReplenishmentAlert(decision?: ReplenishmentDecision): boolean {
  return (
    decision?.status === "out_of_stock" ||
    decision?.status === "reorder_now" ||
    decision?.status === "reorder_soon"
  );
}

export function buildReplenishmentDecision(input: ReplenishmentInput): ReplenishmentDecision {
  const sellableQty = quantity(input.sellableQty);
  const sales7Qty = quantity(input.sales7Qty);
  const sales30Qty = quantity(input.sales30Qty);
  const sales90Qty = quantity(input.sales90Qty);
  const orderCount30 = Math.floor(quantity(input.orderCount30));
  const inTransitQty = quantity(input.inTransitQty);
  const onOrderQty = quantity(input.onOrderQty);
  const timelyIncomingQty = quantity(input.timelyIncomingQty);
  const policy = {
    leadTimeDays: boundedDays(
      input.policy?.leadTimeDays,
      1,
      180,
      DEFAULT_REPLENISHMENT_POLICY.leadTimeDays
    ),
    safetyDays: boundedDays(
      input.policy?.safetyDays,
      0,
      60,
      DEFAULT_REPLENISHMENT_POLICY.safetyDays
    ),
    targetCoverDays: boundedDays(
      input.policy?.targetCoverDays,
      1,
      180,
      DEFAULT_REPLENISHMENT_POLICY.targetCoverDays
    ),
  };
  const dailySales = Math.max(sales7Qty / 7, sales30Qty / 30);
  const hasSufficientSample = sales30Qty >= 3 && orderCount30 >= 2;
  const hasRecentSales = sales7Qty > 0 || sales30Qty > 0 || sales90Qty > 0;
  const incomingNote =
    inTransitQty + onOrderQty > 0
      ? ` 当前转运在途 ${inTransitQty} 件、已采购待入库 ${onOrderQty} 件；下单前核对到货安排，仅抵扣补货窗口内预计到货的确认数量。`
      : "";
  const base: ReplenishmentDecision = {
    status: "insufficient_data",
    label: "数据不足",
    priority: 10,
    dailySales,
    coverageDays: null,
    daysUntilReorder: null,
    suggestedQty: null,
    projectedStockoutDate: null,
    reorderByDate: null,
    sales7Qty,
    sales30Qty,
    sales90Qty,
    orderCount30,
    inTransitQty,
    onOrderQty,
    timelyIncomingQty,
    confidence: hasSufficientSample ? "normal" : "low",
    reason: "",
    action: "",
  };

  if (input.catalogStatus === "disabled") {
    return {
      ...base,
      status: "paused",
      label: "已停用",
      priority: 0,
      reason: "该规格已停用，不生成补货建议。",
      action: "需要继续经营时先恢复商品。",
    };
  }

  if (input.productKind === "USED") {
    return {
      ...base,
      status: "non_replenishable",
      label: "单件经营",
      priority: 0,
      reason: "中古单件的品相和货源不同，不按同一规格销量自动建议采购。",
      action: "结合具体货源、品相和利润人工判断。",
    };
  }

  if (!hasSufficientSample) {
    const isSoldOut = sellableQty === 0 && hasRecentSales;
    return {
      ...base,
      status: isSoldOut ? "out_of_stock" : "insufficient_data",
      label: isSoldOut ? "已售罄" : "数据不足",
      priority: isSoldOut ? 90 : 10,
      reason: `${isSoldOut ? "近 90 天有成交，当前可售库存为 0。" : ""}近 30 天销售 ${sales30Qty} 件、${orderCount30} 单，${hasRecentSales ? "样本不足（至少 3 件、2 单），暂不预测售罄日期和补货数量。" : "暂无有效销量，暂不预测售罄日期和补货数量。"}${incomingNote}`,
      action: isSoldOut
        ? "核对近期需求和到货安排，再决定是否补货。"
        : "积累有效订单，结合货源情况人工判断。",
    };
  }

  const coverageDays = sellableQty / dailySales;
  const reorderWindow = policy.leadTimeDays + policy.safetyDays;
  const daysUntilReorder = Math.floor(coverageDays - reorderWindow);
  const suggestedQty = Math.max(
    0,
    Math.ceil(
      dailySales * (reorderWindow + policy.targetCoverDays) - sellableQty - timelyIncomingQty
    )
  );
  const now = input.now && Number.isFinite(input.now.getTime()) ? input.now : new Date();
  const forecast = {
    coverageDays,
    daysUntilReorder,
    suggestedQty,
    projectedStockoutDate: utcDateAfter(now, Math.ceil(coverageDays)),
    reorderByDate: utcDateAfter(now, daysUntilReorder),
  };
  const demandNote = `按近 7 / 30 天较高日均销量估算，现货约可售 ${Math.floor(coverageDays)} 天；补货周期 ${policy.leadTimeDays} 天、安全缓冲 ${policy.safetyDays} 天。`;
  const timelyNote =
    timelyIncomingQty > 0
      ? ` 已按补货窗口内预计到货的 ${timelyIncomingQty} 件抵扣计划补量，到货前的现货缺口仍需处理。`
      : "";
  const reason = `${demandNote}${timelyNote}${incomingNote}`;
  const action =
    suggestedQty > 0
      ? `建议补充 ${suggestedQty} 件，采购前确认交期和未到货订单。`
      : "已有到货安排覆盖计划补量，优先核对并催促到货，现货缺口仍需处理。";

  if (sellableQty === 0) {
    return {
      ...base,
      ...forecast,
      status: "out_of_stock",
      label: "已售罄",
      priority: 100,
      reason: `当前已无可售库存。${reason}`,
      action,
    };
  }
  if (coverageDays <= reorderWindow) {
    return {
      ...base,
      ...forecast,
      status: "reorder_now",
      label: "需补货",
      priority: 80,
      reason,
      action,
    };
  }
  if (coverageDays <= reorderWindow + 7) {
    return {
      ...base,
      ...forecast,
      status: "reorder_soon",
      label: "即将补货",
      priority: 60,
      reason,
      action: `预计 ${daysUntilReorder} 天后进入补货期，提前确认货源。`,
    };
  }
  return {
    ...base,
    ...forecast,
    status: "covered",
    label: "库存充足",
    priority: 20,
    reason,
    action: "当前现货尚未进入补货期，持续关注销量变化。",
  };
}
