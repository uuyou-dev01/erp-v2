"use server";

import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { receivePurchaseOrder } from "@/app/actions/purchase-orders";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { requireUserContext } from "@/lib/auth/user-context";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import { prisma } from "@/lib/prisma";
import {
  LOGISTICS_COST_SOURCE_TYPES,
  normalizeLogisticsCostInput,
  saveLogisticsShippingCost,
} from "@/lib/application/logistics-cost";

type ConsolidationStatus = "OPEN" | "SEALED" | "SHIPPED" | "RECEIVED";

const requiredPreviousStatus: Partial<Record<ConsolidationStatus, ConsolidationStatus>> = {
  SEALED: "OPEN",
  SHIPPED: "SEALED",
  RECEIVED: "SHIPPED",
};

const statusActionLabels: Partial<Record<ConsolidationStatus, string>> = {
  SEALED: "封箱",
  SHIPPED: "发出",
  RECEIVED: "确认到货",
};

function assertConsolidationStatusTransition(
  currentStatus: string,
  nextStatus: ConsolidationStatus
) {
  const required = requiredPreviousStatus[nextStatus];
  if (!required) {
    throw new Error("集运批次状态不可回退");
  }

  if (currentStatus !== required) {
    throw new Error(`当前状态不可${statusActionLabels[nextStatus] ?? "更新"}`);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

type AddPurchaseOrdersResult = {
  success: number;
  failed: number;
  errors: string[];
};

type PurchaseLineInventory = {
  lots: Array<{ id: string }>;
  units: Array<{ id: string }>;
};

function uniqueSortedIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
}

async function lockConsolidationSkuRows(
  tx: Prisma.TransactionClient,
  skuIds: Array<string | null | undefined>
) {
  for (const skuId of uniqueSortedIds(skuIds)) {
    await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId} FOR UPDATE`;
  }
}

async function lockConsolidationEntityRows(
  tx: Prisma.TransactionClient,
  input: { lotIds: string[]; itemUnitIds: string[] }
) {
  for (const lotId of uniqueSortedIds(input.lotIds)) {
    await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;
  }
  for (const itemUnitId of uniqueSortedIds(input.itemUnitIds)) {
    await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${itemUnitId} FOR UPDATE`;
  }
}

async function resolvePurchaseLineInventory(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    locationId: string;
    purchaseLines: Array<{ id: string; purchaseOrderId: string }>;
    lotStatuses: string[];
    unitStatuses: string[];
  }
) {
  const result = new Map<string, PurchaseLineInventory>(
    input.purchaseLines.map((line) => [line.id, { lots: [], units: [] }])
  );
  if (input.purchaseLines.length === 0) return result;

  const purchaseLineIds = input.purchaseLines.map((line) => line.id);
  const purchaseOrderIds = Array.from(
    new Set(input.purchaseLines.map((line) => line.purchaseOrderId))
  );
  const [originalLots, originalUnits, receivedTransferLines] = await Promise.all([
    tx.inventoryLot.findMany({
      where: {
        storeId: input.storeId,
        sourceType: "PURCHASE",
        sourceId: { in: purchaseLineIds },
      },
      select: { id: true, sourceId: true },
    }),
    tx.itemUnit.findMany({
      where: {
        storeId: input.storeId,
        sourceType: "PURCHASE",
        sourceId: { in: purchaseLineIds },
      },
      select: { id: true, sourceId: true },
    }),
    tx.inboundShipmentInventoryLine.findMany({
      where: {
        status: "RECEIVED",
        destinationEntityId: { not: null },
        shipment: { purchaseOrderId: { in: purchaseOrderIds } },
      },
      select: { entityType: true, entityId: true, destinationEntityId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const purchaseLineByEntity = new Map<string, string>();
  for (const lot of originalLots) purchaseLineByEntity.set(`LOT:${lot.id}`, lot.sourceId);
  for (const unit of originalUnits) purchaseLineByEntity.set(`ITEM_UNIT:${unit.id}`, unit.sourceId);

  // Preserve the purchase-line identity across every completed logistics leg.
  for (let pass = 0; pass <= receivedTransferLines.length; pass += 1) {
    let changed = false;
    for (const line of receivedTransferLines) {
      const purchaseLineId = purchaseLineByEntity.get(`${line.entityType}:${line.entityId}`);
      if (!purchaseLineId || !line.destinationEntityId) continue;
      const destinationKey = `${line.entityType}:${line.destinationEntityId}`;
      if (purchaseLineByEntity.has(destinationKey)) continue;
      purchaseLineByEntity.set(destinationKey, purchaseLineId);
      changed = true;
    }
    if (!changed) break;
  }

  const lotIds = Array.from(purchaseLineByEntity.keys())
    .filter((key) => key.startsWith("LOT:"))
    .map((key) => key.slice(4));
  const unitIds = Array.from(purchaseLineByEntity.keys())
    .filter((key) => key.startsWith("ITEM_UNIT:"))
    .map((key) => key.slice(10));
  const [currentLots, currentUnits] = await Promise.all([
    lotIds.length
      ? tx.inventoryLot.findMany({
          where: {
            id: { in: lotIds },
            storeId: input.storeId,
            locationId: input.locationId,
            status: { in: input.lotStatuses },
          },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    unitIds.length
      ? tx.itemUnit.findMany({
          where: {
            id: { in: unitIds },
            storeId: input.storeId,
            locationId: input.locationId,
            status: { in: input.unitStatuses },
          },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);

  for (const lot of currentLots) {
    const purchaseLineId = purchaseLineByEntity.get(`LOT:${lot.id}`);
    if (purchaseLineId) result.get(purchaseLineId)?.lots.push(lot);
  }
  for (const unit of currentUnits) {
    const purchaseLineId = purchaseLineByEntity.get(`ITEM_UNIT:${unit.id}`);
    if (purchaseLineId) result.get(purchaseLineId)?.units.push(unit);
  }
  return result;
}

async function resolveAndLockPurchaseLineInventory(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    locationId: string;
    purchaseLines: Array<{ id: string; purchaseOrderId: string; skuId: string }>;
    lotStatuses: string[];
    unitStatuses: string[];
  }
) {
  // Every inventory mutation follows one global order: all SKU rows first,
  // then lot rows, then item-unit rows. Re-read after the locks are held.
  await lockConsolidationSkuRows(
    tx,
    input.purchaseLines.map((line) => line.skuId)
  );
  const candidates = await resolvePurchaseLineInventory(tx, input);
  await lockConsolidationEntityRows(tx, {
    lotIds: [...candidates.values()].flatMap((inventory) => inventory.lots.map((lot) => lot.id)),
    itemUnitIds: [...candidates.values()].flatMap((inventory) =>
      inventory.units.map((unit) => unit.id)
    ),
  });
  return resolvePurchaseLineInventory(tx, input);
}

async function lockPurchaseLineInventory(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    locationId: string;
    purchaseOrderId: string;
    purchaseLine: {
      id: string;
      quantity: Decimal;
      sku: { code: string; name: string };
    };
    inventory: PurchaseLineInventory;
  }
) {
  const { lots, units } = input.inventory;

  const lotIds = lots.map((lot) => lot.id);
  const unitIds = units.map((unit) => unit.id);
  const [lotLedgers, reservations] = await Promise.all([
    lotIds.length
      ? tx.stockLedger.groupBy({
          by: ["entityId"],
          where: {
            entityType: "LOT",
            entityId: { in: lotIds },
          },
          _sum: { deltaQty: true },
        })
      : [],
    getActiveReservations(tx, { lotIds, itemUnitIds: unitIds }),
  ]);

  if (reservations.length > 0) {
    throw new Error(
      `${input.purchaseLine.sku.code} ${input.purchaseLine.sku.name} 的库存已被销售单或代发履约占用，不能加入集运`
    );
  }

  const lotQuantity = lotLedgers.reduce(
    (sum, ledger) => sum.plus(new Decimal(ledger._sum.deltaQty?.toString() ?? "0")),
    new Decimal(0)
  );
  const available = lotQuantity.plus(units.length);
  if (available.lte(0)) {
    return new Decimal(0);
  }

  if (lotIds.length > 0) {
    const locked = await tx.inventoryLot.updateMany({
      where: { id: { in: lotIds }, status: "ACTIVE" },
      data: { status: "CONSOLIDATING" },
    });
    if (locked.count !== lotIds.length) {
      throw new Error(
        `${input.purchaseLine.sku.code} ${input.purchaseLine.sku.name} 库存状态已变化，请刷新后重试`
      );
    }
  }
  if (unitIds.length > 0) {
    const locked = await tx.itemUnit.updateMany({
      where: { id: { in: unitIds }, status: "AVAILABLE" },
      data: { status: "CONSOLIDATING" },
    });
    if (locked.count !== unitIds.length) {
      throw new Error(
        `${input.purchaseLine.sku.code} ${input.purchaseLine.sku.name} 单品状态已变化，请刷新后重试`
      );
    }
  }
  return available;
}

async function addPurchaseOrdersToBatch(batchId: string, purchaseOrderIds: string[]) {
  const ids = Array.from(new Set(purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) {
    return { success: 0, failed: 0, errors: [] } satisfies AddPurchaseOrdersResult;
  }

  const batch = await prisma.consolidationBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      storeId: true,
      status: true,
      fromLocationId: true,
      fromLocation: { select: { name: true } },
    },
  });
  if (!batch) throw new Error("集运批次不存在");
  if (batch.status !== "OPEN") throw new Error("只能加入未封箱的集运批次");
  if (!batch.fromLocationId) throw new Error("加入采购单前必须设置集运起运仓库");

  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const purchaseOrderId of ids) {
    let orderReference = purchaseOrderId;
    try {
      const order = await prisma.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, storeId: batch.storeId },
        include: {
          destinationLocation: { select: { name: true } },
          lines: {
            include: {
              sku: { select: { code: true, name: true } },
            },
          },
        },
      });
      if (!order) throw new Error("采购单不存在或不属于当前店铺");
      orderReference = order.orderNo;
      if (order.status !== "RECEIVED") {
        throw new Error("只有已确认到货的采购单可以加入集运");
      }
      if (order.lines.length === 0) throw new Error("采购单没有商品明细");
      if (!order.destinationLocationId) {
        throw new Error("采购单没有记录实际到货仓库");
      }
      if (order.destinationLocationId !== batch.fromLocationId) {
        throw new Error(
          `到货仓“${order.destinationLocation?.name ?? "未知仓库"}”与集运起点“${batch.fromLocation?.name ?? "未知仓库"}”不一致`
        );
      }

      const lineIds = order.lines.map((line) => line.id);
      const existingLines = await prisma.consolidationBatchLine.findMany({
        where: {
          sourceType: "PURCHASE_LINE",
          sourceId: { in: lineIds },
        },
        select: { sourceId: true },
      });
      if (existingLines.length > 0) {
        throw new Error("采购单已有明细加入过集运，不能重复加入");
      }

      const existingInventory = await prisma.$transaction((tx) =>
        resolvePurchaseLineInventory(tx, {
          storeId: batch.storeId,
          locationId: batch.fromLocationId!,
          purchaseLines: order.lines.map((line) => ({
            id: line.id,
            purchaseOrderId: order.id,
          })),
          lotStatuses: ["ACTIVE", "CONSOLIDATING"],
          unitStatuses: ["AVAILABLE", "CONSOLIDATING"],
        })
      );
      const missingMaterializedInventory = order.lines.some((line) => {
        const inventory = existingInventory.get(line.id);
        return !inventory || inventory.lots.length + inventory.units.length === 0;
      });
      if (missingMaterializedInventory) {
        await receivePurchaseOrder({
          purchaseOrderId: order.id,
          locationId: batch.fromLocationId,
          receivedAt: order.receivedAt ?? new Date(),
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "consolidation_batches" WHERE "id" = ${batch.id} FOR UPDATE`;
        const currentBatch = await tx.consolidationBatch.findUnique({
          where: { id: batch.id },
          select: { status: true },
        });
        if (currentBatch?.status !== "OPEN") {
          throw new Error("集运批次状态已变化，只能加入未封箱批次");
        }

        const duplicate = await tx.consolidationBatchLine.findFirst({
          where: {
            sourceType: "PURCHASE_LINE",
            sourceId: { in: lineIds },
          },
          select: { id: true },
        });
        if (duplicate) throw new Error("采购单已有明细加入过集运，不能重复加入");

        const inventoryByLine = await resolveAndLockPurchaseLineInventory(tx, {
          storeId: batch.storeId,
          locationId: batch.fromLocationId!,
          purchaseLines: order.lines.map((line) => ({
            id: line.id,
            purchaseOrderId: order.id,
            skuId: line.skuId,
          })),
          lotStatuses: ["ACTIVE"],
          unitStatuses: ["AVAILABLE"],
        });
        const movableLines: Array<{ sourceId: string; quantity: Decimal }> = [];
        for (const line of order.lines) {
          const quantity = await lockPurchaseLineInventory(tx, {
            storeId: batch.storeId,
            locationId: batch.fromLocationId!,
            purchaseOrderId: order.id,
            purchaseLine: line,
            inventory: inventoryByLine.get(line.id) ?? { lots: [], units: [] },
          });
          if (quantity.gt(0)) movableLines.push({ sourceId: line.id, quantity });
        }

        if (movableLines.length === 0) {
          throw new Error(
            "当前集运起点没有可加入的库存；请确认商品已收货、未被订单占用，并且仍在该位置"
          );
        }

        await tx.consolidationBatchLine.createMany({
          data: movableLines.map((line) => ({
            batchId: batch.id,
            sourceType: "PURCHASE_LINE",
            sourceId: line.sourceId,
            quantity: line.quantity,
          })),
        });
      });
      success += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${orderReference}: ${errorMessage(error)}`);
    }
  }

  revalidatePath("/logistics/consolidations");
  revalidatePath(`/logistics/consolidations/${batch.id}`);
  revalidatePath("/workbench");
  return { success, failed, errors } satisfies AddPurchaseOrdersResult;
}

export async function getConsolidationBatches(storeId: string) {
  const batches = await prisma.consolidationBatch.findMany({
    where: { storeId },
    include: {
      fromLocation: true,
      toLocation: true,
      lines: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const purchaseLineIds = batches.flatMap((batch) =>
    batch.lines.filter((line) => line.sourceType === "PURCHASE_LINE").map((line) => line.sourceId)
  );
  const lotIds = batches.flatMap((batch) =>
    batch.lines.filter((line) => line.sourceType === "LOT").map((line) => line.sourceId)
  );
  const itemUnitIds = batches.flatMap((batch) =>
    batch.lines.filter((line) => line.sourceType === "ITEM_UNIT").map((line) => line.sourceId)
  );
  const quickEntryIds = batches.flatMap((batch) =>
    batch.lines.filter((line) => line.sourceType === "QUICK_ENTRY").map((line) => line.sourceId)
  );
  const [purchaseLines, lots, itemUnits, quickEntries] = await Promise.all([
    prisma.purchaseLine.findMany({
      where: { id: { in: purchaseLineIds } },
      select: { id: true, sku: { select: { name: true } } },
    }),
    prisma.inventoryLot.findMany({
      where: { id: { in: lotIds } },
      select: { id: true, sku: { select: { name: true } } },
    }),
    prisma.itemUnit.findMany({
      where: { id: { in: itemUnitIds } },
      select: { id: true, sku: { select: { name: true } } },
    }),
    prisma.quickEntry.findMany({
      where: { id: { in: quickEntryIds } },
      select: { id: true, rawBrand: true, rawProductName: true, rawVariant: true },
    }),
  ]);
  const contentTitleBySource = new Map<string, string>();
  for (const line of purchaseLines) {
    contentTitleBySource.set(`PURCHASE_LINE:${line.id}`, line.sku.name);
  }
  for (const lot of lots) {
    contentTitleBySource.set(`LOT:${lot.id}`, lot.sku.name);
  }
  for (const unit of itemUnits) {
    contentTitleBySource.set(`ITEM_UNIT:${unit.id}`, unit.sku.name);
  }
  for (const entry of quickEntries) {
    contentTitleBySource.set(
      `QUICK_ENTRY:${entry.id}`,
      [entry.rawBrand, entry.rawProductName, entry.rawVariant].filter(Boolean).join(" ")
    );
  }

  return batches.map((batch) => ({
    ...batch,
    contentTitles: Array.from(
      new Set(
        batch.lines.flatMap((line) => {
          const title = contentTitleBySource.get(`${line.sourceType}:${line.sourceId}`)?.trim();
          return title ? [title] : [];
        })
      )
    ),
    totalQuantity: batch.lines
      .reduce((total, line) => total.plus(new Decimal(line.quantity.toString())), new Decimal(0))
      .toString(),
    lines: batch.lines.map((line) => ({
      ...line,
      quantity: line.quantity.toString(),
    })),
  }));
}

export async function getConsolidationBatchById(id: string) {
  const batch = await prisma.consolidationBatch.findUnique({
    where: { id },
    include: {
      fromLocation: true,
      toLocation: true,
      store: { select: { currency: true } },
      lines: true,
    },
  });
  if (!batch) return null;
  const shippingCost = await prisma.logisticsCost.findUnique({
    where: {
      storeId_sourceType_sourceId_feeType: {
        storeId: batch.storeId,
        sourceType: LOGISTICS_COST_SOURCE_TYPES.consolidation,
        sourceId: batch.id,
        feeType: "SHIPPING",
      },
    },
    select: { amount: true, currency: true },
  });

  const purchaseLineIds = batch.lines
    .filter((line) => line.sourceType === "PURCHASE_LINE")
    .map((line) => line.sourceId);
  const lotIds = batch.lines
    .filter((line) => line.sourceType === "LOT")
    .map((line) => line.sourceId);
  const itemUnitIds = batch.lines
    .filter((line) => line.sourceType === "ITEM_UNIT")
    .map((line) => line.sourceId);
  const [purchaseLines, lots, itemUnits] = await Promise.all([
    prisma.purchaseLine.findMany({
      where: { id: { in: purchaseLineIds } },
      select: {
        id: true,
        sku: { select: { code: true, name: true } },
        purchaseOrder: {
          select: {
            id: true,
            orderNo: true,
            destinationLocationId: true,
            destinationLocation: { select: { name: true } },
          },
        },
      },
    }),
    prisma.inventoryLot.findMany({
      where: { id: { in: lotIds } },
      select: { id: true, sku: { select: { code: true, name: true } } },
    }),
    prisma.itemUnit.findMany({
      where: { id: { in: itemUnitIds } },
      select: {
        id: true,
        unitCode: true,
        sku: { select: { code: true, name: true } },
      },
    }),
  ]);
  const originInventoryByPurchaseLine =
    batch.fromLocationId && purchaseLineIds.length > 0
      ? await prisma.$transaction((tx) =>
          resolvePurchaseLineInventory(tx, {
            storeId: batch.storeId,
            locationId: batch.fromLocationId!,
            purchaseLines: purchaseLines.map((line) => ({
              id: line.id,
              purchaseOrderId: line.purchaseOrder.id,
            })),
            lotStatuses: ["ACTIVE", "CONSOLIDATING"],
            unitStatuses: ["AVAILABLE", "CONSOLIDATING"],
          })
        )
      : new Map<string, PurchaseLineInventory>();
  const originPurchaseLots = Array.from(originInventoryByPurchaseLine.entries()).flatMap(
    ([purchaseLineId, inventory]) =>
      inventory.lots.map((lot) => ({ ...lot, sourceId: purchaseLineId }))
  );
  const originPurchaseUnits = Array.from(originInventoryByPurchaseLine.entries()).flatMap(
    ([purchaseLineId, inventory]) =>
      inventory.units.map((unit) => ({ ...unit, sourceId: purchaseLineId }))
  );
  const originLotQuantities =
    originPurchaseLots.length > 0
      ? await prisma.stockLedger.groupBy({
          by: ["entityId"],
          where: {
            entityType: "LOT",
            entityId: { in: originPurchaseLots.map((lot) => lot.id) },
          },
          _sum: { deltaQty: true },
        })
      : [];
  const originLotQuantityById = new Map(
    originLotQuantities.map((ledger) => [
      ledger.entityId,
      new Decimal(ledger._sum.deltaQty?.toString() ?? "0"),
    ])
  );
  const originQuantityByPurchaseLineId = new Map<string, Decimal>();
  for (const lot of originPurchaseLots) {
    originQuantityByPurchaseLineId.set(
      lot.sourceId,
      (originQuantityByPurchaseLineId.get(lot.sourceId) ?? new Decimal(0)).plus(
        Decimal.max(originLotQuantityById.get(lot.id) ?? new Decimal(0), 0)
      )
    );
  }
  for (const unit of originPurchaseUnits) {
    originQuantityByPurchaseLineId.set(
      unit.sourceId,
      (originQuantityByPurchaseLineId.get(unit.sourceId) ?? new Decimal(0)).plus(1)
    );
  }
  const purchaseLineById = new Map(purchaseLines.map((line) => [line.id, line]));
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const itemUnitById = new Map(itemUnits.map((unit) => [unit.id, unit]));

  return {
    ...batch,
    storeCurrency: batch.store.currency,
    shippingCost: shippingCost?.amount.toString() ?? null,
    shippingCurrency: shippingCost?.currency ?? batch.store.currency,
    lines: batch.lines.map((line) => {
      const purchaseLine = purchaseLineById.get(line.sourceId);
      const lot = lotById.get(line.sourceId);
      const itemUnit = itemUnitById.get(line.sourceId);
      const sku = purchaseLine?.sku ?? lot?.sku ?? itemUnit?.sku;
      const originQuantity = originQuantityByPurchaseLineId.get(line.sourceId) ?? new Decimal(0);
      const requiredQuantity = new Decimal(line.quantity.toString());
      const inventoryIssue =
        batch.status !== "RECEIVED" &&
        line.sourceType === "PURCHASE_LINE" &&
        originQuantity.lt(requiredQuantity)
          ? {
              code: "ORIGIN_STOCK_MISSING",
              currentLocationName:
                purchaseLine?.purchaseOrder.destinationLocation?.name ?? "未记录到货仓",
              expectedLocationName: batch.fromLocation?.name ?? "未设置起运仓",
              missingQuantity: requiredQuantity.minus(originQuantity).toString(),
            }
          : null;
      return {
        ...line,
        quantity: line.quantity.toString(),
        displayTitle: sku?.name ?? "未识别商品",
        skuCode: sku?.code ?? null,
        sourceReference:
          purchaseLine?.purchaseOrder.orderNo ?? itemUnit?.unitCode ?? line.sourceId.slice(0, 10),
        inventoryIssue,
      };
    }),
  };
}

export async function createConsolidationBatch(data: {
  storeId: string;
  fromLocationId?: string;
  toLocationId?: string;
  note?: string;
}) {
  const batch = await prisma.consolidationBatch.create({
    data: {
      storeId: data.storeId,
      fromLocationId: data.fromLocationId || null,
      toLocationId: data.toLocationId || null,
      note: data.note?.trim() || null,
    },
  });
  revalidatePath("/logistics/consolidations");
  return { id: batch.id };
}

export async function createConsolidationBatchAction(data: {
  storeId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  note?: string;
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const locationIds = [data.fromLocationId, data.toLocationId].filter((id): id is string =>
      Boolean(id)
    );
    if (locationIds.length > 0) {
      const validLocationCount = await prisma.location.count({
        where: {
          storeId: context.activeStoreId,
          id: { in: locationIds },
        },
      });
      if (validLocationCount !== new Set(locationIds).size) {
        throw new Error("所选仓库不存在或不属于当前店铺");
      }
    }
    if (data.fromLocationId && data.toLocationId && data.fromLocationId === data.toLocationId) {
      throw new Error("起运仓库和目的仓库不能相同");
    }
    const batch = await createConsolidationBatch({
      storeId: context.activeStoreId,
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      note: data.note,
    });
    return actionSuccess(batch);
  } catch (error) {
    return toActionFailure(error, "创建集运批次失败，请重试");
  }
}

export async function addPurchaseOrderToConsolidation(data: {
  batchId: string;
  purchaseOrderId: string;
}) {
  const result = await addPurchaseOrdersToBatch(data.batchId, [data.purchaseOrderId]);
  if (result.failed > 0) {
    throw new Error(result.errors[0]?.replace(/^[^:]+:\s*/, "") || "加入集运失败");
  }
  return result;
}

export async function addPurchaseOrdersToConsolidation(data: {
  batchId: string;
  purchaseOrderIds: string[];
}) {
  return addPurchaseOrdersToBatch(data.batchId, data.purchaseOrderIds);
}

export async function createConsolidationForPurchaseOrders(data: {
  storeId: string;
  purchaseOrderIds: string[];
  fromLocationId?: string;
  toLocationId?: string;
  note?: string;
}) {
  const ids = Array.from(new Set(data.purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) throw new Error("请选择要加入集运的采购单");
  if (!data.toLocationId) throw new Error("请选择集运目的仓库");

  const orders = await prisma.purchaseOrder.findMany({
    where: { id: { in: ids }, storeId: data.storeId },
    select: {
      id: true,
      orderNo: true,
      status: true,
      destinationLocationId: true,
      destinationLocation: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });
  if (orders.length !== ids.length) {
    throw new Error("部分采购单不存在或不属于当前店铺");
  }

  const invalidOrders = orders.filter(
    (order) =>
      order.status !== "RECEIVED" || !order.destinationLocationId || order._count.lines === 0
  );
  if (invalidOrders.length > 0) {
    throw new Error(
      `以下采购单尚未完成到货或没有商品明细：${invalidOrders.map((order) => order.orderNo).join("、")}`
    );
  }

  const arrivalLocationIds = new Set(
    orders.map((order) => order.destinationLocationId).filter((id): id is string => Boolean(id))
  );
  if (arrivalLocationIds.size !== 1) {
    const arrivalSummary = orders
      .map((order) => `${order.orderNo}（${order.destinationLocation?.name ?? "未记录到货仓"}）`)
      .join("、");
    throw new Error(`所选采购单不在同一个到货仓，不能合并集运：${arrivalSummary}`);
  }

  const actualArrivalLocationId = [...arrivalLocationIds][0];
  const fromLocationId = data.fromLocationId ?? actualArrivalLocationId;
  if (fromLocationId !== actualArrivalLocationId) {
    throw new Error("集运起运仓库必须与采购单实际到货仓库一致");
  }
  if (data.toLocationId === fromLocationId) {
    throw new Error("起运仓库和目的仓库不能相同");
  }

  const locationIds = [fromLocationId, data.toLocationId].filter((id): id is string => Boolean(id));
  const locationCount = await prisma.location.count({
    where: { storeId: data.storeId, id: { in: locationIds } },
  });
  if (locationCount !== new Set(locationIds).size) {
    throw new Error("所选仓库不存在或不属于当前店铺");
  }

  const batch = await createConsolidationBatch({
    storeId: data.storeId,
    fromLocationId,
    toLocationId: data.toLocationId,
    note: data.note,
  });
  const result = await addPurchaseOrdersToBatch(batch.id, ids);
  if (result.success === 0) {
    await prisma.consolidationBatch.delete({ where: { id: batch.id } });
    throw new Error(result.errors[0] ?? "没有采购单成功加入集运");
  }
  return { batchId: batch.id, ...result };
}

export async function updateConsolidationStatus(
  id: string,
  status: ConsolidationStatus,
  data?: {
    outboundTrackingNo?: string;
    carrier?: string;
    shippingCost?: string;
    shippingCurrency?: string;
  }
) {
  const batch = await prisma.consolidationBatch.findUnique({
    where: { id },
    include: { lines: true, store: { select: { currency: true } } },
  });
  if (!batch) {
    throw new Error("集运批次不存在");
  }
  assertConsolidationStatusTransition(batch.status, status);
  const shippingCost = normalizeLogisticsCostInput(
    { amount: data?.shippingCost, currency: data?.shippingCurrency },
    batch.store.currency
  );
  if (status === "SEALED") {
    if (!batch.fromLocationId) throw new Error("请先设置集运起运仓库");
    if (!batch.toLocationId) throw new Error("请先设置集运目的仓库");
    if (batch.fromLocationId === batch.toLocationId) {
      throw new Error("起运仓库和目的仓库不能相同");
    }
  }

  if (status === "SHIPPED" || status === "RECEIVED") {
    await prepareLegacyPurchaseInventoryForReceipt(batch);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "consolidation_batches" WHERE "id" = ${id} FOR UPDATE`;
    const freshBatch = await tx.consolidationBatch.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!freshBatch) throw new Error("集运批次不存在");
    assertConsolidationStatusTransition(freshBatch.status, status);
    if (status === "SHIPPED") {
      await lockConsolidationBatchInventory(tx, freshBatch);
      const validationErrors = await validateConsolidationInventory(tx, freshBatch);
      if (validationErrors.length > 0) {
        throw new Error(
          `集运库存预检未通过（${validationErrors.length} 项）：${validationErrors.join("；")}。集运状态未改变`
        );
      }
    }
    if (status === "RECEIVED") {
      await receiveConsolidationInventory(tx, freshBatch);
    }

    await tx.consolidationBatch.update({
      where: { id },
      data: {
        status,
        outboundTrackingNo: data?.outboundTrackingNo?.trim() || undefined,
        carrier: data?.carrier?.trim() || undefined,
        shippedAt: status === "SHIPPED" ? new Date() : undefined,
        receivedAt: status === "RECEIVED" ? new Date() : undefined,
      },
    });
    if (status === "SHIPPED" && shippingCost) {
      await saveLogisticsShippingCost(tx, {
        storeId: freshBatch.storeId,
        sourceType: LOGISTICS_COST_SOURCE_TYPES.consolidation,
        sourceId: freshBatch.id,
        amount: shippingCost.amount.toFixed(4),
        currency: shippingCost.currency,
        fallbackCurrency: batch.store.currency,
        occurredAt: new Date(),
        note: freshBatch.note ?? undefined,
      });
    }
  });
  revalidatePath("/logistics/consolidations");
  revalidatePath(`/logistics/consolidations/${id}`);
  revalidatePath("/workbench");
  if (status === "RECEIVED") {
    revalidatePath("/inventory/lots");
    revalidatePath("/inventory/items");
    revalidatePath("/inventory/sellable");
  }
}

export async function updateConsolidationDestination(id: string, toLocationId: string) {
  const batch = await prisma.consolidationBatch.findUnique({
    where: { id },
    select: {
      id: true,
      storeId: true,
      status: true,
      fromLocationId: true,
      toLocationId: true,
    },
  });
  if (!batch) throw new Error("集运批次不存在");
  if (!["OPEN", "SEALED"].includes(batch.status)) {
    throw new Error("集运批次发出后不能修改目的仓库");
  }
  if (!toLocationId) throw new Error("请选择集运目的仓库");
  if (batch.fromLocationId === toLocationId) {
    throw new Error("起运仓库和目的仓库不能相同");
  }
  const destination = await prisma.location.findFirst({
    where: { id: toLocationId, storeId: batch.storeId },
    select: { id: true, name: true },
  });
  if (!destination) throw new Error("目的仓库不存在或不属于当前店铺");

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "consolidation_batches" WHERE "id" = ${id} FOR UPDATE`;
    const freshBatch = await tx.consolidationBatch.findUnique({
      where: { id },
      select: { status: true, fromLocationId: true },
    });
    if (!freshBatch || !["OPEN", "SEALED"].includes(freshBatch.status)) {
      throw new Error("集运批次状态已变化，发出后不能修改目的仓库");
    }
    if (freshBatch.fromLocationId === destination.id) {
      throw new Error("起运仓库和目的仓库不能相同");
    }
    await tx.consolidationBatch.update({
      where: { id },
      data: { toLocationId: destination.id },
    });
  });
  revalidatePath(`/logistics/consolidations/${id}`);
  revalidatePath("/logistics/consolidations");
  revalidatePath("/workbench");
  return { id, toLocationId: destination.id, toLocationName: destination.name };
}

type ConsolidationForReceipt = {
  id: string;
  storeId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  lines: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    quantity: Decimal;
  }>;
};

async function lockConsolidationBatchInventory(
  tx: Prisma.TransactionClient,
  batch: ConsolidationForReceipt
) {
  const purchaseLineIds = batch.lines
    .filter((line) => line.sourceType === "PURCHASE_LINE")
    .map((line) => line.sourceId);
  const directLotIds = batch.lines
    .filter((line) => line.sourceType === "LOT")
    .map((line) => line.sourceId);
  const directItemUnitIds = batch.lines
    .filter((line) => line.sourceType === "ITEM_UNIT")
    .map((line) => line.sourceId);
  const [purchaseLines, directLots, directItemUnits] = await Promise.all([
    purchaseLineIds.length
      ? tx.purchaseLine.findMany({
          where: { id: { in: purchaseLineIds } },
          select: { id: true, purchaseOrderId: true, skuId: true },
        })
      : [],
    directLotIds.length
      ? tx.inventoryLot.findMany({
          where: { id: { in: directLotIds } },
          select: { id: true, skuId: true },
        })
      : [],
    directItemUnitIds.length
      ? tx.itemUnit.findMany({
          where: { id: { in: directItemUnitIds } },
          select: { id: true, skuId: true },
        })
      : [],
  ]);

  await lockConsolidationSkuRows(tx, [
    ...purchaseLines.map((line) => line.skuId),
    ...directLots.map((lot) => lot.skuId),
    ...directItemUnits.map((unit) => unit.skuId),
  ]);
  const purchaseInventory =
    batch.fromLocationId && purchaseLines.length > 0
      ? await resolvePurchaseLineInventory(tx, {
          storeId: batch.storeId,
          locationId: batch.fromLocationId,
          purchaseLines,
          lotStatuses: ["ACTIVE", "CONSOLIDATING"],
          unitStatuses: ["AVAILABLE", "CONSOLIDATING"],
        })
      : new Map<string, PurchaseLineInventory>();
  await lockConsolidationEntityRows(tx, {
    lotIds: [
      ...directLotIds,
      ...[...purchaseInventory.values()].flatMap((inventory) =>
        inventory.lots.map((lot) => lot.id)
      ),
    ],
    itemUnitIds: [
      ...directItemUnitIds,
      ...[...purchaseInventory.values()].flatMap((inventory) =>
        inventory.units.map((unit) => unit.id)
      ),
    ],
  });
}

async function prepareLegacyPurchaseInventoryForReceipt(batch: ConsolidationForReceipt) {
  if (!batch.fromLocationId) return;
  const purchaseBatchLines = batch.lines.filter((line) => line.sourceType === "PURCHASE_LINE");
  if (purchaseBatchLines.length === 0) return;

  const purchaseLines = await prisma.purchaseLine.findMany({
    where: { id: { in: purchaseBatchLines.map((line) => line.sourceId) } },
    select: {
      id: true,
      skuId: true,
      quantity: true,
      sku: { select: { code: true, name: true } },
      purchaseOrder: {
        select: {
          id: true,
          status: true,
          receivedAt: true,
          destinationLocationId: true,
        },
      },
    },
  });
  const eligibleOrders = new Map<string, { receivedAt: Date | null }>();
  for (const line of purchaseLines) {
    const order = line.purchaseOrder;
    if (order.status === "RECEIVED" && order.destinationLocationId === batch.fromLocationId) {
      eligibleOrders.set(order.id, { receivedAt: order.receivedAt });
    }
  }

  for (const [purchaseOrderId, order] of eligibleOrders) {
    await receivePurchaseOrder({
      purchaseOrderId,
      locationId: batch.fromLocationId,
      receivedAt: order.receivedAt ?? new Date(),
    });
  }

  const batchLineBySourceId = new Map(purchaseBatchLines.map((line) => [line.sourceId, line]));
  await prisma.$transaction(async (tx) => {
    const purchaseLineTargets = purchaseLines.map((line) => ({
      id: line.id,
      purchaseOrderId: line.purchaseOrder.id,
      skuId: line.skuId,
    }));
    await resolveAndLockPurchaseLineInventory(tx, {
      storeId: batch.storeId,
      locationId: batch.fromLocationId!,
      purchaseLines: purchaseLineTargets,
      lotStatuses: ["ACTIVE", "CONSOLIDATING"],
      unitStatuses: ["AVAILABLE", "CONSOLIDATING"],
    });
    const [lockedInventoryByLine, availableInventoryByLine] = await Promise.all([
      resolvePurchaseLineInventory(tx, {
        storeId: batch.storeId,
        locationId: batch.fromLocationId!,
        purchaseLines: purchaseLineTargets,
        lotStatuses: ["CONSOLIDATING"],
        unitStatuses: ["CONSOLIDATING"],
      }),
      resolvePurchaseLineInventory(tx, {
        storeId: batch.storeId,
        locationId: batch.fromLocationId!,
        purchaseLines: purchaseLineTargets,
        lotStatuses: ["ACTIVE"],
        unitStatuses: ["AVAILABLE"],
      }),
    ]);
    for (const line of purchaseLines) {
      if (!eligibleOrders.has(line.purchaseOrder.id)) continue;
      const batchLine = batchLineBySourceId.get(line.id);
      if (!batchLine || !new Decimal(batchLine.quantity.toString()).eq(line.quantity)) {
        continue;
      }
      const alreadyLocked = lockedInventoryByLine.get(line.id);
      if (alreadyLocked && alreadyLocked.lots.length + alreadyLocked.units.length > 0) continue;
      await lockPurchaseLineInventory(tx, {
        storeId: batch.storeId,
        locationId: batch.fromLocationId!,
        purchaseOrderId: line.purchaseOrder.id,
        purchaseLine: line,
        inventory: availableInventoryByLine.get(line.id) ?? { lots: [], units: [] },
      });
    }
  });
}

async function getLotAvailableQuantity(tx: Prisma.TransactionClient, lotId: string) {
  const aggregate = await tx.stockLedger.aggregate({
    where: { entityType: "LOT", entityId: lotId },
    _sum: { deltaQty: true },
  });
  return new Decimal(aggregate._sum.deltaQty?.toString() ?? "0");
}

async function transferLotQuantity(
  tx: Prisma.TransactionClient,
  input: {
    batch: ConsolidationForReceipt;
    batchLineId: string;
    lotId: string;
    quantity: Decimal;
  }
) {
  const lot = await tx.inventoryLot.findFirst({
    where: {
      id: input.lotId,
      storeId: input.batch.storeId,
      status: { in: ["ACTIVE", "CONSOLIDATING"] },
      ...(input.batch.fromLocationId ? { locationId: input.batch.fromLocationId } : {}),
    },
  });
  if (!lot) throw new Error("集运商品原库存不存在或已不在起运仓");

  const available = await getLotAvailableQuantity(tx, lot.id);
  if (input.quantity.lte(0) || input.quantity.gt(available)) {
    throw new Error(
      `集运数量超过可用库存（需要 ${input.quantity.toString()}，可用 ${available.toString()}）`
    );
  }

  const destination = await tx.inventoryLot.create({
    data: {
      storeId: lot.storeId,
      skuId: lot.skuId,
      locationId: input.batch.toLocationId!,
      unitCost: lot.unitCost,
      costCurrency: lot.costCurrency,
      fxRateId: lot.fxRateId,
      sourceType: "TRANSFER",
      sourceId: input.batchLineId,
      receivedAt: new Date(),
      batchLabel: lot.batchLabel,
      status: "ACTIVE",
    },
  });
  const transferMeta = {
    consolidationBatchId: input.batch.id,
    consolidationBatchLineId: input.batchLineId,
    sourceLotId: lot.id,
    destinationLotId: destination.id,
  };
  await tx.stockLedger.createMany({
    data: [
      {
        storeId: lot.storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: lot.locationId,
        deltaQty: input.quantity.negated().toFixed(4),
        reason: "TRANSFER_OUT",
        refType: "CONSOLIDATION_BATCH",
        refId: input.batch.id,
        meta: transferMeta,
      },
      {
        storeId: lot.storeId,
        entityType: "LOT",
        entityId: destination.id,
        locationId: input.batch.toLocationId!,
        deltaQty: input.quantity.toFixed(4),
        reason: "TRANSFER_IN",
        refType: "CONSOLIDATION_BATCH",
        refId: input.batch.id,
        meta: transferMeta,
      },
    ],
  });
  await tx.inventoryLot.update({
    where: { id: lot.id },
    data: {
      status: available.eq(input.quantity) ? "CONSUMED" : "ACTIVE",
    },
  });
}

async function transferItemUnit(
  tx: Prisma.TransactionClient,
  input: {
    batch: ConsolidationForReceipt;
    batchLineId: string;
    itemUnitId: string;
  }
) {
  const unit = await tx.itemUnit.findFirst({
    where: {
      id: input.itemUnitId,
      storeId: input.batch.storeId,
      status: { in: ["AVAILABLE", "CONSOLIDATING"] },
      ...(input.batch.fromLocationId ? { locationId: input.batch.fromLocationId } : {}),
    },
  });
  if (!unit) throw new Error("集运单品不存在、已占用或已不在起运仓");
  const fromLocationId = unit.locationId;
  await tx.itemUnit.update({
    where: { id: unit.id },
    data: {
      locationId: input.batch.toLocationId!,
      status: "AVAILABLE",
    },
  });
  const meta = {
    consolidationBatchId: input.batch.id,
    consolidationBatchLineId: input.batchLineId,
    itemUnitId: unit.id,
  };
  await tx.stockLedger.createMany({
    data: [
      {
        storeId: unit.storeId,
        entityType: "ITEM_UNIT",
        entityId: unit.id,
        locationId: fromLocationId,
        deltaQty: "-1.0000",
        reason: "TRANSFER_OUT",
        refType: "CONSOLIDATION_BATCH",
        refId: input.batch.id,
        meta,
      },
      {
        storeId: unit.storeId,
        entityType: "ITEM_UNIT",
        entityId: unit.id,
        locationId: input.batch.toLocationId!,
        deltaQty: "1.0000",
        reason: "TRANSFER_IN",
        refType: "CONSOLIDATION_BATCH",
        refId: input.batch.id,
        meta,
      },
    ],
  });
}

async function getActiveReservations(
  tx: Prisma.TransactionClient,
  input: { lotIds: string[]; itemUnitIds: string[] }
) {
  if (input.lotIds.length === 0 && input.itemUnitIds.length === 0) return [];
  const targets = [
    ...(input.lotIds.length ? [{ lotId: { in: input.lotIds } }] : []),
    ...(input.itemUnitIds.length ? [{ itemUnitId: { in: input.itemUnitIds } }] : []),
  ];
  const [orderReservations, fulfillmentReservations] = await Promise.all([
    tx.orderAllocation.findMany({
      where: {
        status: { in: [...RESERVING_ALLOCATION_STATUSES] },
        OR: targets,
      },
      select: { id: true },
    }),
    tx.fulfillmentInventoryAllocation.findMany({
      where: { status: "ALLOCATED", OR: targets },
      select: { id: true },
    }),
  ]);
  return [...orderReservations, ...fulfillmentReservations];
}

async function validateConsolidationInventory(
  tx: Prisma.TransactionClient,
  batch: ConsolidationForReceipt
) {
  const errors: string[] = [];
  if (batch.lines.length === 0) return errors;
  if (!batch.fromLocationId) {
    errors.push("未设置起运仓库");
  }
  if (!batch.toLocationId) {
    errors.push("未设置目的仓库");
  }
  if (batch.fromLocationId === batch.toLocationId) {
    errors.push("起运仓库和目的仓库不能相同");
  }
  if (errors.length > 0) return errors;

  const [source, destination, purchaseLines] = await Promise.all([
    tx.location.findFirst({
      where: { id: batch.fromLocationId!, storeId: batch.storeId },
      select: { id: true, name: true },
    }),
    tx.location.findFirst({
      where: { id: batch.toLocationId!, storeId: batch.storeId },
      select: { id: true },
    }),
    tx.purchaseLine.findMany({
      where: {
        id: {
          in: batch.lines
            .filter((line) => line.sourceType === "PURCHASE_LINE")
            .map((line) => line.sourceId),
        },
      },
      select: {
        id: true,
        sku: { select: { code: true, name: true } },
        purchaseOrder: {
          select: {
            id: true,
            orderNo: true,
            destinationLocationId: true,
            destinationLocation: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  if (!source) errors.push("起运仓库不存在或不属于当前店铺");
  if (!destination) errors.push("目的仓库不存在或不属于当前店铺");
  if (errors.length > 0) return errors;
  const sourceName = source?.name ?? "未知仓库";

  const purchaseLineById = new Map(purchaseLines.map((line) => [line.id, line]));
  const inventoryByPurchaseLine = await resolvePurchaseLineInventory(tx, {
    storeId: batch.storeId,
    locationId: batch.fromLocationId!,
    purchaseLines: purchaseLines.map((line) => ({
      id: line.id,
      purchaseOrderId: line.purchaseOrder.id,
    })),
    lotStatuses: ["ACTIVE", "CONSOLIDATING"],
    unitStatuses: ["AVAILABLE", "CONSOLIDATING"],
  });

  for (const line of batch.lines) {
    const required = new Decimal(line.quantity.toString());
    if (!required.isFinite() || required.lte(0)) {
      errors.push(`明细 ${line.id.slice(-6)}：集运数量必须大于 0`);
      continue;
    }

    if (line.sourceType === "LOT") {
      const lot = await tx.inventoryLot.findFirst({
        where: {
          id: line.sourceId,
          storeId: batch.storeId,
          locationId: batch.fromLocationId!,
          status: { in: ["ACTIVE", "CONSOLIDATING"] },
        },
        select: { id: true },
      });
      if (!lot) {
        errors.push(`库存批次 ${line.sourceId.slice(-6)}：不在起运仓或已不可用`);
        continue;
      }
      const [available, reservations] = await Promise.all([
        getLotAvailableQuantity(tx, lot.id),
        getActiveReservations(tx, { lotIds: [lot.id], itemUnitIds: [] }),
      ]);
      if (reservations.length > 0) {
        errors.push(`库存批次 ${line.sourceId.slice(-6)}：已被销售单或代发履约占用`);
      } else if (available.lt(required)) {
        errors.push(
          `库存批次 ${line.sourceId.slice(-6)}：需 ${required.toString()}，可转运 ${available.toString()}`
        );
      }
      continue;
    }

    if (line.sourceType === "ITEM_UNIT") {
      if (!required.eq(1)) {
        errors.push(`单品 ${line.sourceId.slice(-6)}：集运数量必须为 1`);
        continue;
      }
      const unit = await tx.itemUnit.findFirst({
        where: {
          id: line.sourceId,
          storeId: batch.storeId,
          locationId: batch.fromLocationId!,
          status: { in: ["AVAILABLE", "CONSOLIDATING"] },
        },
        select: { id: true },
      });
      if (!unit) {
        errors.push(`单品 ${line.sourceId.slice(-6)}：不在起运仓或已不可用`);
        continue;
      }
      const reservations = await getActiveReservations(tx, {
        lotIds: [],
        itemUnitIds: [unit.id],
      });
      if (reservations.length > 0) {
        errors.push(`单品 ${line.sourceId.slice(-6)}：已被销售单或代发履约占用`);
      }
      continue;
    }

    if (line.sourceType !== "PURCHASE_LINE") {
      errors.push(`明细 ${line.id.slice(-6)}：暂不支持来源 ${line.sourceType}`);
      continue;
    }

    const purchaseLine = purchaseLineById.get(line.sourceId);
    const label = purchaseLine
      ? `${purchaseLine.purchaseOrder.orderNo} / ${purchaseLine.sku.code} ${purchaseLine.sku.name}`
      : `采购明细 ${line.sourceId.slice(-6)}`;
    const { lots, units } = inventoryByPurchaseLine.get(line.sourceId) ?? {
      lots: [],
      units: [],
    };
    const lotIds = lots.map((lot) => lot.id);
    const itemUnitIds = units.map((unit) => unit.id);
    const [lotQuantities, reservations] = await Promise.all([
      Promise.all(lotIds.map((lotId) => getLotAvailableQuantity(tx, lotId))),
      getActiveReservations(tx, { lotIds, itemUnitIds }),
    ]);
    if (reservations.length > 0) {
      errors.push(`${label}：库存已被销售单或代发履约占用`);
      continue;
    }

    const lotQuantity = lotQuantities.reduce(
      (sum, quantity) => sum.plus(Decimal.max(quantity, 0)),
      new Decimal(0)
    );
    const available = lotQuantity.plus(units.length);
    if (available.lt(required)) {
      const locationMismatch =
        purchaseLine && purchaseLine.purchaseOrder.destinationLocationId !== batch.fromLocationId;
      const locationDetail = locationMismatch
        ? `采购单到货仓“${purchaseLine.purchaseOrder.destinationLocation?.name ?? "未记录"}”与集运起点“${sourceName}”不一致，`
        : "";
      errors.push(
        `${label}：${locationDetail}需 ${required.toString()}，起运仓可转运 ${available.toString()}，仍缺 ${required.minus(available).toString()} 件`
      );
      continue;
    }
    const unitRemainder = required.minus(Decimal.min(required, lotQuantity));
    if (!unitRemainder.isInteger() || unitRemainder.gt(units.length)) {
      errors.push(`${label}：单品库存无法满足小数数量的集运需求`);
    }
  }

  return errors;
}

async function receiveConsolidationInventory(
  tx: Prisma.TransactionClient,
  batch: ConsolidationForReceipt
) {
  if (batch.lines.length === 0) return;
  await lockConsolidationBatchInventory(tx, batch);
  const validationErrors = await validateConsolidationInventory(tx, batch);
  if (validationErrors.length > 0) {
    throw new Error(
      `集运库存预检未通过（${validationErrors.length} 项）：${validationErrors.join("；")}。集运状态未改变`
    );
  }

  const purchaseLineIds = batch.lines
    .filter((line) => line.sourceType === "PURCHASE_LINE")
    .map((line) => line.sourceId);
  const purchaseLines = purchaseLineIds.length
    ? await tx.purchaseLine.findMany({
        where: { id: { in: purchaseLineIds } },
        select: { id: true, purchaseOrderId: true },
      })
    : [];
  const inventoryByPurchaseLine = batch.fromLocationId
    ? await resolvePurchaseLineInventory(tx, {
        storeId: batch.storeId,
        locationId: batch.fromLocationId,
        purchaseLines,
        lotStatuses: ["ACTIVE", "CONSOLIDATING"],
        unitStatuses: ["AVAILABLE", "CONSOLIDATING"],
      })
    : new Map<string, PurchaseLineInventory>();

  for (const line of batch.lines) {
    let remaining = new Decimal(line.quantity.toString());
    if (!remaining.isFinite() || remaining.lte(0)) {
      throw new Error("集运商品数量必须大于 0");
    }

    if (line.sourceType === "LOT") {
      await transferLotQuantity(tx, {
        batch,
        batchLineId: line.id,
        lotId: line.sourceId,
        quantity: remaining,
      });
      continue;
    }
    if (line.sourceType === "ITEM_UNIT") {
      if (!remaining.eq(1)) throw new Error("单品集运数量必须为 1");
      await transferItemUnit(tx, {
        batch,
        batchLineId: line.id,
        itemUnitId: line.sourceId,
      });
      continue;
    }
    if (line.sourceType !== "PURCHASE_LINE") {
      throw new Error(`暂不支持的集运商品来源：${line.sourceType}`);
    }

    const currentInventory = inventoryByPurchaseLine.get(line.sourceId) ?? {
      lots: [],
      units: [],
    };
    const lots = currentInventory.lots.length
      ? await tx.inventoryLot.findMany({
          where: { id: { in: currentInventory.lots.map((lot) => lot.id) } },
          orderBy: { createdAt: "asc" },
        })
      : [];
    for (const lot of lots) {
      if (remaining.lte(0)) break;
      const available = await getLotAvailableQuantity(tx, lot.id);
      if (available.lte(0)) continue;
      const moving = Decimal.min(available, remaining);
      await transferLotQuantity(tx, {
        batch,
        batchLineId: line.id,
        lotId: lot.id,
        quantity: moving,
      });
      remaining = remaining.minus(moving);
    }

    if (remaining.gt(0)) {
      if (!remaining.isInteger()) {
        throw new Error("单品库存无法满足小数数量的集运需求");
      }
      const units = currentInventory.units.slice(0, remaining.toNumber());
      for (const unit of units) {
        await transferItemUnit(tx, {
          batch,
          batchLineId: line.id,
          itemUnitId: unit.id,
        });
        remaining = remaining.minus(1);
      }
    }

    if (!remaining.eq(0)) {
      throw new Error(`采购明细库存不足，仍缺 ${remaining.toString()} 件，集运状态未改变`);
    }
  }
}

export async function repairConsolidationOriginInventory(id: string) {
  const batch = await prisma.consolidationBatch.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!batch) throw new Error("集运批次不存在");
  if (batch.status === "RECEIVED") throw new Error("已到货的集运批次不能再补记转仓");
  if (!batch.fromLocationId) throw new Error("集运批次未设置起运仓库");
  const originLocationId = batch.fromLocationId;

  const purchaseLineIds = batch.lines
    .filter((line) => line.sourceType === "PURCHASE_LINE")
    .map((line) => line.sourceId);
  if (purchaseLineIds.length === 0) {
    throw new Error("当前批次没有可补记转仓的采购商品");
  }

  const purchaseLines = await prisma.purchaseLine.findMany({
    where: { id: { in: purchaseLineIds } },
    select: {
      id: true,
      skuId: true,
      purchaseOrder: {
        select: {
          id: true,
          orderNo: true,
          status: true,
          receivedAt: true,
          destinationLocationId: true,
          destinationLocation: { select: { name: true } },
        },
      },
      sku: { select: { code: true, name: true } },
    },
  });
  const purchaseLineById = new Map(purchaseLines.map((line) => [line.id, line]));
  const purchaseOrders = new Map(
    purchaseLines.map((line) => [line.purchaseOrder.id, line.purchaseOrder])
  );

  for (const order of purchaseOrders.values()) {
    if (order.status !== "RECEIVED") {
      throw new Error(`采购单 ${order.orderNo} 尚未确认到货，不能补记转仓`);
    }
    if (!order.destinationLocationId) {
      throw new Error(`采购单 ${order.orderNo} 未记录实际到货仓，不能补记转仓`);
    }
    await receivePurchaseOrder({
      purchaseOrderId: order.id,
      locationId: order.destinationLocationId,
      receivedAt: order.receivedAt ?? new Date(),
    });
  }

  let repairedLines = 0;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "consolidation_batches" WHERE "id" = ${batch.id} FOR UPDATE`;
    const currentBatch = await tx.consolidationBatch.findUnique({
      where: { id: batch.id },
      include: { lines: true },
    });
    if (!currentBatch || currentBatch.status === "RECEIVED") {
      throw new Error("集运批次状态已变化，请刷新后重试");
    }

    const currentPurchaseBatchLines = currentBatch.lines.filter(
      (line) => line.sourceType === "PURCHASE_LINE"
    );
    const currentPurchaseLineIds = currentPurchaseBatchLines.map((line) => line.sourceId);
    const [candidateLots, candidateUnits] = await Promise.all([
      tx.inventoryLot.findMany({
        where: {
          storeId: currentBatch.storeId,
          sourceType: "PURCHASE",
          sourceId: { in: currentPurchaseLineIds },
          status: { in: ["ACTIVE", "CONSOLIDATING"] },
        },
        select: { id: true, skuId: true },
      }),
      tx.itemUnit.findMany({
        where: {
          storeId: currentBatch.storeId,
          sourceType: "PURCHASE",
          sourceId: { in: currentPurchaseLineIds },
          status: { in: ["AVAILABLE", "CONSOLIDATING"] },
        },
        select: { id: true, skuId: true },
      }),
    ]);
    await lockConsolidationSkuRows(tx, [
      ...currentPurchaseLineIds.map((lineId) => purchaseLineById.get(lineId)?.skuId),
      ...candidateLots.map((lot) => lot.skuId),
      ...candidateUnits.map((unit) => unit.skuId),
    ]);
    await lockConsolidationEntityRows(tx, {
      lotIds: candidateLots.map((lot) => lot.id),
      itemUnitIds: candidateUnits.map((unit) => unit.id),
    });
    const [freshLots, freshUnits] = await Promise.all([
      tx.inventoryLot.findMany({
        where: {
          id: { in: candidateLots.map((lot) => lot.id) },
          storeId: currentBatch.storeId,
          sourceType: "PURCHASE",
          sourceId: { in: currentPurchaseLineIds },
          status: { in: ["ACTIVE", "CONSOLIDATING"] },
        },
        orderBy: { createdAt: "asc" },
      }),
      tx.itemUnit.findMany({
        where: {
          id: { in: candidateUnits.map((unit) => unit.id) },
          storeId: currentBatch.storeId,
          sourceType: "PURCHASE",
          sourceId: { in: currentPurchaseLineIds },
          status: { in: ["AVAILABLE", "CONSOLIDATING"] },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const lotsByPurchaseLineId = new Map<string, typeof freshLots>();
    for (const lot of freshLots) {
      const values = lotsByPurchaseLineId.get(lot.sourceId) ?? [];
      values.push(lot);
      lotsByPurchaseLineId.set(lot.sourceId, values);
    }
    const unitsByPurchaseLineId = new Map<string, typeof freshUnits>();
    for (const unit of freshUnits) {
      const values = unitsByPurchaseLineId.get(unit.sourceId) ?? [];
      values.push(unit);
      unitsByPurchaseLineId.set(unit.sourceId, values);
    }

    for (const line of currentPurchaseBatchLines) {
      if (line.sourceType !== "PURCHASE_LINE") continue;
      const purchaseLine = purchaseLineById.get(line.sourceId);
      if (!purchaseLine) {
        throw new Error(`采购明细 ${line.sourceId.slice(-6)} 不存在`);
      }
      const required = new Decimal(line.quantity.toString());
      if (!required.isFinite() || required.lte(0)) {
        throw new Error(`${purchaseLine.sku.code} ${purchaseLine.sku.name} 的集运数量无效`);
      }

      const lots = lotsByPurchaseLineId.get(line.sourceId) ?? [];
      const units = unitsByPurchaseLineId.get(line.sourceId) ?? [];
      const lotQuantities = new Map<string, Decimal>();
      for (const lot of lots) {
        lotQuantities.set(lot.id, Decimal.max(await getLotAvailableQuantity(tx, lot.id), 0));
      }
      const reservations = await getActiveReservations(tx, {
        lotIds: lots.map((lot) => lot.id),
        itemUnitIds: units.map((unit) => unit.id),
      });
      if (reservations.length > 0) {
        throw new Error(
          `${purchaseLine.sku.code} ${purchaseLine.sku.name} 的库存已被销售单或代发履约占用，不能补记转仓`
        );
      }

      const originLots = lots.filter((lot) => lot.locationId === originLocationId);
      const originUnits = units.filter((unit) => unit.locationId === originLocationId);
      const originQuantity = originLots
        .reduce((sum, lot) => sum.plus(lotQuantities.get(lot.id) ?? new Decimal(0)), new Decimal(0))
        .plus(originUnits.length);
      let remaining = required.minus(originQuantity);
      if (remaining.lte(0)) {
        await Promise.all([
          tx.inventoryLot.updateMany({
            where: { id: { in: originLots.map((lot) => lot.id) } },
            data: { status: "CONSOLIDATING" },
          }),
          tx.itemUnit.updateMany({
            where: { id: { in: originUnits.map((unit) => unit.id) } },
            data: { status: "CONSOLIDATING" },
          }),
        ]);
        continue;
      }

      const offOriginLots = lots.filter((lot) => lot.locationId !== originLocationId);
      const offOriginUnits = units.filter((unit) => unit.locationId !== originLocationId);
      const offOriginQuantity = offOriginLots
        .reduce((sum, lot) => sum.plus(lotQuantities.get(lot.id) ?? new Decimal(0)), new Decimal(0))
        .plus(offOriginUnits.length);
      if (offOriginQuantity.lt(remaining)) {
        throw new Error(
          `${purchaseLine.purchaseOrder.orderNo} / ${purchaseLine.sku.code}：可补记库存 ${offOriginQuantity.toString()}，仍缺 ${remaining.minus(offOriginQuantity).toString()} 件`
        );
      }

      for (const lot of offOriginLots) {
        if (remaining.lte(0)) break;
        const quantity = lotQuantities.get(lot.id) ?? new Decimal(0);
        if (quantity.lte(0)) continue;
        if (quantity.gt(remaining)) {
          throw new Error(
            `${purchaseLine.sku.code} ${purchaseLine.sku.name} 需要先拆分库存批次后再补记转仓`
          );
        }
        const fromLocationId = lot.locationId;
        const meta = {
          correctionType: "CONSOLIDATION_ORIGIN_REPAIR",
          consolidationBatchId: batch.id,
          consolidationBatchLineId: line.id,
          purchaseLineId: line.sourceId,
          sourceLocationId: fromLocationId,
          destinationLocationId: originLocationId,
        };
        await tx.stockLedger.createMany({
          data: [
            {
              storeId: batch.storeId,
              entityType: "LOT",
              entityId: lot.id,
              locationId: fromLocationId,
              deltaQty: quantity.negated().toFixed(4),
              reason: "TRANSFER_OUT",
              refType: "CONSOLIDATION_ORIGIN_REPAIR",
              refId: batch.id,
              meta,
            },
            {
              storeId: batch.storeId,
              entityType: "LOT",
              entityId: lot.id,
              locationId: originLocationId,
              deltaQty: quantity.toFixed(4),
              reason: "TRANSFER_IN",
              refType: "CONSOLIDATION_ORIGIN_REPAIR",
              refId: batch.id,
              meta,
            },
          ],
        });
        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { locationId: originLocationId, status: "CONSOLIDATING" },
        });
        remaining = remaining.minus(quantity);
      }

      if (remaining.gt(0)) {
        if (!remaining.isInteger()) {
          throw new Error(
            `${purchaseLine.sku.code} ${purchaseLine.sku.name} 的单品库存无法补足小数数量`
          );
        }
        for (const unit of offOriginUnits.slice(0, remaining.toNumber())) {
          const fromLocationId = unit.locationId;
          const meta = {
            correctionType: "CONSOLIDATION_ORIGIN_REPAIR",
            consolidationBatchId: batch.id,
            consolidationBatchLineId: line.id,
            purchaseLineId: line.sourceId,
            itemUnitId: unit.id,
            sourceLocationId: fromLocationId,
            destinationLocationId: originLocationId,
          };
          await tx.stockLedger.createMany({
            data: [
              {
                storeId: batch.storeId,
                entityType: "ITEM_UNIT",
                entityId: unit.id,
                locationId: fromLocationId,
                deltaQty: "-1.0000",
                reason: "TRANSFER_OUT",
                refType: "CONSOLIDATION_ORIGIN_REPAIR",
                refId: batch.id,
                meta,
              },
              {
                storeId: batch.storeId,
                entityType: "ITEM_UNIT",
                entityId: unit.id,
                locationId: originLocationId,
                deltaQty: "1.0000",
                reason: "TRANSFER_IN",
                refType: "CONSOLIDATION_ORIGIN_REPAIR",
                refId: batch.id,
                meta,
              },
            ],
          });
          await tx.itemUnit.update({
            where: { id: unit.id },
            data: { locationId: originLocationId, status: "CONSOLIDATING" },
          });
          remaining = remaining.minus(1);
        }
      }

      if (!remaining.eq(0)) {
        throw new Error(
          `${purchaseLine.purchaseOrder.orderNo} / ${purchaseLine.sku.code}：补记转仓后仍缺 ${remaining.toString()} 件`
        );
      }
      repairedLines += 1;
    }
  });

  revalidatePath(`/logistics/consolidations/${id}`);
  revalidatePath("/logistics/consolidations");
  revalidatePath("/workbench");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  return { id, repairedLines };
}

export async function repairConsolidationOriginInventoryAction(id: string) {
  try {
    const batch = await prisma.consolidationBatch.findUnique({
      where: { id },
      select: { storeId: true },
    });
    if (!batch) throw new Error("集运批次不存在");
    await requireUserContext({ storeId: batch.storeId });
    const result = await repairConsolidationOriginInventory(id);
    return actionSuccess(result);
  } catch (error) {
    return toActionFailure(error, "补记转仓失败，请重试");
  }
}

export async function updateConsolidationStatusAction(
  id: string,
  status: ConsolidationStatus,
  data?: {
    outboundTrackingNo?: string;
    carrier?: string;
    shippingCost?: string;
    shippingCurrency?: string;
  }
) {
  try {
    await updateConsolidationStatus(id, status, data);
    return actionSuccess({ id, status });
  } catch (error) {
    return toActionFailure(error, "更新集运状态失败，请重试");
  }
}

export async function updateConsolidationDestinationAction(id: string, toLocationId: string) {
  try {
    const batch = await prisma.consolidationBatch.findUnique({
      where: { id },
      select: { storeId: true },
    });
    if (!batch) throw new Error("集运批次不存在");
    await requireUserContext({ storeId: batch.storeId });
    const result = await updateConsolidationDestination(id, toLocationId);
    return actionSuccess(result);
  } catch (error) {
    return toActionFailure(error, "保存目的仓库失败，请重试");
  }
}
