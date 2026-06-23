import Decimal from "decimal.js";

export interface OrderFeeInput {
  subtotal: Decimal;
  platformFeeRate?: Decimal | null;
  platformFeeAmount?: Decimal | null;
  shippingFee?: Decimal | null;
  miscFee?: Decimal | null;
  inventoryCost?: Decimal | null;
}

export interface OrderFeeResult {
  platformFee: Decimal;
  shippingFee: Decimal;
  miscFee: Decimal;
  netRevenue: Decimal;
}

/** Parse fee text like "10%" or "300" against a base amount */
export function parseFeeText(text: string | null | undefined, baseAmount: Decimal): Decimal {
  const value = text?.trim();
  if (!value) return new Decimal(0);
  const percent = value.match(/([\d.]+)\s*%/);
  if (percent) {
    return baseAmount.times(new Decimal(percent[1])).div(100);
  }
  const amount = value.match(/[\d.]+/);
  return amount ? new Decimal(amount[0]) : new Decimal(0);
}

export function computeOrderFees(input: OrderFeeInput): OrderFeeResult {
  const shippingFee = input.shippingFee ?? new Decimal(0);
  const miscFee = input.miscFee ?? new Decimal(0);
  let platformFee = input.platformFeeAmount ?? new Decimal(0);
  if (platformFee.lte(0) && input.platformFeeRate && input.platformFeeRate.gt(0)) {
    platformFee = input.subtotal.times(input.platformFeeRate);
  }

  const netRevenue = input.subtotal.minus(platformFee).minus(shippingFee).minus(miscFee);

  return { platformFee, shippingFee, miscFee, netRevenue };
}

export interface AllocationLineInput {
  id: string;
  lineAmount: Decimal;
}

export interface AllocatedAmount {
  id: string;
  amount: Decimal;
}

export function allocateAmountByLineAmount(input: {
  amount: Decimal;
  lines: AllocationLineInput[];
  scale?: number;
}): AllocatedAmount[] {
  const scale = input.scale ?? 4;
  if (input.lines.length === 0) return [];

  const totalLineAmount = input.lines.reduce(
    (sum, line) => sum.plus(line.lineAmount),
    new Decimal(0)
  );

  if (totalLineAmount.lte(0)) {
    return input.lines.map((line, index) => ({
      id: line.id,
      amount: index === 0 ? input.amount.toDecimalPlaces(scale) : new Decimal(0),
    }));
  }

  const largestLineId = input.lines.reduce((largest, line) =>
    line.lineAmount.gt(largest.lineAmount) ? line : largest
  ).id;

  let allocatedTotal = new Decimal(0);
  const rows = input.lines.map((line) => {
    const amount = input.amount
      .times(line.lineAmount)
      .div(totalLineAmount)
      .toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
    allocatedTotal = allocatedTotal.plus(amount);
    return { id: line.id, amount };
  });

  const targetTotal = input.amount.toDecimalPlaces(scale);
  const remainder = targetTotal.minus(allocatedTotal);
  if (!remainder.eq(0)) {
    const target = rows.find((row) => row.id === largestLineId) ?? rows[0];
    target.amount = target.amount.plus(remainder).toDecimalPlaces(scale);
  }

  return rows;
}

export interface OrderProfitLineInput {
  id: string;
  lineAmount: Decimal;
  inventoryCost: Decimal;
}

export interface OrderProfitSummary {
  grossRevenue: Decimal;
  discountTotal: Decimal;
  platformFee: Decimal;
  shippingFee: Decimal;
  miscFee: Decimal;
  netRevenue: Decimal;
  inventoryCost: Decimal;
  grossProfit: Decimal;
  lines: Array<{
    id: string;
    grossRevenue: Decimal;
    allocatedDiscount: Decimal;
    allocatedPlatformFee: Decimal;
    allocatedShippingFee: Decimal;
    allocatedMiscFee: Decimal;
    inventoryCost: Decimal;
    grossProfit: Decimal;
  }>;
}

export function computeOrderProfitSummary(input: {
  lines: OrderProfitLineInput[];
  discountTotal?: Decimal | null;
  platformFee?: Decimal | null;
  shippingFee?: Decimal | null;
  miscFee?: Decimal | null;
  scale?: number;
}): OrderProfitSummary {
  const scale = input.scale ?? 4;
  const discountTotal = input.discountTotal ?? new Decimal(0);
  const platformFee = input.platformFee ?? new Decimal(0);
  const shippingFee = input.shippingFee ?? new Decimal(0);
  const miscFee = input.miscFee ?? new Decimal(0);

  const grossRevenue = input.lines.reduce(
    (sum, line) => sum.plus(line.lineAmount),
    new Decimal(0)
  );
  const inventoryCost = input.lines.reduce(
    (sum, line) => sum.plus(line.inventoryCost),
    new Decimal(0)
  );
  const allocationLines = input.lines.map((line) => ({
    id: line.id,
    lineAmount: line.lineAmount,
  }));
  const discounts = new Map(
    allocateAmountByLineAmount({ amount: discountTotal, lines: allocationLines, scale }).map(
      (row) => [row.id, row.amount]
    )
  );
  const platformFees = new Map(
    allocateAmountByLineAmount({ amount: platformFee, lines: allocationLines, scale }).map(
      (row) => [row.id, row.amount]
    )
  );
  const shippingFees = new Map(
    allocateAmountByLineAmount({ amount: shippingFee, lines: allocationLines, scale }).map(
      (row) => [row.id, row.amount]
    )
  );
  const miscFees = new Map(
    allocateAmountByLineAmount({ amount: miscFee, lines: allocationLines, scale }).map(
      (row) => [row.id, row.amount]
    )
  );

  const lines = input.lines.map((line) => {
    const allocatedDiscount = discounts.get(line.id) ?? new Decimal(0);
    const allocatedPlatformFee = platformFees.get(line.id) ?? new Decimal(0);
    const allocatedShippingFee = shippingFees.get(line.id) ?? new Decimal(0);
    const allocatedMiscFee = miscFees.get(line.id) ?? new Decimal(0);
    const grossProfit = line.lineAmount
      .minus(allocatedDiscount)
      .minus(allocatedPlatformFee)
      .minus(allocatedShippingFee)
      .minus(allocatedMiscFee)
      .minus(line.inventoryCost)
      .toDecimalPlaces(scale);

    return {
      id: line.id,
      grossRevenue: line.lineAmount.toDecimalPlaces(scale),
      allocatedDiscount,
      allocatedPlatformFee,
      allocatedShippingFee,
      allocatedMiscFee,
      inventoryCost: line.inventoryCost.toDecimalPlaces(scale),
      grossProfit,
    };
  });

  const netRevenue = grossRevenue
    .minus(discountTotal)
    .minus(platformFee)
    .minus(shippingFee)
    .minus(miscFee)
    .toDecimalPlaces(scale);
  const grossProfit = netRevenue.minus(inventoryCost).toDecimalPlaces(scale);

  return {
    grossRevenue: grossRevenue.toDecimalPlaces(scale),
    discountTotal: discountTotal.toDecimalPlaces(scale),
    platformFee: platformFee.toDecimalPlaces(scale),
    shippingFee: shippingFee.toDecimalPlaces(scale),
    miscFee: miscFee.toDecimalPlaces(scale),
    netRevenue,
    inventoryCost: inventoryCost.toDecimalPlaces(scale),
    grossProfit,
    lines,
  };
}

export interface AllocatedOrderProfitLineInput {
  id: string;
  lineAmount: Decimal;
  allocations: Array<{ costAmount: Decimal }>;
}

export function computeAllocatedOrderProfitSummary(input: {
  revenueAmount: Decimal;
  lines: AllocatedOrderProfitLineInput[];
  platformFee?: Decimal | null;
  shippingFee?: Decimal | null;
  miscFee?: Decimal | null;
  scale?: number;
}): OrderProfitSummary {
  const inventoryCost = input.lines.reduce(
    (orderSum, line) =>
      orderSum.plus(
        line.allocations.reduce(
          (lineSum, allocation) => lineSum.plus(allocation.costAmount),
          new Decimal(0)
        )
      ),
    new Decimal(0)
  );
  const lineRevenue = input.lines.reduce(
    (sum, line) => sum.plus(line.lineAmount),
    new Decimal(0)
  );

  if (!lineRevenue.eq(input.revenueAmount)) {
    return computeOrderProfitSummary({
      lines: [{ id: "order-total", lineAmount: input.revenueAmount, inventoryCost }],
      platformFee: input.platformFee,
      shippingFee: input.shippingFee,
      miscFee: input.miscFee,
      scale: input.scale,
    });
  }

  return computeOrderProfitSummary({
    lines: input.lines.map((line) => ({
      id: line.id,
      lineAmount: line.lineAmount,
      inventoryCost: line.allocations.reduce(
        (sum, allocation) => sum.plus(allocation.costAmount),
        new Decimal(0)
      ),
    })),
    platformFee: input.platformFee,
    shippingFee: input.shippingFee,
    miscFee: input.miscFee,
    scale: input.scale,
  });
}

export function feeResultToStrings(result: OrderFeeResult) {
  return {
    platformFee: result.platformFee.toFixed(4),
    shippingFee: result.shippingFee.toFixed(4),
    miscFee: result.miscFee.toFixed(4),
    netRevenue: result.netRevenue.toFixed(4),
  };
}
