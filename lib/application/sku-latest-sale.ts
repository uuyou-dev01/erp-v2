import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { VALID_SALES_STATUSES } from "@/lib/application/sales-metrics";
import { parseSkuCatalogMeta } from "@/lib/application/sku-catalog";

export interface LatestSkuSale {
  price: string;
  currency: string;
  soldAt: string;
  platformName: string | null;
}

/** Original per-unit transaction price, across markets; not net proceeds after fees/refunds. */
export async function getLatestNewSkuSale(
  storeId: string,
  skuId: string
): Promise<LatestSkuSale | null> {
  const sku = await prisma.sKU.findFirst({
    where: { id: skuId, storeId },
    select: { attributes: true },
  });
  if (!sku || parseSkuCatalogMeta(sku.attributes).productKind === "USED") return null;

  const now = new Date();
  let cursor: string | undefined;
  // Page through history so returned recent orders do not hide an older valid sale.
  for (;;) {
    const lines = await prisma.orderLine.findMany({
      where: {
        skuId,
        sku: { storeId },
        quantity: { gt: 0 },
        lineAmount: { gte: 0 },
        order: {
          storeId,
          orderStatus: { in: [...VALID_SALES_STATUSES] },
          orderDate: { lte: now },
        },
      },
      orderBy: [{ order: { orderDate: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        quantity: true,
        lineAmount: true,
        allocations: {
          where: {
            status: {
              in: [
                "PENDING",
                "ALLOCATED",
                "SHIPPED",
                "DELIVERED",
                "RETURNED",
                "PARTIALLY_RETURNED",
              ],
            },
          },
          select: { id: true, allocationType: true, quantity: true, status: true },
        },
        afterSalesLines: {
          select: {
            receipts: {
              where: { createdAt: { lte: now } },
              select: { orderAllocationId: true, quantity: true },
            },
          },
        },
        order: {
          select: { orderDate: true, currency: true, platform: { select: { name: true } } },
        },
      },
    });

    for (const line of lines) {
      const quantity = new Decimal(line.quantity.toString());
      const amount = new Decimal(line.lineAmount.toString());
      if (!quantity.isFinite() || quantity.lte(0) || !amount.isFinite() || amount.lt(0)) continue;
      const returnedByAllocation = new Map<string, Decimal>();
      for (const afterSale of line.afterSalesLines) {
        for (const receipt of afterSale.receipts) {
          returnedByAllocation.set(
            receipt.orderAllocationId,
            (returnedByAllocation.get(receipt.orderAllocationId) ?? new Decimal(0)).plus(
              Decimal.max(0, receipt.quantity.toString())
            )
          );
        }
      }
      let remainingNewQty = quantity;
      for (const allocation of line.allocations) {
        const allocatedQty = Decimal.max(0, allocation.quantity.toString());
        // Item-unit sales belong to the separate single-item panel, including mixed lines.
        const excludedQty =
          allocation.allocationType === "ITEM_UNIT" || allocation.status === "RETURNED"
            ? allocatedQty
            : Decimal.min(allocatedQty, returnedByAllocation.get(allocation.id) ?? 0);
        remainingNewQty = remainingNewQty.minus(excludedQty);
      }
      if (remainingNewQty.lte(0)) continue;

      return {
        price: amount.div(quantity).toFixed(2),
        currency: line.order.currency,
        soldAt: line.order.orderDate.toISOString(),
        platformName: line.order.platform?.name ?? null,
      };
    }
    if (lines.length < 50) return null;
    cursor = lines[lines.length - 1].id;
  }
}
