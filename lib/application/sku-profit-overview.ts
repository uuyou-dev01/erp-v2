import Decimal from "decimal.js";
import { createStoreMoneyConverter, FxRateUnavailableError } from "@/lib/fx";

type Money = { toString(): string };
type Source = { costCurrency: string; costStatus: string; receivedAt?: Date; createdAt?: Date };
type ProfitLine = {
  quantity: Money;
  lineAmount: Money;
  order: { currency: string; orderDate: Date };
  allocations: Array<{
    quantity: Money;
    costAmount: Money;
    costCurrency: string | null;
    status: string;
    inventoryLot: Source | null;
    itemUnit: Source | null;
  }>;
};

export async function buildSkuProfitOverview(
  storeId: string,
  lines: ProfitLine[],
  sharedConverter?: Awaited<ReturnType<typeof createStoreMoneyConverter>>
) {
  const converter = sharedConverter ?? (await createStoreMoneyConverter(storeId));
  let sales = new Decimal(0),
    matched = new Decimal(0),
    cost = new Decimal(0);
  let fulfilledLineCount = 0,
    pendingCostLineCount = 0;
  for (const line of lines) {
    try {
      const revenue = await converter.convertToBase(
        line.lineAmount.toString(),
        line.order.currency,
        { effectiveAt: line.order.orderDate }
      );
      sales = sales.plus(revenue);
      const allocations = line.allocations.filter((a) =>
        ["PENDING", "ALLOCATED", "SHIPPED", "DELIVERED"].includes(a.status)
      );
      if (
        !allocations
          .reduce((sum, a) => sum.plus(a.quantity.toString()), new Decimal(0))
          .eq(line.quantity.toString())
      ) {
        pendingCostLineCount++;
        continue;
      }
      let lineCost = new Decimal(0);
      let complete = true;
      for (const a of allocations) {
        const source = a.inventoryLot ?? a.itemUnit;
        const currency = a.costCurrency ?? source?.costCurrency;
        if (!currency || source?.costStatus === "PENDING") {
          complete = false;
          break;
        }
        lineCost = lineCost.plus(
          await converter.convertToBase(a.costAmount.toString(), currency, {
            effectiveAt: source?.receivedAt ?? source?.createdAt ?? line.order.orderDate,
          })
        );
      }
      if (!complete) {
        pendingCostLineCount++;
        continue;
      }
      matched = matched.plus(revenue);
      cost = cost.plus(lineCost);
      fulfilledLineCount++;
    } catch (error) {
      if (!(error instanceof FxRateUnavailableError)) throw error;
      pendingCostLineCount++;
    }
  }
  const profit = matched.minus(cost);
  return {
    salesAmount: sales.toFixed(2),
    costMatchedSalesAmount: matched.toFixed(2),
    allocatedInventoryCost: cost.toFixed(2),
    grossProfit: profit.toFixed(2),
    profitRate: matched.gt(0) ? profit.div(matched).mul(100).toFixed(1) : "0.0",
    fulfilledLineCount,
    pendingCostLineCount,
    currency: converter.baseCurrency,
  };
}
