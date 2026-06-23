import Decimal from "decimal.js";
import { computeOrderProfitSummary } from "@/lib/application/order-fees";

export interface DashboardProfitMetricInput {
  salesAmount: Decimal;
  platformFee: Decimal;
  shippingFee: Decimal;
  inventoryCost: Decimal;
}

export function computeDashboardProfitMetrics(input: DashboardProfitMetricInput) {
  const profitSummary = computeOrderProfitSummary({
    lines: [
      {
        id: "dashboard-total",
        lineAmount: input.salesAmount,
        inventoryCost: input.inventoryCost,
      },
    ],
    platformFee: input.platformFee,
    shippingFee: input.shippingFee,
  });

  return {
    grossProfit: profitSummary.grossProfit,
    profitRate: input.salesAmount.gt(0)
      ? profitSummary.grossProfit.div(input.salesAmount).mul(100)
      : new Decimal(0),
  };
}
