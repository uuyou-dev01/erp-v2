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
  const inventoryCost = input.inventoryCost ?? new Decimal(0);

  let platformFee = input.platformFeeAmount ?? new Decimal(0);
  if (platformFee.lte(0) && input.platformFeeRate && input.platformFeeRate.gt(0)) {
    platformFee = input.subtotal.times(input.platformFeeRate);
  }

  const netRevenue = input.subtotal.minus(platformFee).minus(shippingFee).minus(miscFee).minus(inventoryCost);

  return { platformFee, shippingFee, miscFee, netRevenue };
}

export function feeResultToStrings(result: OrderFeeResult) {
  return {
    platformFee: result.platformFee.toFixed(4),
    shippingFee: result.shippingFee.toFixed(4),
    miscFee: result.miscFee.toFixed(4),
    netRevenue: result.netRevenue.toFixed(4),
  };
}
