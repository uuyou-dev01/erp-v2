import Decimal from "decimal.js";
import { convertMoney } from "@/lib/fx";
import { computeAllocatedOrderProfitSummary } from "@/lib/application/order-fees";

interface OrderDetailProfitAllocation {
  costAmount: Decimal.Value;
  costCurrency?: string | null;
  effectiveAt?: Date | null;
}

interface OrderDetailProfitLine {
  id: string;
  lineAmount: Decimal.Value;
  allocations: OrderDetailProfitAllocation[];
}

export function resolveAllocationCostCurrency(input: {
  orderCurrency: string;
  inventoryLot?: { costCurrency?: string | null } | null;
  itemUnit?: { costCurrency?: string | null } | null;
}) {
  return (
    input.inventoryLot?.costCurrency ??
    input.itemUnit?.costCurrency ??
    input.orderCurrency
  );
}

export async function computeOrderDetailProfit(input: {
  storeId: string;
  orderCurrency: string;
  orderDate: Date;
  totalPaid: Decimal.Value;
  subtotal: Decimal.Value;
  platformFee: Decimal.Value;
  shippingFee: Decimal.Value;
  lines: OrderDetailProfitLine[];
}) {
  const convertedLines = await Promise.all(
    input.lines.map(async (line) => ({
      id: line.id,
      lineAmount: new Decimal(line.lineAmount),
      allocations: await Promise.all(
        line.allocations.map(async (allocation) => ({
          costAmount: await convertMoney({
            amount: allocation.costAmount,
            fromCurrency: allocation.costCurrency ?? input.orderCurrency,
            toCurrency: input.orderCurrency,
            effectiveAt: allocation.effectiveAt ?? input.orderDate,
          }),
        })),
      ),
    })),
  );

  return computeAllocatedOrderProfitSummary({
    revenueAmount: new Decimal(input.totalPaid),
    platformFee: new Decimal(input.platformFee),
    shippingFee: new Decimal(input.shippingFee),
    lines: convertedLines,
  });
}
