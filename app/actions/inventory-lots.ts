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
import { requireUserContext } from "@/lib/auth/user-context";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";

/**
 * 获取 store 内每个 SKU 的可售/转运/暂存库存细分（plain object 版，可跨 server action 边界传输）
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
      location: {
        include: {
          capabilities: { where: { enabled: true } },
          shippingLanesFrom: { where: { active: true, laneType: "CUSTOMER_DELIVERY" } },
        },
      },
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
    ledgerTotals.map((row) => [row.entityId, new Decimal(row._sum.deltaQty?.toString() ?? "0")])
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
  const requestedQuantity = new Decimal(quantity);
  if (!requestedQuantity.isFinite() || requestedQuantity.lte(0)) {
    throw new Error("拆分数量必须大于 0");
  }

  const result = await prisma.$transaction(async (tx) => {
    const lotForLock = await tx.inventoryLot.findUnique({
      where: { id: lotId },
      select: { skuId: true },
    });
    if (!lotForLock) throw new Error("入库库存不存在");

    // Inventory mutations share one global order: SKU, then lot/item row.
    await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${lotForLock.skuId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;

    const lot = await tx.inventoryLot.findUnique({
      where: { id: lotId },
      include: { sku: true, location: true },
    });

    if (!lot) throw new Error("入库库存不存在");
    if (lot.storeId !== storeId) throw new Error("入库库存不属于当前店铺");
    if (lot.status !== "ACTIVE") throw new Error("入库库存状态不是活跃，无法拆分");

    const [ledgers, orderReservations, fulfillmentReservations] = await Promise.all([
      tx.stockLedger.findMany({
        where: { entityType: "LOT", entityId: lotId },
        select: { deltaQty: true },
      }),
      tx.orderAllocation.aggregate({
        where: {
          lotId,
          status: { in: [...RESERVING_ALLOCATION_STATUSES] },
        },
        _sum: { quantity: true },
      }),
      tx.fulfillmentInventoryAllocation.aggregate({
        where: { lotId, status: "ALLOCATED" },
        _sum: { quantity: true },
      }),
    ]);
    const onHandQuantity = ledgers.reduce(
      (sum, l) => sum.plus(new Decimal(l.deltaQty.toString())),
      new Decimal(0)
    );
    const reservedQuantity = new Decimal(orderReservations._sum.quantity?.toString() ?? "0").plus(
      fulfillmentReservations._sum.quantity?.toString() ?? "0"
    );
    const availableQty = onHandQuantity.minus(reservedQuantity);
    if (availableQty.lt(requestedQuantity)) {
      throw new Error(`可用数量不足，当前可用: ${availableQty.toString()}`);
    }

    const split = await tx.inventorySplit.create({
      data: {
        storeId,
        splitType: "UNBOX",
        sourceType: "LOT",
        sourceId: lotId,
        totalSourceCost: new Decimal(lot.unitCost.toString()).mul(requestedQuantity).toFixed(4),
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
        quantity: requestedQuantity.toFixed(4),
        allocatedCost: new Decimal(lot.unitCost.toString()).mul(requestedQuantity).toFixed(4),
      },
    });

    await tx.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lotId,
        locationId: lot.locationId,
        deltaQty: requestedQuantity.negated().toFixed(4),
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
        deltaQty: requestedQuantity.toFixed(4),
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
  const lot = await prisma.inventoryLot.findUnique({
    where: { id },
    select: { storeId: true },
  });
  if (!lot) throw new Error("库存批次不存在或已被删除");
  await deleteInventoryLotForStore(id, lot.storeId);
}

export interface InventoryLotDeletionImpact {
  canDelete: boolean;
  skuId: string;
  skuCode: string;
  blockers: Array<{
    key: "ledgers" | "orders" | "fulfillment" | "splits" | "sourceDocuments" | "returns";
    label: string;
    count: number;
    description: string;
  }>;
}

async function buildInventoryLotDeletionImpact(
  id: string,
  storeId: string
): Promise<InventoryLotDeletionImpact> {
  const lot = await prisma.inventoryLot.findFirst({
    where: { id, storeId },
    select: {
      skuId: true,
      sku: { select: { code: true } },
      _count: { select: { allocations: true } },
    },
  });
  if (!lot) throw new Error("库存批次不存在或无权访问");

  const [
    ledgerCount,
    fulfillmentCount,
    sourceSplitCount,
    targetSplitCount,
    quickEntryCount,
    openingStockCount,
    returnCount,
  ] = await Promise.all([
    prisma.stockLedger.count({
      where: { storeId, entityType: "LOT", entityId: id },
    }),
    prisma.fulfillmentInventoryAllocation.count({ where: { lotId: id } }),
    prisma.inventorySplit.count({ where: { storeId, sourceType: "LOT", sourceId: id } }),
    prisma.inventorySplitLine.count({ where: { targetType: "LOT", targetId: id } }),
    prisma.quickEntry.count({ where: { storeId, generatedLotId: id } }),
    prisma.openingStockLine.count({ where: { generatedLotId: id } }),
    prisma.afterSalesReceipt.count({ where: { returnedLotId: id } }),
  ]);

  const blockers: InventoryLotDeletionImpact["blockers"] = [];
  if (ledgerCount > 1) {
    blockers.push({
      key: "ledgers",
      label: "库存流水",
      count: ledgerCount,
      description: "该批次已发生盘点、出库、转运或拆分等变动，必须保留用于库存追溯。",
    });
  }
  if (lot._count.allocations > 0) {
    blockers.push({
      key: "orders",
      label: "销售分配",
      count: lot._count.allocations,
      description: "该批次已被销售订单引用，删除会破坏订单成本记录。",
    });
  }
  if (fulfillmentCount > 0) {
    blockers.push({
      key: "fulfillment",
      label: "履约占用",
      count: fulfillmentCount,
      description: "该批次已进入履约流程，需要保留来源关系。",
    });
  }
  const splitCount = sourceSplitCount + targetSplitCount;
  if (splitCount > 0) {
    blockers.push({
      key: "splits",
      label: "拆分记录",
      count: splitCount,
      description: "该批次属于拆分链路，删除会中断成本追溯。",
    });
  }
  const sourceDocumentCount = quickEntryCount + openingStockCount;
  if (sourceDocumentCount > 0) {
    blockers.push({
      key: "sourceDocuments",
      label: "来源单据",
      count: sourceDocumentCount,
      description: "该批次由快速录入或期初库存单据生成，应从来源单据处理。",
    });
  }
  if (returnCount > 0) {
    blockers.push({
      key: "returns",
      label: "售后退回",
      count: returnCount,
      description: "该批次由售后退回形成，需要保留售后追溯关系。",
    });
  }

  return {
    canDelete: blockers.length === 0,
    skuId: lot.skuId,
    skuCode: lot.sku.code,
    blockers,
  };
}

export async function getInventoryLotDeletionImpactAction(id: string, storeId: string) {
  try {
    const context = await requireUserContext({ storeId });
    const impact = await buildInventoryLotDeletionImpact(id, context.activeStoreId);
    return actionSuccess({ impact });
  } catch (error) {
    return toActionFailure(error, "无法检查库存批次关联数据，请重试");
  }
}

async function deleteInventoryLotForStore(id: string, storeId: string) {
  const context = await requireUserContext({ storeId });
  const impact = await buildInventoryLotDeletionImpact(id, context.activeStoreId);
  if (!impact.canDelete) {
    throw new Error("该批次已有库存或业务历史，不能删除。请保留批次并停用对应 SKU。");
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockLedger.deleteMany({
      where: { storeId: context.activeStoreId, entityType: "LOT", entityId: id },
    });
    const deleted = await tx.inventoryLot.deleteMany({
      where: { id, storeId: context.activeStoreId },
    });
    if (deleted.count === 0) throw new Error("库存批次不存在或已被删除");
  });

  revalidatePath("/inventory/lots");
  revalidatePath(`/inventory/lots/${id}`);
  revalidatePath("/inventory/skus");
  revalidatePath(`/inventory/skus/${impact.skuId}`);
}

export async function deleteInventoryLotAction(id: string, storeId: string) {
  try {
    await deleteInventoryLotForStore(id, storeId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除库存批次失败，请重试");
  }
}
