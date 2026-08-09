"use server";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import {
  aggregateKey,
  allocateStocktakeDelta,
  computeWeightedAvgCost,
  roundBookQty,
  type LotBreakdown,
} from "@/lib/application/stocktake-allocation";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { dispatchInventoryTransfer } from "@/app/actions/logistics";

export interface SkuLocationLotBreakdown {
  lotId: string;
  bookQty: number;
  unitCost: string;
}

export interface SkuLocationStocktakeRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  currency: string;
  bookQty: number;
  bookUnitCost: string;
  lotIds: string[];
  lotBreakdown: SkuLocationLotBreakdown[];
}

export interface TransferableInventoryRow {
  key: string;
  entityType: "LOT" | "ITEM_UNIT";
  itemUnitId?: string;
  unitCode?: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  currency: string;
  bookQty: number;
  bookUnitCost: string;
}

export interface ListSkuLocationStocktakeInput {
  storeId: string;
  locationId?: string;
  q?: string;
}

function buildAggregatedRows(
  lots: Array<{
    id: string;
    skuId: string;
    locationId: string;
    unitCost: { toString(): string };
    costCurrency: string;
    receivedAt: Date;
    sku: { code: string; name: string };
    location: { code: string; name: string };
  }>,
  qtyByLotId: Map<string, Decimal>
): SkuLocationStocktakeRow[] {
  const groups = new Map<
    string,
    {
      skuId: string;
      skuCode: string;
      skuName: string;
      locationId: string;
      locationCode: string;
      locationName: string;
      currency: string;
      lotBreakdown: LotBreakdown[];
    }
  >();

  for (const lot of lots) {
    const key = aggregateKey(lot.skuId, lot.locationId);
    const bookQty = roundBookQty(qtyByLotId.get(lot.id) ?? new Decimal(0));
    const entry = groups.get(key) ?? {
      skuId: lot.skuId,
      skuCode: lot.sku.code,
      skuName: lot.sku.name,
      locationId: lot.locationId,
      locationCode: lot.location.code,
      locationName: lot.location.name,
      currency: lot.costCurrency,
      lotBreakdown: [],
    };

    entry.lotBreakdown.push({
      lotId: lot.id,
      bookQty,
      unitCost: lot.unitCost.toString(),
      receivedAt: lot.receivedAt,
    });
    groups.set(key, entry);
  }

  return Array.from(groups.values()).map((group) => {
    const bookQty = group.lotBreakdown.reduce((sum, lot) => sum + lot.bookQty, 0);
    return {
      skuId: group.skuId,
      skuCode: group.skuCode,
      skuName: group.skuName,
      locationId: group.locationId,
      locationCode: group.locationCode,
      locationName: group.locationName,
      currency: group.currency,
      bookQty,
      bookUnitCost: computeWeightedAvgCost(group.lotBreakdown),
      lotIds: group.lotBreakdown.map((lot) => lot.lotId),
      lotBreakdown: group.lotBreakdown.map((lot) => ({
        lotId: lot.lotId,
        bookQty: lot.bookQty,
        unitCost: lot.unitCost,
      })),
    } satisfies SkuLocationStocktakeRow;
  });
}

export async function listSkuLocationStocktakeRows(
  input: ListSkuLocationStocktakeInput
): Promise<SkuLocationStocktakeRow[]> {
  const keyword = input.q?.trim();
  const lots = await prisma.inventoryLot.findMany({
    where: {
      storeId: input.storeId,
      status: "ACTIVE",
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(keyword
        ? {
            OR: [
              { sku: { code: { contains: keyword, mode: "insensitive" } } },
              { sku: { name: { contains: keyword, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      sku: true,
      location: true,
    },
    orderBy: [{ receivedAt: "desc" }],
  });

  if (lots.length === 0) return [];

  const lotIds = lots.map((lot) => lot.id);
  const aggregates = await prisma.stockLedger.groupBy({
    by: ["entityId"],
    where: {
      storeId: input.storeId,
      entityType: "LOT",
      entityId: { in: lotIds },
    },
    _sum: { deltaQty: true },
  });

  const qtyByLotId = new Map(
    aggregates.map((item) => [item.entityId, new Decimal(item._sum.deltaQty?.toString() ?? "0")])
  );

  return buildAggregatedRows(lots, qtyByLotId).sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

export async function listTransferableInventoryRows(
  input: ListSkuLocationStocktakeInput
): Promise<TransferableInventoryRow[]> {
  const keyword = input.q?.trim();
  const [lotRows, units] = await Promise.all([
    listSkuLocationStocktakeRows(input),
    prisma.itemUnit.findMany({
      where: {
        storeId: input.storeId,
        status: "AVAILABLE",
        ...(input.locationId ? { locationId: input.locationId } : {}),
        allocations: { none: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } } },
        ...(keyword
          ? {
              OR: [
                { unitCode: { contains: keyword, mode: "insensitive" } },
                { sku: { code: { contains: keyword, mode: "insensitive" } } },
                { sku: { name: { contains: keyword, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: { sku: true, location: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const rows: TransferableInventoryRow[] = [
    ...lotRows
      .filter((row) => row.bookQty > 0)
      .map((row) => ({
        key: `LOT:${row.skuId}:${row.locationId}`,
        entityType: "LOT" as const,
        skuId: row.skuId,
        skuCode: row.skuCode,
        skuName: row.skuName,
        locationId: row.locationId,
        locationCode: row.locationCode,
        locationName: row.locationName,
        currency: row.currency,
        bookQty: row.bookQty,
        bookUnitCost: row.bookUnitCost,
      })),
    ...units.map((unit) => ({
      key: `ITEM_UNIT:${unit.id}`,
      entityType: "ITEM_UNIT" as const,
      itemUnitId: unit.id,
      unitCode: unit.unitCode ?? unit.id.slice(-8),
      skuId: unit.skuId,
      skuCode: unit.sku.code,
      skuName: unit.sku.name,
      locationId: unit.locationId,
      locationCode: unit.location.code,
      locationName: unit.location.name,
      currency: unit.costCurrency,
      bookQty: 1,
      bookUnitCost: unit.unitCost.toString(),
    })),
  ];
  return rows.sort((a, b) =>
    `${a.skuCode}:${a.unitCode ?? ""}`.localeCompare(`${b.skuCode}:${b.unitCode ?? ""}`)
  );
}

export interface SubmitSkuLocationStocktakeItem {
  skuId: string;
  locationId: string;
  countedQty: number;
  countedUnitCost?: string;
  notes?: string;
}

export interface SubmitSkuLocationStocktakeInput {
  storeId: string;
  operator?: string;
  items: SubmitSkuLocationStocktakeItem[];
}

function assertIntegerQty(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label}必须是非负整数`);
  }
}

function assertPositiveIntegerQty(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}必须是正整数`);
  }
}

function revalidateInventoryMaintenancePaths(lotIds: string[] = []) {
  revalidatePath("/inventory/stocktake");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/sellable");
  for (const lotId of lotIds) {
    revalidatePath(`/inventory/lots/${lotId}`);
  }
}

export async function submitSkuLocationStocktakeAdjustments(
  input: SubmitSkuLocationStocktakeInput
) {
  if (input.items.length === 0) {
    throw new Error("请至少提交一条库存调整");
  }

  const dedupedItems = Array.from(
    new Map(input.items.map((item) => [aggregateKey(item.skuId, item.locationId), item])).values()
  );

  for (const item of dedupedItems) {
    assertIntegerQty(item.countedQty, "调整后数量");
  }

  const result = await prisma.$transaction(async (tx) => {
    const written: Array<{ lotId: string; deltaQty: number; skuId: string; locationId: string }> =
      [];

    for (const item of dedupedItems) {
      const lots = await tx.inventoryLot.findMany({
        where: {
          storeId: input.storeId,
          skuId: item.skuId,
          locationId: item.locationId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          skuId: true,
          locationId: true,
          unitCost: true,
          costCurrency: true,
          receivedAt: true,
        },
        orderBy: { receivedAt: "asc" },
      });

      if (lots.length === 0) {
        throw new Error("找不到可调整的入库批次，请刷新后重试");
      }

      const lotIds = lots.map((lot) => lot.id);
      const ledgers = await tx.stockLedger.findMany({
        where: {
          storeId: input.storeId,
          entityType: "LOT",
          entityId: { in: lotIds },
        },
        select: {
          entityId: true,
          deltaQty: true,
        },
      });

      const qtyByLotId = new Map<string, Decimal>();
      for (const ledger of ledgers) {
        const current = qtyByLotId.get(ledger.entityId) ?? new Decimal(0);
        qtyByLotId.set(ledger.entityId, current.plus(ledger.deltaQty.toString()));
      }

      const lotBreakdown: LotBreakdown[] = lots.map((lot) => ({
        lotId: lot.id,
        bookQty: roundBookQty(qtyByLotId.get(lot.id) ?? new Decimal(0)),
        unitCost: lot.unitCost.toString(),
        receivedAt: lot.receivedAt,
      }));

      const bookQty = lotBreakdown.reduce((sum, lot) => sum + lot.bookQty, 0);
      const delta = item.countedQty - bookQty;
      if (delta === 0) continue;

      const countedUnitCost = item.countedUnitCost?.trim()
        ? new Decimal(item.countedUnitCost)
        : new Decimal(computeWeightedAvgCost(lotBreakdown));

      if (!countedUnitCost.isFinite() || countedUnitCost.lt(0)) {
        throw new Error("调整单价必须大于等于 0");
      }

      const allocations = allocateStocktakeDelta(lotBreakdown, delta);
      const lotMap = new Map(lots.map((lot) => [lot.id, lot]));
      const key = aggregateKey(item.skuId, item.locationId);

      for (const allocation of allocations) {
        const lot = lotMap.get(allocation.lotId);
        if (!lot) continue;

        const lotBookQty =
          lotBreakdown.find((entry) => entry.lotId === allocation.lotId)?.bookQty ?? 0;

        await tx.stockLedger.create({
          data: {
            storeId: input.storeId,
            occurredAt: new Date(),
            entityType: "LOT",
            entityId: allocation.lotId,
            locationId: lot.locationId,
            deltaQty: allocation.deltaQty.toFixed(4),
            reason: "ADJUST",
            refType: "STOCKTAKE",
            refId: key,
            meta: {
              aggregateKey: key,
              skuId: item.skuId,
              locationId: item.locationId,
              bookQty,
              bookUnitCost: computeWeightedAvgCost(lotBreakdown),
              countedQty: item.countedQty,
              countedUnitCost: countedUnitCost.toFixed(2),
              diffQty: delta,
              lotBookQty,
              lotDeltaQty: allocation.deltaQty,
              notes: item.notes?.trim() || null,
              operator: input.operator?.trim() || null,
              source: "SKU_LOCATION_STOCKTAKE",
            },
          },
        });

        written.push({
          lotId: allocation.lotId,
          deltaQty: allocation.deltaQty,
          skuId: item.skuId,
          locationId: item.locationId,
        });
      }
    }

    return written;
  });

  revalidateInventoryMaintenancePaths(result.map((item) => item.lotId));

  return result;
}

export async function submitSkuLocationStocktakeAdjustmentsAction(
  input: SubmitSkuLocationStocktakeInput
) {
  try {
    const context = await requireUserContext({ storeId: input.storeId });
    const adjustments = await submitSkuLocationStocktakeAdjustments({
      ...input,
      operator: context.userId,
    });
    return actionSuccess({ adjustments });
  } catch (error) {
    return toActionFailure(error, "保存库存调整失败，请稍后重试");
  }
}

const INVENTORY_ENTRY_REASONS = [
  "MISSED_ENTRY",
  "STOCK_GAIN",
  "HISTORICAL_BACKFILL",
  "OTHER",
] as const;

export type InventoryEntryReason = (typeof INVENTORY_ENTRY_REASONS)[number];

export interface RecordOtherLocationStockInput {
  storeId: string;
  skuId: string;
  locationId: string;
  quantity: number;
  unitCost: string;
  currency: string;
  reason: InventoryEntryReason;
  notes?: string;
  operator?: string;
}

export async function recordOtherLocationStock(input: RecordOtherLocationStockInput) {
  assertPositiveIntegerQty(input.quantity, "录入数量");
  if (!INVENTORY_ENTRY_REASONS.includes(input.reason)) {
    throw new Error("请选择有效的录入原因");
  }

  const unitCost = new Decimal(input.unitCost.trim());
  if (!unitCost.isFinite() || unitCost.lt(0)) {
    throw new Error("单位成本必须大于等于 0");
  }

  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("币种必须是 3 位字母代码");
  }

  await assertOperationalSku(prisma, {
    storeId: input.storeId,
    skuId: input.skuId,
    actionLabel: "录入库存",
  });

  const operationId = randomUUID();
  const occurredAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const [sku, location, existingLot] = await Promise.all([
      tx.sKU.findFirst({
        where: { id: input.skuId, storeId: input.storeId },
        select: { id: true, code: true },
      }),
      tx.location.findFirst({
        where: { id: input.locationId, storeId: input.storeId },
        select: { id: true, code: true },
      }),
      tx.inventoryLot.findFirst({
        where: {
          storeId: input.storeId,
          skuId: input.skuId,
          locationId: input.locationId,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
    ]);

    if (!sku) throw new Error("SKU 不存在或不属于当前店铺");
    if (!location) throw new Error("仓位不存在或不属于当前店铺");
    if (existingLot) {
      throw new Error("该 SKU 在目标仓位已有库存，请直接在表格中调整数量");
    }

    const lot = await tx.inventoryLot.create({
      data: {
        storeId: input.storeId,
        skuId: input.skuId,
        locationId: input.locationId,
        unitCost: unitCost.toFixed(4),
        costCurrency: currency,
        sourceType: "ADJUSTMENT",
        sourceId: operationId,
        receivedAt: occurredAt,
        batchLabel: `ADJ-${occurredAt.toISOString().slice(0, 10).replaceAll("-", "")}`,
        status: "ACTIVE",
      },
    });

    await tx.stockLedger.create({
      data: {
        storeId: input.storeId,
        occurredAt,
        entityType: "LOT",
        entityId: lot.id,
        locationId: input.locationId,
        deltaQty: new Decimal(input.quantity).toFixed(4),
        reason: "ADJUST",
        refType: "STOCK_ADJUSTMENT",
        refId: operationId,
        meta: {
          operationId,
          skuId: input.skuId,
          skuCode: sku.code,
          locationId: input.locationId,
          locationCode: location.code,
          quantity: input.quantity,
          unitCost: unitCost.toFixed(4),
          currency,
          entryReason: input.reason,
          notes: input.notes?.trim() || null,
          operator: input.operator?.trim() || null,
          source: "OTHER_LOCATION_STOCK_ENTRY",
        },
      },
    });

    return {
      operationId,
      lotId: lot.id,
      skuId: input.skuId,
      locationId: input.locationId,
      quantity: input.quantity,
    };
  });

  revalidateInventoryMaintenancePaths([result.lotId]);
  return result;
}

export async function recordOtherLocationStockAction(
  input: Omit<RecordOtherLocationStockInput, "operator">
) {
  try {
    const context = await requireUserContext({ storeId: input.storeId });
    const entry = await recordOtherLocationStock({
      ...input,
      operator: context.userId,
    });
    return actionSuccess({ entry });
  } catch (error) {
    return toActionFailure(error, "录入其他仓库库存失败，请稍后重试");
  }
}

export interface TransferSkuLocationStockInput {
  storeId: string;
  skuId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  itemUnitId?: string;
  notes?: string;
  operator?: string;
}

interface TransferableLot {
  id: string;
  skuId: string;
  locationId: string;
  unitCost: Prisma.Decimal;
  costCurrency: string;
  fxRateId: string | null;
  receivedAt: Date;
  batchLabel: string | null;
}

async function getTransferableLots(
  tx: Prisma.TransactionClient,
  input: Pick<TransferSkuLocationStockInput, "storeId" | "skuId" | "fromLocationId">
) {
  const lots: TransferableLot[] = await tx.inventoryLot.findMany({
    where: {
      storeId: input.storeId,
      skuId: input.skuId,
      locationId: input.fromLocationId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      skuId: true,
      locationId: true,
      unitCost: true,
      costCurrency: true,
      fxRateId: true,
      receivedAt: true,
      batchLabel: true,
    },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
  });

  if (lots.length === 0) return [];

  const lotIds = lots.map((lot) => lot.id);
  const [ledgerRows, reservations] = await Promise.all([
    tx.stockLedger.groupBy({
      by: ["entityId"],
      where: {
        storeId: input.storeId,
        entityType: "LOT",
        entityId: { in: lotIds },
      },
      _sum: { deltaQty: true },
    }),
    tx.orderAllocation.findMany({
      where: {
        lotId: { in: lotIds },
        status: { in: [...RESERVING_ALLOCATION_STATUSES] },
      },
      select: { lotId: true, quantity: true },
    }),
  ]);

  const onHandByLotId = new Map(
    ledgerRows.map((row) => [row.entityId, new Decimal(row._sum.deltaQty?.toString() ?? "0")])
  );
  const reservedByLotId = new Map<string, Decimal>();
  for (const reservation of reservations) {
    if (!reservation.lotId) continue;
    const current = reservedByLotId.get(reservation.lotId) ?? new Decimal(0);
    reservedByLotId.set(reservation.lotId, current.plus(reservation.quantity.toString()));
  }

  return lots.map((lot) => {
    const onHand = onHandByLotId.get(lot.id) ?? new Decimal(0);
    const reserved = reservedByLotId.get(lot.id) ?? new Decimal(0);
    return {
      lot,
      onHand,
      transferable: Decimal.max(onHand.minus(reserved), 0),
    };
  });
}

export async function transferSkuLocationStock(input: TransferSkuLocationStockInput) {
  assertPositiveIntegerQty(input.quantity, "调拨数量");
  if (input.fromLocationId === input.toLocationId) {
    throw new Error("调出仓位和调入仓位不能相同");
  }

  await assertOperationalSku(prisma, {
    storeId: input.storeId,
    skuId: input.skuId,
    actionLabel: "调拨库存",
  });

  const operationId = randomUUID();
  const occurredAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const [sourceLocation, destinationLocation] = await Promise.all([
      tx.location.findFirst({
        where: { id: input.fromLocationId, storeId: input.storeId },
        select: { id: true, code: true, type: true, capabilities: { where: { enabled: true } } },
      }),
      tx.location.findFirst({
        where: { id: input.toLocationId, storeId: input.storeId },
        select: { id: true, code: true, type: true, capabilities: { where: { enabled: true } } },
      }),
    ]);
    if (!sourceLocation || !destinationLocation) {
      throw new Error("调出或调入仓位不存在");
    }
    if (
      sourceLocation.type === "TRANSIT" ||
      (sourceLocation.capabilities.length > 0 &&
        !sourceLocation.capabilities.some((capability) => capability.code === "TRANSFER"))
    ) {
      throw new Error("调出节点未启用仓间调拨能力");
    }
    if (
      destinationLocation.type === "TRANSIT" ||
      (destinationLocation.capabilities.length > 0 &&
        !destinationLocation.capabilities.some((capability) => capability.code === "RECEIVE"))
    ) {
      throw new Error("目标节点未启用收货能力");
    }

    if (input.itemUnitId) {
      if (input.quantity !== 1) throw new Error("一物一单商品每次只能移动指定的一件");
      const unit = await tx.itemUnit.findFirst({
        where: {
          id: input.itemUnitId,
          storeId: input.storeId,
          skuId: input.skuId,
          locationId: input.fromLocationId,
          status: "AVAILABLE",
          allocations: { none: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } } },
        },
      });
      if (!unit) throw new Error("该单件商品已被占用、已移动或不在调出位置");

      const transferMeta = {
        operationId,
        skuId: input.skuId,
        itemUnitId: unit.id,
        unitCode: unit.unitCode,
        fromLocationId: input.fromLocationId,
        fromLocationCode: sourceLocation.code,
        toLocationId: input.toLocationId,
        toLocationCode: destinationLocation.code,
        notes: input.notes?.trim() || null,
        operator: input.operator?.trim() || null,
        source: "MANUAL_WAREHOUSE_TRANSFER",
      };
      await Promise.all([
        tx.itemUnit.update({
          where: { id: unit.id },
          data: { locationId: input.toLocationId },
        }),
        tx.stockLedger.createMany({
          data: [
            {
              storeId: input.storeId,
              inventoryPoolId: unit.inventoryPoolId,
              occurredAt,
              entityType: "ITEM_UNIT",
              entityId: unit.id,
              locationId: input.fromLocationId,
              deltaQty: "-1",
              reason: "TRANSFER_OUT",
              refType: "INVENTORY_TRANSFER",
              refId: operationId,
              meta: transferMeta,
            },
            {
              storeId: input.storeId,
              inventoryPoolId: unit.inventoryPoolId,
              occurredAt,
              entityType: "ITEM_UNIT",
              entityId: unit.id,
              locationId: input.toLocationId,
              deltaQty: "1",
              reason: "TRANSFER_IN",
              refType: "INVENTORY_TRANSFER",
              refId: operationId,
              meta: transferMeta,
            },
          ],
        }),
      ]);
      return {
        operationId,
        skuId: input.skuId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        quantity: 1,
        moved: [
          {
            sourceLotId: unit.id,
            destinationLotId: unit.id,
            quantity: "1",
          },
        ],
      };
    }

    const transferableLots = await getTransferableLots(tx, input);
    const totalTransferable = transferableLots.reduce(
      (sum, item) => sum.plus(item.transferable),
      new Decimal(0)
    );
    const requested = new Decimal(input.quantity);
    if (requested.gt(totalTransferable)) {
      throw new Error(
        `可调拨库存不足：可调 ${totalTransferable.toString()}，本次需要 ${requested.toString()}`
      );
    }

    let remaining = requested;
    const moved: Array<{
      sourceLotId: string;
      destinationLotId: string;
      quantity: string;
    }> = [];

    for (const item of transferableLots) {
      if (remaining.lte(0)) break;
      const quantity = Decimal.min(item.transferable, remaining);
      if (quantity.lte(0)) continue;

      const destinationLot = await tx.inventoryLot.create({
        data: {
          storeId: input.storeId,
          skuId: item.lot.skuId,
          locationId: input.toLocationId,
          unitCost: item.lot.unitCost,
          costCurrency: item.lot.costCurrency,
          fxRateId: item.lot.fxRateId,
          sourceType: "TRANSFER",
          sourceId: operationId,
          receivedAt: occurredAt,
          batchLabel: item.lot.batchLabel,
          status: "ACTIVE",
        },
      });

      const transferMeta = {
        operationId,
        skuId: input.skuId,
        fromLocationId: input.fromLocationId,
        fromLocationCode: sourceLocation.code,
        toLocationId: input.toLocationId,
        toLocationCode: destinationLocation.code,
        sourceLotId: item.lot.id,
        destinationLotId: destinationLot.id,
        notes: input.notes?.trim() || null,
        operator: input.operator?.trim() || null,
        source: "MANUAL_WAREHOUSE_TRANSFER",
      };

      await tx.stockLedger.createMany({
        data: [
          {
            storeId: input.storeId,
            occurredAt,
            entityType: "LOT",
            entityId: item.lot.id,
            locationId: input.fromLocationId,
            deltaQty: quantity.negated().toFixed(4),
            reason: "TRANSFER_OUT",
            refType: "INVENTORY_TRANSFER",
            refId: operationId,
            meta: transferMeta,
          },
          {
            storeId: input.storeId,
            occurredAt,
            entityType: "LOT",
            entityId: destinationLot.id,
            locationId: input.toLocationId,
            deltaQty: quantity.toFixed(4),
            reason: "TRANSFER_IN",
            refType: "INVENTORY_TRANSFER",
            refId: operationId,
            meta: transferMeta,
          },
        ],
      });

      const sourceRemaining = item.onHand.minus(quantity);
      if (sourceRemaining.lte(0)) {
        await tx.inventoryLot.update({
          where: { id: item.lot.id },
          data: { status: "CONSUMED" },
        });
      }

      moved.push({
        sourceLotId: item.lot.id,
        destinationLotId: destinationLot.id,
        quantity: quantity.toFixed(4),
      });
      remaining = remaining.minus(quantity);
    }

    return {
      operationId,
      skuId: input.skuId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      quantity: requested.toNumber(),
      moved,
    };
  });

  revalidateInventoryMaintenancePaths(
    result.moved.flatMap((item) => [item.sourceLotId, item.destinationLotId])
  );
  return result;
}

export async function transferSkuLocationStockAction(
  input: Omit<TransferSkuLocationStockInput, "operator">
) {
  try {
    const context = await requireUserContext({ storeId: input.storeId });
    const transfer = await transferSkuLocationStock({
      ...input,
      operator: context.userId,
    });
    return actionSuccess({ transfer });
  } catch (error) {
    return toActionFailure(error, "仓间调拨失败，请稍后重试");
  }
}

export interface DispatchSkuLocationStockTransferInput extends TransferSkuLocationStockInput {
  trackingNo?: string;
  carrier?: string;
  etaDate?: string;
  transportMode?: "HAND_CARRY" | "CONSOLIDATOR" | "POSTAL" | "COURIER" | "FREIGHT" | "OTHER";
  carriedBy?: string;
}

export async function dispatchSkuLocationStockTransfer(
  input: DispatchSkuLocationStockTransferInput
) {
  assertPositiveIntegerQty(input.quantity, "转仓数量");
  if (input.fromLocationId === input.toLocationId) {
    throw new Error("起运仓和目标仓不能相同");
  }
  await assertOperationalSku(prisma, {
    storeId: input.storeId,
    skuId: input.skuId,
    actionLabel: "发起物流转仓",
  });

  const [sourceLocation, destinationLocation] = await Promise.all([
    prisma.location.findFirst({
      where: { id: input.fromLocationId, storeId: input.storeId },
      select: { type: true, capabilities: { where: { enabled: true } } },
    }),
    prisma.location.findFirst({
      where: { id: input.toLocationId, storeId: input.storeId },
      select: { type: true, capabilities: { where: { enabled: true } } },
    }),
  ]);
  if (!sourceLocation || !destinationLocation) {
    throw new Error("起运仓或目标仓不存在");
  }
  if (
    sourceLocation.type === "TRANSIT" ||
    (sourceLocation.capabilities.length > 0 &&
      !sourceLocation.capabilities.some((capability) => capability.code === "TRANSFER"))
  ) {
    throw new Error("起运节点未启用仓间调拨能力");
  }
  if (
    destinationLocation.type === "TRANSIT" ||
    (destinationLocation.capabilities.length > 0 &&
      !destinationLocation.capabilities.some((capability) => capability.code === "RECEIVE"))
  ) {
    throw new Error("目标节点未启用收货能力");
  }

  const requested = new Decimal(input.quantity);
  let lines:
    | Array<{ entityType: "LOT"; entityId: string; quantity: string }>
    | Array<{ entityType: "ITEM_UNIT"; entityId: string }>;
  if (input.itemUnitId) {
    if (!requested.eq(1)) throw new Error("一物一单商品每次只能移动指定的一件");
    const unit = await prisma.itemUnit.findFirst({
      where: {
        id: input.itemUnitId,
        storeId: input.storeId,
        skuId: input.skuId,
        locationId: input.fromLocationId,
        status: "AVAILABLE",
        allocations: { none: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } } },
      },
      select: { id: true },
    });
    if (!unit) throw new Error("该单件商品已被占用、已移动或不在起运位置");
    lines = [{ entityType: "ITEM_UNIT", entityId: unit.id }];
  } else {
    const transferableLots = await prisma.$transaction((tx) => getTransferableLots(tx, input));
    const totalTransferable = transferableLots.reduce(
      (sum, item) => sum.plus(item.transferable),
      new Decimal(0)
    );
    if (requested.gt(totalTransferable)) {
      throw new Error(
        `可转仓库存不足：可转 ${totalTransferable.toString()}，本次需要 ${requested.toString()}`
      );
    }

    let remaining = requested;
    const lotLines: Array<{ entityType: "LOT"; entityId: string; quantity: string }> = [];
    for (const item of transferableLots) {
      if (remaining.lte(0)) break;
      const quantity = Decimal.min(item.transferable, remaining);
      if (quantity.lte(0)) continue;
      lotLines.push({ entityType: "LOT", entityId: item.lot.id, quantity: quantity.toFixed(4) });
      remaining = remaining.minus(quantity);
    }
    lines = lotLines;
  }

  const etaDate = input.etaDate ? new Date(input.etaDate) : undefined;
  const shipment = await dispatchInventoryTransfer({
    storeId: input.storeId,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    lines,
    legIndex: 2,
    trackingNo: input.trackingNo,
    carrier: input.carrier,
    transportMode: input.transportMode,
    carriedBy: input.carriedBy,
    etaDate: etaDate && !Number.isNaN(etaDate.getTime()) ? etaDate : undefined,
    note: input.notes,
  });
  return { shipmentId: shipment.id, quantity: requested.toNumber() };
}

export async function dispatchSkuLocationStockTransferAction(
  input: Omit<DispatchSkuLocationStockTransferInput, "operator">
) {
  try {
    await requireUserContext({ storeId: input.storeId });
    const transfer = await dispatchSkuLocationStockTransfer(input);
    return actionSuccess({ transfer });
  } catch (error) {
    return toActionFailure(error, "发起物流转仓失败，请稍后重试");
  }
}
