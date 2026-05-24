import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

export type InboundSourceType = "PURCHASE" | "SPLIT" | "QUICK_ENTRY";

export interface CreateInboundItemUnitInput {
  storeId: string;
  skuId: string;
  locationId: string;
  unitCost: string;
  costCurrency: string;
  conditionGrade?: string;
  notes?: string;
  batchLabel?: string;
  sourceType: InboundSourceType;
  sourceId: string;
  receivedAt: Date;
  refType?: string;
  refId?: string;
}

export async function createInboundItemUnit(
  tx: Prisma.TransactionClient,
  input: CreateInboundItemUnitInput
) {
  const unitCost = new Decimal(input.unitCost);
  if (!unitCost.isFinite() || unitCost.lt(0)) {
    throw new Error("单位成本不能小于 0");
  }

  const item = await tx.itemUnit.create({
    data: {
      storeId: input.storeId,
      skuId: input.skuId,
      locationId: input.locationId,
      unitCost: unitCost.toFixed(4),
      costCurrency: input.costCurrency,
      conditionGrade: input.conditionGrade,
      notes: input.notes,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: "AVAILABLE",
    },
  });

  await tx.stockLedger.create({
    data: {
      storeId: input.storeId,
      occurredAt: input.receivedAt,
      entityType: "ITEM_UNIT",
      entityId: item.id,
      locationId: input.locationId,
      deltaQty: "1",
      reason: "INBOUND_PURCHASE",
      refType: input.refType ?? input.sourceType,
      refId: input.refId ?? input.sourceId,
      meta: input.batchLabel ? { batchLabel: input.batchLabel } : undefined,
    },
  });

  return item;
}

/**
 * 单个仓位的库存细分（用于"可发货 / 转运中"展示）
 */
export interface StockLocationBreakdown {
  locationId: string;
  code: string;
  name: string;
  type: string;
  qty: number;
}

/**
 * 单个 SKU 的可售库存与在途库存细分
 *
 * 业务定义：
 * - sellable：库存所在 Location 的 isSellableDefault === true，可直接上架/发货
 *   （包含本土自营仓、代发型转运仓、朋友代发等）
 * - inTransit：库存所在 Location 的 isSellableDefault === false，
 *   通常是普通转运仓 / 在途逻辑节点，需要调拨到可售位置后才能上架
 */
export interface SkuStockBreakdown {
  skuId: string;
  sellableQty: number;
  inTransitQty: number;
  sellableLocations: StockLocationBreakdown[];
  inTransitLocations: StockLocationBreakdown[];
}

interface AggregateAcc {
  qty: number;
  byLocation: Map<string, StockLocationBreakdown>;
}

function pushQty(
  acc: Map<string, { sellable: AggregateAcc; inTransit: AggregateAcc }>,
  skuId: string,
  qty: number,
  isSellable: boolean,
  location: { id: string; code: string; name: string; type: string }
) {
  if (qty <= 0) return;
  let entry = acc.get(skuId);
  if (!entry) {
    entry = {
      sellable: { qty: 0, byLocation: new Map() },
      inTransit: { qty: 0, byLocation: new Map() },
    };
    acc.set(skuId, entry);
  }
  const bucket = isSellable ? entry.sellable : entry.inTransit;
  bucket.qty += qty;
  const existing = bucket.byLocation.get(location.id);
  if (existing) {
    existing.qty += qty;
  } else {
    bucket.byLocation.set(location.id, {
      locationId: location.id,
      code: location.code,
      name: location.name,
      type: location.type,
      qty,
    });
  }
}

/**
 * 一次性返回 store 内每个 SKU 的可售/在途库存细分
 *
 * 性能：3 次 DB 查询（lot ledger 汇总 + 所有 active lot + 所有 available itemUnit），
 * 适合列表页一次性渲染所有 SKU 的库存提示。
 */
export async function getStoreStockBreakdown(
  storeId: string
): Promise<Map<string, SkuStockBreakdown>> {
  const [lotAggregates, lots, itemUnits] = await Promise.all([
    prisma.stockLedger.groupBy({
      by: ["entityId"],
      where: { storeId, entityType: "LOT" },
      _sum: { deltaQty: true },
    }),
    prisma.inventoryLot.findMany({
      where: { storeId, status: "ACTIVE" },
      include: { location: true },
    }),
    prisma.itemUnit.findMany({
      where: { storeId, status: "AVAILABLE" },
      include: { location: true },
    }),
  ]);

  const lotQtyMap = new Map(
    lotAggregates.map((a) => [
      a.entityId,
      new Decimal(a._sum.deltaQty?.toString() ?? "0").toNumber(),
    ])
  );

  const acc = new Map<
    string,
    { sellable: AggregateAcc; inTransit: AggregateAcc }
  >();

  for (const lot of lots) {
    const qty = lotQtyMap.get(lot.id) ?? 0;
    if (qty <= 0) continue;
    pushQty(acc, lot.skuId, qty, lot.location.isSellableDefault, lot.location);
  }

  for (const item of itemUnits) {
    pushQty(acc, item.skuId, 1, item.location.isSellableDefault, item.location);
  }

  const result = new Map<string, SkuStockBreakdown>();
  for (const [skuId, entry] of acc.entries()) {
    result.set(skuId, {
      skuId,
      sellableQty: entry.sellable.qty,
      inTransitQty: entry.inTransit.qty,
      sellableLocations: Array.from(entry.sellable.byLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
      inTransitLocations: Array.from(entry.inTransit.byLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
    });
  }

  return result;
}

/** 单 SKU 版本，便于在 listing 表单等地按需调用 */
export async function getSkuStockBreakdown(
  storeId: string,
  skuId: string
): Promise<SkuStockBreakdown> {
  const map = await getStoreStockBreakdown(storeId);
  return (
    map.get(skuId) ?? {
      skuId,
      sellableQty: 0,
      inTransitQty: 0,
      sellableLocations: [],
      inTransitLocations: [],
    }
  );
}

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
