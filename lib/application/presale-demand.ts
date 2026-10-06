import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { RESERVING_ALLOCATION_STATUSES } from "./order-allocation";

/** Call while holding the SKU lock. Existing reservations are already excluded from stock. */
export async function pendingPresaleDemand(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    skuId: string;
    market?: string | null;
    beforeOrderId?: string;
  }
) {
  const lines = await tx.orderLine.findMany({
    where: {
      skuId: input.skuId,
      order: {
        storeId: input.storeId,
        isPresale: true,
        orderStatus: "DRAFT",
        ...(input.market && input.market !== "UNKNOWN" ? { shippingCountry: input.market } : {}),
      },
    },
    select: {
      orderId: true,
      quantity: true,
      order: { select: { createdAt: true, id: true } },
      allocations: {
        where: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } },
        select: { quantity: true },
      },
    },
    orderBy: [{ order: { createdAt: "asc" } }, { orderId: "asc" }],
  });
  let demand = new Decimal(0);
  for (const line of lines) {
    if (line.orderId === input.beforeOrderId) break;
    const reserved = line.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.quantity.toString()),
      new Decimal(0)
    );
    demand = demand.plus(Decimal.max(0, new Decimal(line.quantity.toString()).minus(reserved)));
  }
  return demand;
}
