"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import {
  confirmInboundShipmentDelivered,
  dispatchInventoryTransfer,
  type DispatchInventoryTransferInput,
} from "@/app/actions/logistics";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { LOGISTICS_COST_SOURCE_TYPES } from "@/lib/application/logistics-cost";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

export interface TransferInventoryCandidate {
  key: string;
  entityType: "LOT" | "ITEM_UNIT";
  entityId: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  locationRegion: string | null;
  availableQuantity: string;
  unitCode: string | null;
  sourceType: string;
  sourceReference: string;
  purchaseOrderId: string | null;
  receivedAt: string | null;
}

export interface TransferLocationOption {
  id: string;
  code: string;
  name: string;
  region: string | null;
  type: string;
  capabilities: string[];
}

function addReservedQuantity(
  target: Map<string, Decimal>,
  rows: Array<{ lotId: string | null; quantity: { toString(): string } }>
) {
  for (const row of rows) {
    if (!row.lotId) continue;
    target.set(row.lotId, (target.get(row.lotId) ?? new Decimal(0)).plus(row.quantity.toString()));
  }
}

export async function getTransferLocations(storeId?: string): Promise<TransferLocationOption[]> {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const locations = await prisma.location.findMany({
    where: { storeId: context.activeStoreId },
    include: { capabilities: { where: { enabled: true }, select: { code: true } } },
    orderBy: [{ region: "asc" }, { code: "asc" }],
  });
  return locations.map((location) => ({
    id: location.id,
    code: location.code,
    name: location.name,
    region: location.region,
    type: location.type,
    capabilities: location.capabilities.map((capability) => capability.code),
  }));
}

export async function listTransferInventoryCandidates(input?: {
  storeId?: string;
  locationId?: string;
}): Promise<TransferInventoryCandidate[]> {
  const context = await requireUserContext(input?.storeId ? { storeId: input.storeId } : undefined);
  const storeId = context.activeStoreId;
  const [lots, units] = await Promise.all([
    prisma.inventoryLot.findMany({
      where: {
        storeId,
        status: "ACTIVE",
        ...(input?.locationId ? { locationId: input.locationId } : {}),
      },
      include: { sku: true, location: true },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    }),
    prisma.itemUnit.findMany({
      where: {
        storeId,
        status: "AVAILABLE",
        ...(input?.locationId ? { locationId: input.locationId } : {}),
      },
      include: { sku: true, location: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const lotIds = lots.map((lot) => lot.id);
  const unitIds = units.map((unit) => unit.id);
  const purchaseSourceIds = [
    ...lots.flatMap((lot) => (lot.sourceType === "PURCHASE" ? [lot.sourceId] : [])),
    ...units.flatMap((unit) => (unit.sourceType === "PURCHASE" ? [unit.sourceId] : [])),
  ];
  const [
    lotBalances,
    orderReservations,
    fulfillmentReservations,
    unitOrderReservations,
    unitFulfillmentReservations,
    purchaseLines,
  ] = await Promise.all([
    lotIds.length
      ? prisma.stockLedger.groupBy({
          by: ["entityId"],
          where: { storeId, entityType: "LOT", entityId: { in: lotIds } },
          _sum: { deltaQty: true },
        })
      : [],
    lotIds.length
      ? prisma.orderAllocation.findMany({
          where: {
            lotId: { in: lotIds },
            status: { in: [...RESERVING_ALLOCATION_STATUSES] },
          },
          select: { lotId: true, quantity: true },
        })
      : [],
    lotIds.length
      ? prisma.fulfillmentInventoryAllocation.findMany({
          where: { lotId: { in: lotIds }, status: "ALLOCATED" },
          select: { lotId: true, quantity: true },
        })
      : [],
    unitIds.length
      ? prisma.orderAllocation.findMany({
          where: {
            itemUnitId: { in: unitIds },
            status: { in: [...RESERVING_ALLOCATION_STATUSES] },
          },
          select: { itemUnitId: true },
        })
      : [],
    unitIds.length
      ? prisma.fulfillmentInventoryAllocation.findMany({
          where: { itemUnitId: { in: unitIds }, status: "ALLOCATED" },
          select: { itemUnitId: true },
        })
      : [],
    purchaseSourceIds.length
      ? prisma.purchaseLine.findMany({
          where: { id: { in: [...new Set(purchaseSourceIds)] } },
          select: { id: true, purchaseOrder: { select: { id: true, orderNo: true } } },
        })
      : [],
  ]);

  const onHandByLotId = new Map(
    lotBalances.map((row) => [row.entityId, new Decimal(row._sum.deltaQty?.toString() ?? "0")])
  );
  const reservedByLotId = new Map<string, Decimal>();
  addReservedQuantity(reservedByLotId, orderReservations);
  addReservedQuantity(reservedByLotId, fulfillmentReservations);
  const reservedUnitIds = new Set([
    ...unitOrderReservations.flatMap((row) => (row.itemUnitId ? [row.itemUnitId] : [])),
    ...unitFulfillmentReservations.flatMap((row) => (row.itemUnitId ? [row.itemUnitId] : [])),
  ]);
  const purchaseBySourceId = new Map(purchaseLines.map((line) => [line.id, line.purchaseOrder]));

  const describeSource = (sourceType: string, sourceId: string, batchLabel?: string | null) => {
    const purchase = sourceType === "PURCHASE" ? purchaseBySourceId.get(sourceId) : null;
    if (purchase) return { label: `采购 ${purchase.orderNo}`, purchaseOrderId: purchase.id };
    if (sourceType === "TRANSFER") return { label: "转运到货", purchaseOrderId: null };
    if (sourceType === "SPLIT") return { label: "拆分库存", purchaseOrderId: null };
    return { label: batchLabel?.trim() || "库存记录", purchaseOrderId: null };
  };

  const candidates: TransferInventoryCandidate[] = [];
  for (const lot of lots) {
    const available = Decimal.max(
      (onHandByLotId.get(lot.id) ?? new Decimal(0)).minus(
        reservedByLotId.get(lot.id) ?? new Decimal(0)
      ),
      0
    );
    if (available.lte(0)) continue;
    const source = describeSource(lot.sourceType, lot.sourceId, lot.batchLabel);
    candidates.push({
      key: `LOT:${lot.id}`,
      entityType: "LOT",
      entityId: lot.id,
      skuId: lot.skuId,
      skuCode: lot.sku.code,
      skuName: lot.sku.name,
      locationId: lot.locationId,
      locationCode: lot.location.code,
      locationName: lot.location.name,
      locationRegion: lot.location.region,
      availableQuantity: available.toString(),
      unitCode: null,
      sourceType: lot.sourceType,
      sourceReference: source.label,
      purchaseOrderId: source.purchaseOrderId,
      receivedAt: lot.receivedAt.toISOString(),
    });
  }
  for (const unit of units) {
    if (reservedUnitIds.has(unit.id)) continue;
    const source = describeSource(unit.sourceType, unit.sourceId);
    candidates.push({
      key: `ITEM_UNIT:${unit.id}`,
      entityType: "ITEM_UNIT",
      entityId: unit.id,
      skuId: unit.skuId,
      skuCode: unit.sku.code,
      skuName: unit.sku.name,
      locationId: unit.locationId,
      locationCode: unit.location.code,
      locationName: unit.location.name,
      locationRegion: unit.location.region,
      availableQuantity: "1",
      unitCode: unit.unitCode ?? unit.id.slice(-8),
      sourceType: unit.sourceType,
      sourceReference: source.label,
      purchaseOrderId: source.purchaseOrderId,
      receivedAt: unit.createdAt.toISOString(),
    });
  }
  return candidates.sort((a, b) =>
    `${a.locationCode}:${a.skuCode}:${a.unitCode ?? ""}:${a.receivedAt ?? ""}`.localeCompare(
      `${b.locationCode}:${b.skuCode}:${b.unitCode ?? ""}:${b.receivedAt ?? ""}`
    )
  );
}

export async function listTransferShipments(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const shipments = await prisma.inboundShipment.findMany({
    where: {
      storeId: context.activeStoreId,
      inventoryLines: { some: {} },
    },
    include: {
      fromLocation: true,
      toLocation: true,
      inventoryLines: { select: { id: true, quantity: true, status: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return shipments.map((shipment) => ({
    id: shipment.id,
    status: shipment.status,
    trackingNo: shipment.trackingNo,
    carrier: shipment.carrier,
    transportMode: shipment.transportMode,
    carriedBy: shipment.carriedBy,
    shippedAt: shipment.shippedAt?.toISOString() ?? null,
    receivedAt: shipment.receivedAt?.toISOString() ?? null,
    createdAt: shipment.createdAt.toISOString(),
    fromLocation: shipment.fromLocation
      ? {
          id: shipment.fromLocation.id,
          code: shipment.fromLocation.code,
          name: shipment.fromLocation.name,
          region: shipment.fromLocation.region,
        }
      : null,
    toLocation: shipment.toLocation
      ? {
          id: shipment.toLocation.id,
          code: shipment.toLocation.code,
          name: shipment.toLocation.name,
          region: shipment.toLocation.region,
        }
      : null,
    lineCount: shipment.inventoryLines.length,
    totalQuantity: shipment.inventoryLines
      .reduce((sum, line) => sum.plus(line.quantity.toString()), new Decimal(0))
      .toString(),
  }));
}

export async function getTransferShipmentById(id: string) {
  const shipment = await prisma.inboundShipment.findUnique({
    where: { id },
    include: {
      fromLocation: true,
      toLocation: true,
      inventoryLines: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!shipment || shipment.inventoryLines.length === 0) return null;
  await requireUserContext({ storeId: shipment.storeId });

  const lotIds = shipment.inventoryLines
    .filter((line) => line.entityType === "LOT")
    .map((line) => line.entityId);
  const unitIds = shipment.inventoryLines
    .filter((line) => line.entityType === "ITEM_UNIT")
    .map((line) => line.entityId);
  const [lots, units, shippingCost] = await Promise.all([
    lotIds.length
      ? prisma.inventoryLot.findMany({
          where: { id: { in: lotIds } },
          select: { id: true, sku: { select: { code: true, name: true } } },
        })
      : [],
    unitIds.length
      ? prisma.itemUnit.findMany({
          where: { id: { in: unitIds } },
          select: { id: true, unitCode: true, sku: { select: { code: true, name: true } } },
        })
      : [],
    prisma.logisticsCost.findUnique({
      where: {
        storeId_sourceType_sourceId_feeType: {
          storeId: shipment.storeId,
          sourceType: LOGISTICS_COST_SOURCE_TYPES.transfer,
          sourceId: shipment.id,
          feeType: "SHIPPING",
        },
      },
      select: { amount: true, currency: true },
    }),
  ]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  return {
    id: shipment.id,
    storeId: shipment.storeId,
    status: shipment.status,
    trackingNo: shipment.trackingNo,
    carrier: shipment.carrier,
    transportMode: shipment.transportMode,
    carriedBy: shipment.carriedBy,
    grossWeightKg: shipment.grossWeightKg?.toString() ?? null,
    etaDate: shipment.etaDate?.toISOString() ?? null,
    shippedAt: shipment.shippedAt?.toISOString() ?? null,
    receivedAt: shipment.receivedAt?.toISOString() ?? null,
    note: shipment.shipmentNote,
    shippingCost: shippingCost?.amount.toString() ?? null,
    shippingCurrency: shippingCost?.currency ?? null,
    fromLocation: shipment.fromLocation
      ? {
          id: shipment.fromLocation.id,
          code: shipment.fromLocation.code,
          name: shipment.fromLocation.name,
          region: shipment.fromLocation.region,
        }
      : null,
    toLocation: shipment.toLocation
      ? {
          id: shipment.toLocation.id,
          code: shipment.toLocation.code,
          name: shipment.toLocation.name,
          region: shipment.toLocation.region,
        }
      : null,
    lines: shipment.inventoryLines.map((line) => {
      const lot = lotById.get(line.entityId);
      const unit = unitById.get(line.entityId);
      return {
        id: line.id,
        entityType: line.entityType,
        entityId: line.entityId,
        quantity: line.quantity.toString(),
        status: line.status,
        skuCode: lot?.sku.code ?? unit?.sku.code ?? "-",
        skuName: lot?.sku.name ?? unit?.sku.name ?? "库存商品",
        unitCode: unit?.unitCode ?? null,
      };
    }),
  };
}

export async function createTransferShipmentAction(input: {
  storeId?: string;
  fromLocationId: string;
  toLocationId: string;
  lines: Array<{
    entityType: "LOT" | "ITEM_UNIT";
    entityId: string;
    quantity: string;
  }>;
  trackingNo?: string;
  carrier?: string;
  transportMode?: DispatchInventoryTransferInput["transportMode"];
  carriedBy?: string;
  grossWeightKg?: string;
  etaDate?: string;
  shippingCost?: string;
  shippingCurrency?: string;
  note?: string;
}) {
  try {
    const context = await requireUserContext(
      input.storeId ? { storeId: input.storeId } : undefined
    );
    if (!input.fromLocationId || !input.toLocationId) {
      throw new Error("请选择起运位置和目标位置");
    }
    if (input.fromLocationId === input.toLocationId) {
      throw new Error("起运位置和目标位置不能相同");
    }
    if (input.lines.length === 0) throw new Error("请至少选择一项要发出的库存");
    const entityKeys = input.lines.map((line) => `${line.entityType}:${line.entityId}`);
    if (new Set(entityKeys).size !== entityKeys.length) {
      throw new Error("转运包裹包含重复库存明细");
    }
    const locations = await prisma.location.findMany({
      where: {
        storeId: context.activeStoreId,
        id: { in: [input.fromLocationId, input.toLocationId] },
      },
      include: { capabilities: { where: { enabled: true }, select: { code: true } } },
    });
    if (locations.length !== 2) throw new Error("起运位置或目标位置不存在");
    const source = locations.find((location) => location.id === input.fromLocationId)!;
    const destination = locations.find((location) => location.id === input.toLocationId)!;
    if (
      source.type === "TRANSIT" ||
      (source.capabilities.length > 0 &&
        !source.capabilities.some((capability) => capability.code === "TRANSFER"))
    ) {
      throw new Error("起运位置未启用转运能力");
    }
    if (
      destination.type === "TRANSIT" ||
      (destination.capabilities.length > 0 &&
        !destination.capabilities.some((capability) => capability.code === "RECEIVE"))
    ) {
      throw new Error("目标位置未启用收货能力");
    }

    const normalizedLines = input.lines.map((line) => {
      const quantity = new Decimal(line.quantity);
      if (!quantity.isFinite() || quantity.lte(0)) throw new Error("发出数量必须大于 0");
      if (line.entityType === "ITEM_UNIT" && !quantity.eq(1)) {
        throw new Error("一物一单商品的发出数量必须为 1");
      }
      return line.entityType === "ITEM_UNIT"
        ? ({ entityType: "ITEM_UNIT", entityId: line.entityId } as const)
        : ({
            entityType: "LOT",
            entityId: line.entityId,
            quantity: quantity.toFixed(4),
          } as const);
    });
    const etaDate = input.etaDate ? new Date(input.etaDate) : undefined;
    if (etaDate && Number.isNaN(etaDate.getTime())) throw new Error("预计到货日期无效");
    const shipment = await dispatchInventoryTransfer({
      storeId: context.activeStoreId,
      fromLocationId: source.id,
      toLocationId: destination.id,
      lines: normalizedLines,
      legIndex: 2,
      trackingNo: input.trackingNo,
      carrier: input.carrier,
      transportMode: input.transportMode,
      carriedBy: input.carriedBy,
      grossWeightKg: input.grossWeightKg,
      etaDate,
      shippingCost: input.shippingCost,
      shippingCurrency: input.shippingCurrency,
      note: input.note,
    });
    revalidatePath("/logistics/transfers");
    return actionSuccess({ shipmentId: shipment.id });
  } catch (error) {
    return toActionFailure(error, "创建转运包裹失败，请重试");
  }
}

export async function confirmTransferShipmentReceiptAction(input: {
  shipmentId: string;
  receivedAt?: string;
  destinationLocationId?: string;
  note?: string;
}) {
  try {
    const shipment = await prisma.inboundShipment.findUnique({
      where: { id: input.shipmentId },
      select: { storeId: true, toLocationId: true },
    });
    if (!shipment) throw new Error("转运包裹不存在");
    await requireUserContext({ storeId: shipment.storeId });
    const destinationLocationId = input.destinationLocationId || shipment.toLocationId;
    if (!destinationLocationId) throw new Error("请选择实际到货位置");
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) throw new Error("到货日期无效");
    await confirmInboundShipmentDelivered(
      input.shipmentId,
      receivedAt,
      input.note,
      destinationLocationId
    );
    revalidatePath("/logistics/transfers");
    revalidatePath(`/logistics/transfers/${input.shipmentId}`);
    return actionSuccess({ shipmentId: input.shipmentId });
  } catch (error) {
    return toActionFailure(error, "确认转运到货失败，请重试");
  }
}
