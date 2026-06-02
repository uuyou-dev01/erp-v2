import Decimal from "decimal.js";

export interface LotBreakdown {
  lotId: string;
  bookQty: number;
  unitCost: string;
  receivedAt: Date;
}

export interface AllocationLine {
  lotId: string;
  deltaQty: number;
}

export function aggregateKey(skuId: string, locationId: string) {
  return `${skuId}:${locationId}`;
}

export function roundBookQty(raw: Decimal | string | number): number {
  return new Decimal(raw).round().toNumber();
}

export function computeWeightedAvgCost(
  lots: Array<{ bookQty: number; unitCost: string }>
): string {
  let totalQty = 0;
  let totalCost = new Decimal(0);

  for (const lot of lots) {
    if (lot.bookQty <= 0) continue;
    totalQty += lot.bookQty;
    totalCost = totalCost.plus(new Decimal(lot.unitCost).mul(lot.bookQty));
  }

  if (totalQty <= 0) {
    return lots[0]?.unitCost ?? "0";
  }

  return totalCost.div(totalQty).toFixed(2);
}

export function allocateStocktakeDelta(
  lots: LotBreakdown[],
  delta: number
): AllocationLine[] {
  if (delta === 0) return [];

  if (lots.length === 0) {
    throw new Error("没有可调整的入库批次");
  }

  if (delta > 0) {
    const newest = [...lots].sort(
      (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()
    )[0];
    return [{ lotId: newest.lotId, deltaQty: delta }];
  }

  const oldestFirst = [...lots].sort(
    (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()
  );
  let remaining = Math.abs(delta);
  const lines: AllocationLine[] = [];

  for (const lot of oldestFirst) {
    if (remaining <= 0) break;
    if (lot.bookQty <= 0) continue;
    const deduct = Math.min(lot.bookQty, remaining);
    lines.push({ lotId: lot.lotId, deltaQty: -deduct });
    remaining -= deduct;
  }

  if (remaining > 0) {
    throw new Error(`盘亏数量超过账面库存，仍差 ${remaining} 件无法扣减`);
  }

  return lines;
}
