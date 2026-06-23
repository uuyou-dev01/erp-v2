"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { createStoreMoneyConverter } from "@/lib/fx";
import {
  createInboundInventoryLot,
  getStoreStockBreakdown,
  type SkuStockBreakdown,
} from "@/lib/application/inventory";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { createItemUnitWithIdentity } from "@/lib/application/item-unit-identity";
import { assertOperationalSku } from "@/lib/application/sku-operability";

/**
 * 获取 store 内每个 SKU 的可售/转运库存细分（plain object 版，可跨 server action 边界传输）
 */
export async function getSkuStockBreakdownMap(
  storeId: string
): Promise<Record<string, SkuStockBreakdown>> {
  const map = await getStoreStockBreakdown(storeId);
  return Object.fromEntries(map.entries());
}

export interface CreateInventoryLotInput {
  storeId: string;
  skuId: string;
  locationId: string;
  quantity: string; // Decimal as string
  unitCost: string; // Decimal as string
  costCurrency: string;
  sourceType: "PURCHASE" | "SPLIT";
  sourceId: string;
  receivedAt: Date;
}

export interface UpdateInventoryLotInput {
  id: string;
  locationId?: string;
  status?: "ACTIVE" | "CONSUMED";
}

export async function getInventoryLots(storeId: string) {
  const lots = await prisma.inventoryLot.findMany({
    where: { storeId },
    include: {
      sku: {
        include: {
          parentSku: { select: { code: true, name: true } },
        },
      },
      location: true,
    },
    orderBy: { receivedAt: "desc" },
  });

  const lotIds = lots.map((lot) => lot.id);
  const ledgerTotals =
    lotIds.length > 0
      ? await prisma.stockLedger.groupBy({
          by: ["entityId"],
          where: {
            storeId,
            entityType: "LOT",
            entityId: { in: lotIds },
          },
          _sum: {
            deltaQty: true,
          },
        })
      : [];
  const qtyByLotId = new Map(
    ledgerTotals.map((row) => [
      row.entityId,
      new Decimal(row._sum.deltaQty?.toString() ?? "0"),
    ])
  );
  const converter = await createStoreMoneyConverter(storeId);

  return Promise.all(
    lots.map(async (lot) => {
      const onHandQuantity = qtyByLotId.get(lot.id) ?? new Decimal(0);
      const rawValue = onHandQuantity.gt(0)
        ? new Decimal(lot.unitCost.toString()).mul(onHandQuantity)
        : new Decimal(0);
      const inventoryValue = await converter.convertToBase(rawValue, lot.costCurrency, {
        effectiveAt: lot.receivedAt,
      });

      return {
        ...lot,
        onHandQuantity: onHandQuantity.toString(),
        inventoryValue: inventoryValue.toFixed(2),
        inventoryValueCurrency: converter.baseCurrency,
      };
    })
  );
}

export async function getInventoryLotById(id: string) {
  const lot = await prisma.inventoryLot.findUnique({
    where: { id },
    include: {
      sku: true,
      location: true,
      allocations: {
        include: {
          orderLine: {
            include: {
              order: true,
            },
          },
        },
      },
    },
  });

  if (!lot) return null;

  // Fetch stock ledgers separately
  const stockLedgers = await prisma.stockLedger.findMany({
    where: {
      entityType: "LOT",
      entityId: id,
    },
    orderBy: { occurredAt: "desc" },
    take: 20,
  });

  return {
    ...lot,
    stockLedgers,
  };
}

export async function getAvailableQuantity(lotId: string): Promise<string> {
  const ledgers = await prisma.stockLedger.findMany({
    where: {
      entityType: "LOT",
      entityId: lotId,
    },
  });

  const total = ledgers.reduce((sum, ledger) => {
    return sum.plus(new Decimal(ledger.deltaQty.toString()));
  }, new Decimal(0));

  return total.toString();
}

export async function createInventoryLot(data: CreateInventoryLotInput) {
  await assertOperationalSku(prisma, {
    storeId: data.storeId,
    skuId: data.skuId,
    actionLabel: "入库",
  });

  const result = await prisma.$transaction(async (tx) => {
    return createInboundInventoryLot(tx, {
      storeId: data.storeId,
      skuId: data.skuId,
      locationId: data.locationId,
      quantity: data.quantity,
      unitCost: data.unitCost,
      costCurrency: data.costCurrency,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      receivedAt: data.receivedAt,
    });
  });

  revalidatePath("/inventory/lots");
  return result;
}

export async function createInventoryLotAction(data: CreateInventoryLotInput) {
  try {
    const lot = await createInventoryLot(data);
    return actionSuccess({ id: lot.id });
  } catch (error) {
    return toActionFailure(error, "创建入库库存失败，请重试");
  }
}

export async function updateInventoryLot(data: UpdateInventoryLotInput) {
  const lot = await prisma.inventoryLot.update({
    where: { id: data.id },
    data: {
      locationId: data.locationId,
      status: data.status,
    },
  });

  revalidatePath("/inventory/lots");
  revalidatePath(`/inventory/lots/${data.id}`);
  return lot;
}

export interface ConvertLotToItemUnitInput {
  lotId: string;
  storeId: string;
  quantity: number;
  conditionGrade: string;
  notes?: string;
}

export async function convertLotToItemUnit(data: ConvertLotToItemUnitInput) {
  const { lotId, storeId, quantity, conditionGrade, notes } = data;

  const result = await prisma.$transaction(async (tx) => {
    const lot = await tx.inventoryLot.findUnique({
      where: { id: lotId },
      include: { sku: true, location: true },
    });

    if (!lot) throw new Error("入库库存不存在");
    if (lot.status !== "ACTIVE") throw new Error("入库库存状态不是活跃，无法拆分");

    const ledgers = await tx.stockLedger.findMany({
      where: { entityType: "LOT", entityId: lotId },
    });
    const availableQty = ledgers.reduce(
      (sum, l) => sum.plus(new Decimal(l.deltaQty.toString())),
      new Decimal(0)
    );
    if (availableQty.lessThan(quantity)) {
      throw new Error(`可用数量不足，当前可用: ${availableQty.toString()}`);
    }

    const split = await tx.inventorySplit.create({
      data: {
        storeId,
        splitType: "UNBOX",
        sourceType: "LOT",
        sourceId: lotId,
        totalSourceCost: new Decimal(lot.unitCost.toString()).mul(quantity).toFixed(4),
        allocationMethod: "PROPORTIONAL_BY_QTY",
      },
    });

    const itemUnit = await createItemUnitWithIdentity(tx, {
      storeId,
      data: {
        storeId,
        skuId: lot.skuId,
        locationId: lot.locationId,
        unitCost: lot.unitCost,
        costCurrency: lot.costCurrency,
        conditionGrade,
        notes,
        sourceType: "SPLIT",
        sourceId: split.id,
        status: "AVAILABLE",
      },
    });

    await tx.inventorySplitLine.create({
      data: {
        splitId: split.id,
        targetType: "ITEM_UNIT",
        targetId: itemUnit.id,
        quantity: new Decimal(quantity).toFixed(4),
        allocatedCost: new Decimal(lot.unitCost.toString()).mul(quantity).toFixed(4),
      },
    });

    await tx.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lotId,
        locationId: lot.locationId,
        deltaQty: new Decimal(quantity).neg().toFixed(4),
        reason: "SPLIT_OUT",
        refType: "SPLIT",
        refId: split.id,
      },
    });

    await tx.stockLedger.create({
      data: {
        storeId,
        entityType: "ITEM_UNIT",
        entityId: itemUnit.id,
        locationId: lot.locationId,
        deltaQty: new Decimal(quantity).toFixed(4),
        reason: "SPLIT_IN",
        refType: "SPLIT",
        refId: split.id,
      },
    });

    return { split, itemUnit };
  });

  revalidatePath(`/inventory/lots/${lotId}`);
  revalidatePath("/inventory/items");
  return result;
}

export async function convertLotToItemUnitAction(data: ConvertLotToItemUnitInput) {
  try {
    const result = await convertLotToItemUnit(data);
    return actionSuccess({
      splitId: result.split.id,
      itemUnitId: result.itemUnit.id,
    });
  } catch (error) {
    return toActionFailure(error, "拆出单品失败，请重试");
  }
}

export async function deleteInventoryLot(id: string) {
  // Check if lot has any stock ledger entries besides the initial inbound
  const ledgerCount = await prisma.stockLedger.count({
    where: {
      entityType: "LOT",
      entityId: id,
    },
  });

  if (ledgerCount > 1) {
    throw new Error(
      "Cannot delete lot with transaction history. Set status to CONSUMED instead."
    );
  }

  // Delete in transaction (lot and its initial ledger entry)
  await prisma.$transaction(async (tx) => {
    await tx.stockLedger.deleteMany({
      where: {
        entityType: "LOT",
        entityId: id,
      },
    });

    await tx.inventoryLot.delete({
      where: { id },
    });
  });

  revalidatePath("/inventory/lots");
}
