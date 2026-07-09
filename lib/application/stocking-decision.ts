export type StockingPool =
  | "good"
  | "testing"
  | "slowProfit"
  | "pressure"
  | "clearance"
  | "insufficient";

export interface StockingDecisionInput {
  sellableQty: number;
  inTransitQty?: number;
  sales30Qty: number;
  sales90Qty: number;
  oldestStockAgeDays?: number | null;
  grossMarginRate?: number | null;
  hasReferenceSignal?: boolean;
}

export interface StockingDecision {
  pool: StockingPool;
  score: number;
  labels: string[];
  action: string;
  reason: string;
  sellThrough30: number;
  sales30Qty: number;
  sales90Qty: number;
  oldestStockAgeDays: number | null;
}

export type StockingPoolSummary = Record<StockingPool, number>;

const POOLS: StockingPool[] = [
  "good",
  "testing",
  "slowProfit",
  "pressure",
  "clearance",
  "insufficient",
];

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function ageLabel(days: number | null) {
  if (days === null) return "库龄未知";
  if (days > 90) return "90天清仓";
  if (days > 60) return "60天降价";
  return null;
}

export function buildStockingDecision(input: StockingDecisionInput): StockingDecision {
  const sellableQty = Math.max(0, Number(input.sellableQty) || 0);
  const inTransitQty = Math.max(0, Number(input.inTransitQty) || 0);
  const sales30Qty = Math.max(0, Number(input.sales30Qty) || 0);
  const sales90Qty = Math.max(0, Number(input.sales90Qty) || 0);
  const oldestStockAgeDays =
    input.oldestStockAgeDays === null || input.oldestStockAgeDays === undefined
      ? null
      : Math.max(0, Math.floor(Number(input.oldestStockAgeDays) || 0));
  const grossMarginRate =
    input.grossMarginRate === null || input.grossMarginRate === undefined
      ? null
      : Number(input.grossMarginRate);
  const hasRealSales = sales30Qty > 0 || sales90Qty > 0;
  const sellThrough30 = sellableQty + sales30Qty > 0 ? sales30Qty / (sellableQty + sales30Qty) : 0;
  const hasReferenceSignal = Boolean(input.hasReferenceSignal);
  const labels: string[] = [];
  const stockAgeLabel = ageLabel(oldestStockAgeDays);
  if (stockAgeLabel) labels.push(stockAgeLabel);
  if (hasReferenceSignal) labels.push("参考热度");

  if (!hasRealSales) {
    labels.push("数据不足");
    if (oldestStockAgeDays !== null && oldestStockAgeDays > 90 && sellableQty > 0) {
      labels.push("建议清仓");
      return {
        pool: "clearance",
        score: 18,
        labels,
        action: "优先清仓回现金",
        reason: "库存已超过 90 天且缺少真实销售，不应继续补货。",
        sellThrough30,
        sales30Qty,
        sales90Qty,
        oldestStockAgeDays,
      };
    }

    return {
      pool: hasReferenceSignal ? "testing" : "insufficient",
      score: hasReferenceSignal ? 42 : 30,
      labels,
      action: hasReferenceSignal ? "1-3 件测试或预售" : "先获取真实销售数据",
      reason: hasReferenceSignal
        ? "有参考信号，但缺少真实销售，不能进入好卖池。"
        : "缺少真实销售，暂不能判断是否适合囤货。",
      sellThrough30,
      sales30Qty,
      sales90Qty,
      oldestStockAgeDays,
    };
  }

  let score = 45;
  if (sales30Qty >= 5) score += 16;
  else if (sales30Qty >= 2) score += 10;
  else score += 4;

  if (sellThrough30 >= 0.5) score += 24;
  else if (sellThrough30 >= 0.3) score += 14;
  else if (sellThrough30 >= 0.12) score += 6;

  if (grossMarginRate !== null) {
    if (grossMarginRate >= 25) score += 12;
    else if (grossMarginRate >= 15) score += 7;
    else if (grossMarginRate < 8) score -= 8;
  }

  if (oldestStockAgeDays !== null) {
    if (oldestStockAgeDays > 90) score -= 24;
    else if (oldestStockAgeDays > 60) score -= 12;
  }

  if (sellThrough30 >= 0.5 && sales30Qty >= 2) {
    labels.push("实销好卖");
    labels.push("可小批补");
    if (inTransitQty > 0) labels.push("关注在途");
    return {
      pool: "good",
      score: clampScore(score),
      labels,
      action: "按 30 天可卖量小批补货",
      reason: "有真实订单支撑，30 天动销和售罄表现较好。",
      sellThrough30,
      sales30Qty,
      sales90Qty,
      oldestStockAgeDays,
    };
  }

  if (grossMarginRate !== null && grossMarginRate >= 25 && sales90Qty > 0) {
    labels.push("利润好但慢");
    return {
      pool: "slowProfit",
      score: clampScore(score),
      labels,
      action: "控制库存，优先预售或小批补",
      reason: "有真实销售和利润空间，但周转速度不足以进入好卖池。",
      sellThrough30,
      sales30Qty,
      sales90Qty,
      oldestStockAgeDays,
    };
  }

  if (oldestStockAgeDays !== null && oldestStockAgeDays > 90) {
    labels.push("建议清仓");
    return {
      pool: "clearance",
      score: clampScore(score),
      labels,
      action: "降价、组合售卖或清仓",
      reason: "库存已超过 90 天，优先释放现金。",
      sellThrough30,
      sales30Qty,
      sales90Qty,
      oldestStockAgeDays,
    };
  }

  labels.push(oldestStockAgeDays !== null && oldestStockAgeDays > 60 ? "库存压钱" : "动销观察");
  return {
    pool: oldestStockAgeDays !== null && oldestStockAgeDays > 60 ? "pressure" : "testing",
    score: clampScore(score),
    labels,
    action: "继续观察，不重仓",
    reason: "已有真实销售，但动销速度还不足以支持囤货放量。",
    sellThrough30,
    sales30Qty,
    sales90Qty,
    oldestStockAgeDays,
  };
}

export function summarizeStockingPools(decisions: StockingDecision[]): StockingPoolSummary {
  const summary = Object.fromEntries(POOLS.map((pool) => [pool, 0])) as StockingPoolSummary;
  for (const decision of decisions) {
    summary[decision.pool] += 1;
  }
  return summary;
}
