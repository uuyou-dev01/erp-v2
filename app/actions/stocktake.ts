"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import {
  aggregateKey,
  allocateStocktakeDelta,
  computeWeightedAvgCost,
  roundBookQty,
  type LotBreakdown,
} from "@/lib/application/stocktake-allocation";
import { prisma } from "@/lib/prisma";

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

  return buildAggregatedRows(lots, qtyByLotId).sort((a, b) =>
    a.skuCode.localeCompare(b.skuCode)
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

export async function submitSkuLocationStocktakeAdjustments(
  input: SubmitSkuLocationStocktakeInput
) {
  if (input.items.length === 0) {
    throw new Error("请至少提交一条盘点记录");
  }

  const dedupedItems = Array.from(
    new Map(
      input.items.map((item) => [aggregateKey(item.skuId, item.locationId), item])
    ).values()
  );

  for (const item of dedupedItems) {
    assertIntegerQty(item.countedQty, "实盘数量");
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
        throw new Error("找不到可盘点的入库批次，请刷新后重试");
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
        throw new Error("盘点单价必须大于等于 0");
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

  revalidatePath("/inventory/stocktake");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/sellable");
  for (const item of result) {
    revalidatePath(`/inventory/lots/${item.lotId}`);
  }

  return result;
}
