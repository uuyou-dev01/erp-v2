import Decimal from "decimal.js";

export interface BundleAllocationBasis {
  id: string;
  referenceAmount?: string | null;
}

/**
 * Split a bundle's final selling price across its lines. The last line receives
 * the rounding remainder so the persisted line total always equals the order total.
 */
export function allocateBundleSaleAmounts(
  totalPrice: string,
  lines: BundleAllocationBasis[],
  scale = 2
): Record<string, string> {
  if (lines.length === 0) return {};

  const total = new Decimal(totalPrice || 0);
  if (!total.isFinite() || total.lt(0)) {
    throw new Error("打包成交价必须是非负数字");
  }

  const weights = lines.map((line) => {
    try {
      const value = new Decimal(line.referenceAmount || 0);
      return value.isFinite() && value.gt(0) ? value : new Decimal(0);
    } catch {
      return new Decimal(0);
    }
  });
  const weightTotal = weights.reduce((sum, value) => sum.plus(value), new Decimal(0));
  const effectiveWeights = weightTotal.gt(0) ? weights : lines.map(() => new Decimal(1));
  const effectiveTotal = effectiveWeights.reduce((sum, value) => sum.plus(value), new Decimal(0));

  let allocated = new Decimal(0);
  return Object.fromEntries(
    lines.map((line, index) => {
      const amount =
        index === lines.length - 1
          ? total.minus(allocated)
          : total
              .mul(effectiveWeights[index])
              .div(effectiveTotal)
              .toDecimalPlaces(scale, Decimal.ROUND_DOWN);
      allocated = allocated.plus(amount);
      return [line.id, amount.toFixed(scale)];
    })
  );
}

export function bundleAllocationDifference(totalPrice: string, allocatedAmounts: Iterable<string>) {
  let total: Decimal;
  try {
    total = new Decimal(totalPrice || 0);
  } catch {
    total = new Decimal(0);
  }
  const allocated = [...allocatedAmounts].reduce((sum, raw) => {
    try {
      const value = new Decimal(raw || 0);
      return value.isFinite() ? sum.plus(value) : sum;
    } catch {
      return sum;
    }
  }, new Decimal(0));
  return total.minus(allocated).toDecimalPlaces(2).toFixed(2);
}
