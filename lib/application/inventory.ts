import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { createItemUnitWithIdentity } from "@/lib/application/item-unit-identity";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import {
  fulfillmentMarketsForLocation,
  locationMatchesMarket,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";

export type InboundSourceType = "PURCHASE" | "SPLIT" | "QUICK_ENTRY" | "OPENING_STOCK";

export interface CreateInboundItemUnitInput {
  storeId: string;
  skuId: string;
  locationId: string;
  unitCost: string;
  costCurrency: string;
  conditionType?: string;
  conditionGrade?: string;
  functionStatus?: string;
  notes?: string;
  batchLabel?: string;
  sourceType: InboundSourceType;
  sourceId: string;
  receivedAt: Date;
  refType?: string;
  refId?: string;
  ledgerReason?: "INBOUND_PURCHASE" | "OPENING_BALANCE" | "SPLIT_IN";
  status?: "AVAILABLE" | "RETURN_CHECK";
  meta?: Prisma.InputJsonValue;
}

export async function createInboundItemUnit(
  tx: Prisma.TransactionClient,
  input: CreateInboundItemUnitInput
) {
  const unitCost = new Decimal(input.unitCost);
  if (!unitCost.isFinite() || unitCost.lt(0)) {
    throw new Error("单位成本不能小于 0");
  }

  const item = await createItemUnitWithIdentity(tx, {
    storeId: input.storeId,
    date: input.receivedAt,
    data: {
      storeId: input.storeId,
      skuId: input.skuId,
      locationId: input.locationId,
      unitCost: unitCost.toFixed(4),
      costCurrency: input.costCurrency,
      conditionType: input.conditionType,
      conditionGrade: input.conditionGrade,
      functionStatus: input.functionStatus,
      notes: input.notes,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: input.status ?? "AVAILABLE",
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
      reason: input.ledgerReason ?? "INBOUND_PURCHASE",
      refType: input.refType ?? input.sourceType,
      refId: input.refId ?? input.sourceId,
      meta: input.meta ?? (input.batchLabel ? { batchLabel: input.batchLabel } : undefined),
    },
  });

  return item;
}

/** 单个仓位的库存细分（可发货 / 真实在途 / 到仓暂存） */
export interface StockLocationBreakdown {
  locationId: string;
  code: string;
  name: string;
  region: string | null;
  type: string;
  /** 该物理库存节点通过有效客户配送线路可服务的市场 */
  fulfillableMarkets?: SellableMarketCode[];
  qty: number;
}

/**
 * 单个 SKU 的可售、在途与暂存库存细分
 *
 * 业务定义：
 * - sellable：库存所在 Location 的 isSellableDefault === true，可被分配；
 *   能否服务某个订单目的地，另由节点能力和 ShippingLane 计算
 * - inTransit：存在状态为 IN_TRANSIT 的运输明细，表示货物确实已发出但尚未到仓
 * - held：货物已在某个实体节点，但该节点当前不可售，或库存尚在待集运/待处理状态
 */
export interface SkuStockBreakdown {
  skuId: string;
  sellableQty: number;
  inTransitQty: number;
  heldQty: number;
  sellableLotQty: number;
  sellableItemUnitCount: number;
  inTransitLotQty: number;
  inTransitItemUnitCount: number;
  heldLotQty: number;
  heldItemUnitCount: number;
  sellableLocations: StockLocationBreakdown[];
  inTransitLocations: StockLocationBreakdown[];
  heldLocations: StockLocationBreakdown[];
  sellableLotLocations: StockLocationBreakdown[];
  inTransitLotLocations: StockLocationBreakdown[];
  heldLotLocations: StockLocationBreakdown[];
  sellableItemUnitLocations: StockLocationBreakdown[];
  inTransitItemUnitLocations: StockLocationBreakdown[];
  heldItemUnitLocations: StockLocationBreakdown[];
}

type StockAggregateState = "SELLABLE" | "IN_TRANSIT" | "HELD";

interface AggregateAcc {
  qty: number;
  lotQty: number;
  itemUnitCount: number;
  byLocation: Map<string, StockLocationBreakdown>;
  lotByLocation: Map<string, StockLocationBreakdown>;
  itemUnitByLocation: Map<string, StockLocationBreakdown>;
}

function consumeLocationQuantity(
  locations: Map<string, StockLocationBreakdown>,
  requested: number
) {
  let remaining = requested;
  for (const location of locations.values()) {
    if (remaining <= 0) break;
    const consumed = Math.min(location.qty, remaining);
    location.qty -= consumed;
    remaining -= consumed;
  }
  for (const [locationId, location] of locations.entries()) {
    if (location.qty <= 0) locations.delete(locationId);
  }
}

/**
 * 保证配额不是一份额外库存，而是从当前真实可售量中划出的保护区。
 * 已被保证渠道订单占用的部分会通过 FulfillmentInventoryAllocation 扣除，
 * 此处只需继续扣除尚未下单的配额余额。
 */
function protectGuaranteedQuantity(entry: AggregateAcc, requested: number) {
  let remaining = Math.max(requested, 0);
  const lotProtected = Math.min(entry.lotQty, remaining);
  if (lotProtected > 0) {
    entry.lotQty -= lotProtected;
    remaining -= lotProtected;
    consumeLocationQuantity(entry.lotByLocation, lotProtected);
  }
  const itemUnitProtected = Math.min(entry.itemUnitCount, remaining);
  if (itemUnitProtected > 0) {
    entry.itemUnitCount -= itemUnitProtected;
    remaining -= itemUnitProtected;
    consumeLocationQuantity(entry.itemUnitByLocation, itemUnitProtected);
  }
  const protectedQty = lotProtected + itemUnitProtected;
  entry.qty = Math.max(entry.qty - protectedQty, 0);
  consumeLocationQuantity(entry.byLocation, protectedQty);
}

function pushLocationQty(
  locations: Map<string, StockLocationBreakdown>,
  location: {
    id: string;
    code: string;
    name: string;
    region: string | null;
    type: string;
    capabilities?: Array<{ code: string; enabled?: boolean }>;
    shippingLanesFrom?: Array<{
      laneType: string;
      destinationCountry: string | null;
      active: boolean;
    }>;
    fulfillableMarkets?: string[];
  },
  qty: number
) {
  const existing = locations.get(location.id);
  if (existing) {
    existing.qty += qty;
    return;
  }
  locations.set(location.id, {
    locationId: location.id,
    code: location.code,
    name: location.name,
    region: location.region,
    type: location.type,
    fulfillableMarkets: fulfillmentMarketsForLocation(location),
    qty,
  });
}

function emptyAggregateAcc(): AggregateAcc {
  return {
    qty: 0,
    lotQty: 0,
    itemUnitCount: 0,
    byLocation: new Map(),
    lotByLocation: new Map(),
    itemUnitByLocation: new Map(),
  };
}

function pushQty(
  acc: Map<string, { sellable: AggregateAcc; inTransit: AggregateAcc; held: AggregateAcc }>,
  skuId: string,
  qty: number,
  state: StockAggregateState,
  location: {
    id: string;
    code: string;
    name: string;
    region: string | null;
    type: string;
    capabilities?: Array<{ code: string; enabled?: boolean }>;
    shippingLanesFrom?: Array<{
      laneType: string;
      destinationCountry: string | null;
      active: boolean;
    }>;
    fulfillableMarkets?: string[];
  },
  source: "LOT" | "ITEM_UNIT"
) {
  if (qty <= 0) return;
  let entry = acc.get(skuId);
  if (!entry) {
    entry = {
      sellable: emptyAggregateAcc(),
      inTransit: emptyAggregateAcc(),
      held: emptyAggregateAcc(),
    };
    acc.set(skuId, entry);
  }
  const bucket =
    state === "SELLABLE" ? entry.sellable : state === "IN_TRANSIT" ? entry.inTransit : entry.held;
  bucket.qty += qty;
  if (source === "LOT") {
    bucket.lotQty += qty;
    pushLocationQty(bucket.lotByLocation, location, qty);
  } else {
    bucket.itemUnitCount += qty;
    pushLocationQty(bucket.itemUnitByLocation, location, qty);
  }
  pushLocationQty(bucket.byLocation, location, qty);
}

/**
 * 一次性返回 store 内每个 SKU 的可售/在途/暂存库存细分
 *
 * 性能：库存、运输明细和有效预留均按 store 批量查询，
 * 适合列表页一次性渲染所有 SKU 的库存提示。
 */
export async function getStoreStockBreakdown(
  storeId: string
): Promise<Map<string, SkuStockBreakdown>> {
  const [lotAggregates, lots, itemUnits, transferLines, guaranteedChannels] = await Promise.all([
    prisma.stockLedger.groupBy({
      by: ["entityId"],
      where: { storeId, entityType: "LOT" },
      _sum: { deltaQty: true },
    }),
    prisma.inventoryLot.findMany({
      where: { storeId, status: { in: ["ACTIVE", "CONSOLIDATING"] } },
      include: {
        location: {
          include: {
            capabilities: { where: { enabled: true } },
            shippingLanesFrom: { where: { active: true, laneType: "CUSTOMER_DELIVERY" } },
          },
        },
      },
    }),
    prisma.itemUnit.findMany({
      where: { storeId, status: { in: ["AVAILABLE", "CONSOLIDATING"] } },
      include: {
        location: {
          include: {
            capabilities: { where: { enabled: true } },
            shippingLanesFrom: { where: { active: true, laneType: "CUSTOMER_DELIVERY" } },
          },
        },
      },
    }),
    prisma.inboundShipmentInventoryLine.findMany({
      where: { status: "IN_TRANSIT", shipment: { storeId } },
      include: {
        shipment: {
          include: {
            fromLocation: true,
            toLocation: true,
          },
        },
      },
    }),
    prisma.supplyOfferChannel.findMany({
      where: {
        status: "ACTIVE",
        inventoryMode: "GUARANTEED",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        offer: {
          storeId,
          status: { in: ["PUBLISHED", "PAUSED"] },
          items: { some: { skuId: { not: null } } },
        },
      },
      select: {
        quotaQty: true,
        quotaReservedQty: true,
        offer: { select: { items: { select: { skuId: true } } } },
      },
    }),
  ]);

  const [reservations, fulfillmentReservations] = await Promise.all([
    prisma.orderAllocation.findMany({
      where: {
        status: { in: [...RESERVING_ALLOCATION_STATUSES] },
        OR: [
          { lotId: { in: lots.map((lot) => lot.id) } },
          { itemUnitId: { in: itemUnits.map((item) => item.id) } },
        ],
      },
      select: { lotId: true, itemUnitId: true, quantity: true },
    }),
    prisma.fulfillmentInventoryAllocation.findMany({
      where: {
        status: "ALLOCATED",
        OR: [
          { lotId: { in: lots.map((lot) => lot.id) } },
          { itemUnitId: { in: itemUnits.map((item) => item.id) } },
        ],
      },
      select: { lotId: true, itemUnitId: true, quantity: true },
    }),
  ]);

  const lotQtyMap = new Map(
    lotAggregates.map((a) => [
      a.entityId,
      new Decimal(a._sum.deltaQty?.toString() ?? "0").toNumber(),
    ])
  );
  const reservedLotQtyMap = new Map<string, number>();
  const reservedItemUnitIds = new Set<string>();
  for (const reservation of [...reservations, ...fulfillmentReservations]) {
    if (reservation.lotId) {
      reservedLotQtyMap.set(
        reservation.lotId,
        (reservedLotQtyMap.get(reservation.lotId) ?? 0) +
          new Decimal(reservation.quantity.toString()).toNumber()
      );
    }
    if (reservation.itemUnitId) {
      reservedItemUnitIds.add(reservation.itemUnitId);
    }
  }

  const acc = new Map<
    string,
    { sellable: AggregateAcc; inTransit: AggregateAcc; held: AggregateAcc }
  >();
  const transferLocationByEntity = new Map(
    transferLines.map((line) => {
      const from = line.shipment.fromLocation;
      const to = line.shipment.toLocation;
      return [
        `${line.entityType}:${line.entityId}`,
        {
          id: `shipment:${line.shipmentId}`,
          code: line.shipment.trackingNo || "IN-TRANSIT",
          name: `${from?.name ?? "起运仓"} → ${to?.name ?? "目标仓"}（转运中）`,
          region: to?.region ?? from?.region ?? null,
          type: "TRANSIT",
          fulfillableMarkets: [] as string[],
        },
      ] as const;
    })
  );

  for (const lot of lots) {
    const qty = Math.max((lotQtyMap.get(lot.id) ?? 0) - (reservedLotQtyMap.get(lot.id) ?? 0), 0);
    if (qty <= 0) continue;
    const transferLocation = transferLocationByEntity.get(`LOT:${lot.id}`);
    pushQty(
      acc,
      lot.skuId,
      qty,
      transferLocation
        ? "IN_TRANSIT"
        : lot.status === "ACTIVE" && lot.location.isSellableDefault
          ? "SELLABLE"
          : "HELD",
      transferLocation ?? lot.location,
      "LOT"
    );
  }

  for (const item of itemUnits) {
    if (reservedItemUnitIds.has(item.id)) continue;
    const transferLocation = transferLocationByEntity.get(`ITEM_UNIT:${item.id}`);
    pushQty(
      acc,
      item.skuId,
      1,
      transferLocation
        ? "IN_TRANSIT"
        : item.status === "AVAILABLE" && item.location.isSellableDefault
          ? "SELLABLE"
          : "HELD",
      transferLocation ?? item.location,
      "ITEM_UNIT"
    );
  }

  const protectedBySku = new Map<string, number>();
  for (const channel of guaranteedChannels) {
    const skuIds = [...new Set(channel.offer.items.map((item) => item.skuId).filter(Boolean))];
    // Guaranteed mode is validated as a single-SKU offer. Keeping this guard
    // prevents legacy or manually imported mixed offers from double-protecting.
    if (skuIds.length !== 1) continue;
    const remaining = Decimal.max(channel.quotaQty.minus(channel.quotaReservedQty), 0).toNumber();
    protectedBySku.set(
      skuIds[0] as string,
      (protectedBySku.get(skuIds[0] as string) ?? 0) + remaining
    );
  }
  for (const [skuId, protectedQty] of protectedBySku.entries()) {
    const entry = acc.get(skuId);
    if (entry) protectGuaranteedQuantity(entry.sellable, protectedQty);
  }

  const result = new Map<string, SkuStockBreakdown>();
  for (const [skuId, entry] of acc.entries()) {
    result.set(skuId, {
      skuId,
      sellableQty: entry.sellable.qty,
      inTransitQty: entry.inTransit.qty,
      heldQty: entry.held.qty,
      sellableLotQty: entry.sellable.lotQty,
      sellableItemUnitCount: entry.sellable.itemUnitCount,
      inTransitLotQty: entry.inTransit.lotQty,
      inTransitItemUnitCount: entry.inTransit.itemUnitCount,
      heldLotQty: entry.held.lotQty,
      heldItemUnitCount: entry.held.itemUnitCount,
      sellableLocations: Array.from(entry.sellable.byLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
      inTransitLocations: Array.from(entry.inTransit.byLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
      heldLocations: Array.from(entry.held.byLocation.values()).sort((a, b) => b.qty - a.qty),
      sellableLotLocations: Array.from(entry.sellable.lotByLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
      inTransitLotLocations: Array.from(entry.inTransit.lotByLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
      heldLotLocations: Array.from(entry.held.lotByLocation.values()).sort((a, b) => b.qty - a.qty),
      sellableItemUnitLocations: Array.from(entry.sellable.itemUnitByLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
      inTransitItemUnitLocations: Array.from(entry.inTransit.itemUnitByLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
      heldItemUnitLocations: Array.from(entry.held.itemUnitByLocation.values()).sort(
        (a, b) => b.qty - a.qty
      ),
    });
  }

  return result;
}

/**
 * 按全库存 FIFO 规则，解析会优先从哪个仓位发货。
 * 与 quickSellListing 在未限定 shipFromLocationId 时的扣减顺序一致。
 */
export async function resolveFifoShipFromLocation(
  storeId: string,
  skuId: string,
  market?: SellableMarketCode
): Promise<string | null> {
  const lots = await prisma.inventoryLot.findMany({
    where: {
      storeId,
      skuId,
      status: "ACTIVE",
      location: { isSellableDefault: true },
    },
    include: {
      location: {
        include: {
          capabilities: { where: { enabled: true } },
          shippingLanesFrom: { where: { active: true, laneType: "CUSTOMER_DELIVERY" } },
        },
      },
    },
    orderBy: { receivedAt: "asc" },
  });

  for (const lot of lots) {
    if (market && !locationMatchesMarket(lot.location, market)) continue;
    const [ledgers, reservations] = await Promise.all([
      prisma.stockLedger.findMany({
        where: { entityType: "LOT", entityId: lot.id },
      }),
      prisma.orderAllocation.findMany({
        where: {
          lotId: lot.id,
          status: { in: [...RESERVING_ALLOCATION_STATUSES] },
        },
        select: { quantity: true },
      }),
    ]);
    const available = ledgers.reduce(
      (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
      new Decimal(0)
    );
    const reserved = reservations.reduce(
      (sum, reservation) => sum.plus(new Decimal(reservation.quantity.toString())),
      new Decimal(0)
    );
    if (available.minus(reserved).gt(0)) {
      return lot.locationId;
    }
  }

  const itemUnits = await prisma.itemUnit.findMany({
    where: {
      storeId,
      skuId,
      status: "AVAILABLE",
      location: { isSellableDefault: true },
      allocations: {
        none: {
          status: { in: [...RESERVING_ALLOCATION_STATUSES] },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    include: {
      location: {
        include: {
          capabilities: { where: { enabled: true } },
          shippingLanesFrom: { where: { active: true, laneType: "CUSTOMER_DELIVERY" } },
        },
      },
    },
  });

  return (
    itemUnits.find((item) => !market || locationMatchesMarket(item.location, market))?.locationId ??
    null
  );
}

/**
 * 返回事务内某个 SKU 当前仍可售的有效数量。
 * 账面库存保留到实际发货时扣减，PENDING / ALLOCATED 在这里作为暂扣库存扣除。
 */
export async function getEffectiveSellableQuantity(
  tx: Prisma.TransactionClient,
  storeId: string,
  skuId: string,
  market?: SellableMarketCode,
  inventoryPoolId?: string | null
): Promise<Decimal> {
  const [lots, itemUnits] = await Promise.all([
    tx.inventoryLot.findMany({
      where: {
        storeId,
        skuId,
        inventoryPoolId: inventoryPoolId || undefined,
        status: "ACTIVE",
        location: { isSellableDefault: true },
      },
      select: {
        id: true,
        location: {
          select: {
            code: true,
            name: true,
            region: true,
            capabilities: { where: { enabled: true }, select: { code: true, enabled: true } },
            shippingLanesFrom: {
              where: { active: true, laneType: "CUSTOMER_DELIVERY" },
              select: { laneType: true, destinationCountry: true, active: true },
            },
          },
        },
      },
    }),
    tx.itemUnit.findMany({
      where: {
        storeId,
        skuId,
        inventoryPoolId: inventoryPoolId || undefined,
        status: "AVAILABLE",
        location: { isSellableDefault: true },
      },
      select: {
        id: true,
        location: {
          select: {
            code: true,
            name: true,
            region: true,
            capabilities: { where: { enabled: true }, select: { code: true, enabled: true } },
            shippingLanesFrom: {
              where: { active: true, laneType: "CUSTOMER_DELIVERY" },
              select: { laneType: true, destinationCountry: true, active: true },
            },
          },
        },
      },
    }),
  ]);

  const lotIds = lots
    .filter((lot) => !market || locationMatchesMarket(lot.location, market))
    .map((lot) => lot.id);
  const itemUnitIds = itemUnits
    .filter((item) => !market || locationMatchesMarket(item.location, market))
    .map((item) => item.id);
  const [lotLedgers, reservations, fulfillmentReservations, guaranteedChannels] = await Promise.all(
    [
      tx.stockLedger.findMany({
        where: {
          storeId,
          entityType: "LOT",
          entityId: { in: lotIds },
        },
        select: { deltaQty: true },
      }),
      tx.orderAllocation.findMany({
        where: {
          status: { in: [...RESERVING_ALLOCATION_STATUSES] },
          OR: [{ lotId: { in: lotIds } }, { itemUnitId: { in: itemUnitIds } }],
        },
        select: { quantity: true },
      }),
      tx.fulfillmentInventoryAllocation.findMany({
        where: {
          status: "ALLOCATED",
          OR: [{ lotId: { in: lotIds } }, { itemUnitId: { in: itemUnitIds } }],
        },
        select: { quantity: true },
      }),
      tx.supplyOfferChannel.findMany({
        where: {
          status: "ACTIVE",
          inventoryMode: "GUARANTEED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          offer: {
            storeId,
            inventoryPoolId: inventoryPoolId || undefined,
            status: { in: ["PUBLISHED", "PAUSED"] },
            items: { some: { skuId } },
          },
        },
        select: { quotaQty: true, quotaReservedQty: true },
      }),
    ]
  );

  const onHandLotQty = lotLedgers.reduce(
    (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
    new Decimal(0)
  );
  const reservedQty = [...reservations, ...fulfillmentReservations].reduce(
    (sum, reservation) => sum.plus(new Decimal(reservation.quantity.toString())),
    new Decimal(0)
  );

  const guaranteedQty = guaranteedChannels.reduce(
    (sum, channel) => sum.plus(Decimal.max(channel.quotaQty.minus(channel.quotaReservedQty), 0)),
    new Decimal(0)
  );

  return Decimal.max(
    onHandLotQty.plus(itemUnitIds.length).minus(reservedQty).minus(guaranteedQty),
    0
  );
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
      heldQty: 0,
      sellableLotQty: 0,
      sellableItemUnitCount: 0,
      inTransitLotQty: 0,
      inTransitItemUnitCount: 0,
      heldLotQty: 0,
      heldItemUnitCount: 0,
      sellableLocations: [],
      inTransitLocations: [],
      heldLocations: [],
      sellableLotLocations: [],
      inTransitLotLocations: [],
      heldLotLocations: [],
      sellableItemUnitLocations: [],
      inTransitItemUnitLocations: [],
      heldItemUnitLocations: [],
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
  ledgerReason?: "INBOUND_PURCHASE" | "OPENING_BALANCE" | "SPLIT_IN";
  batchLabel?: string;
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
      batchLabel: input.batchLabel,
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
      reason: input.ledgerReason ?? "INBOUND_PURCHASE",
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
