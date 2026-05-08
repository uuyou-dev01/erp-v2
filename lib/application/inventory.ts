import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

export type InboundSourceType = "PURCHASE" | "SPLIT";

export interface CreateInboundInventoryLotInput {
  storeId: string;
  skuId: string;
  locationId: string;
  quantity: string;
  unitCost: string;
  costCurrency: string;
  sourceType: InboundSourceType;
  sourceId: string;
  receivedAt: Date;
  refType?: string;
  refId?: string;
  meta?: Prisma.InputJsonValue;
}

export async function createInboundInventoryLot(
  tx: Prisma.TransactionClient,
  input: CreateInboundInventoryLotInput
) {
  const quantity = new Decimal(input.quantity);
  const unitCost = new Decimal(input.unitCost);

  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new Error("入库数量必须大于 0");
  }

  if (!unitCost.isFinite() || unitCost.lt(0)) {
    throw new Error("单位成本不能小于 0");
  }

  const lot = await tx.inventoryLot.create({
    data: {
      storeId: input.storeId,
      skuId: input.skuId,
      locationId: input.locationId,
      unitCost: unitCost.toFixed(4),
      costCurrency: input.costCurrency,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      receivedAt: input.receivedAt,
      status: "ACTIVE",
    },
  });

  await tx.stockLedger.create({
    data: {
      storeId: input.storeId,
      occurredAt: input.receivedAt,
      entityType: "LOT",
      entityId: lot.id,
      locationId: input.locationId,
      deltaQty: quantity.toFixed(4),
      reason: "INBOUND_PURCHASE",
      refType: input.refType ?? input.sourceType,
      refId: input.refId ?? input.sourceId,
      meta:
        input.meta ??
        ({
          unitCost: unitCost.toString(),
          currency: input.costCurrency,
        } satisfies Prisma.InputJsonObject),
    },
  });

  return lot;
}
