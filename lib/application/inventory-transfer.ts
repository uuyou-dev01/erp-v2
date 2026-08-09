import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";

export type InventoryTransferLineInput =
  | { entityType: "LOT"; entityId: string; quantity: string }
  | { entityType: "ITEM_UNIT"; entityId: string; quantity?: "1" };

async function getLotOnHand(tx: Prisma.TransactionClient, lotId: string) {
  const total = await tx.stockLedger.aggregate({
    where: { entityType: "LOT", entityId: lotId },
    _sum: { deltaQty: true },
  });
  return new Decimal(total._sum.deltaQty?.toString() ?? "0");
}

export async function lockInventoryForShipment(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string;
    storeId: string;
    fromLocationId: string;
    lines: InventoryTransferLineInput[];
  },
) {
  if (input.lines.length === 0) throw new Error("调拨单没有库存明细");
  const lotLines = input.lines.filter(
    (line): line is Extract<InventoryTransferLineInput, { entityType: "LOT" }> =>
      line.entityType === "LOT",
  );
  const unitLines = input.lines.filter(
    (line): line is Extract<InventoryTransferLineInput, { entityType: "ITEM_UNIT" }> =>
      line.entityType === "ITEM_UNIT",
  );
  const [lots, units] = await Promise.all([
    tx.inventoryLot.findMany({
      where: {
        id: { in: lotLines.map((line) => line.entityId) },
        storeId: input.storeId,
        locationId: input.fromLocationId,
        status: "ACTIVE",
      },
    }),
    tx.itemUnit.findMany({
      where: {
        id: { in: unitLines.map((line) => line.entityId) },
        storeId: input.storeId,
        locationId: input.fromLocationId,
        status: "AVAILABLE",
      },
    }),
  ]);
  if (lots.length !== lotLines.length || units.length !== unitLines.length) {
    throw new Error("部分调拨库存不在起运仓、已锁定或不可用");
  }

  const reservations = await tx.orderAllocation.count({
    where: {
      status: { in: [...RESERVING_ALLOCATION_STATUSES] },
      OR: [
        ...(lots.length ? [{ lotId: { in: lots.map((lot) => lot.id) } }] : []),
        ...(units.length ? [{ itemUnitId: { in: units.map((unit) => unit.id) } }] : []),
      ],
    },
  });
  if (reservations > 0) throw new Error("调拨库存已被销售单占用");

  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const resolvedLotLines: InventoryTransferLineInput[] = [];
  for (const line of lotLines) {
    const requested = new Decimal(line.quantity);
    const available = await getLotOnHand(tx, line.entityId);
    if (!requested.isFinite() || requested.lte(0) || requested.gt(available)) {
      throw new Error(`批次可调数量不足（当前 ${available.toString()}）`);
    }
    if (requested.eq(available)) {
      await tx.inventoryLot.update({
        where: { id: line.entityId },
        data: { status: "CONSOLIDATING" },
      });
      resolvedLotLines.push(line);
      continue;
    }

    const source = lotById.get(line.entityId)!;
    const splitLot = await tx.inventoryLot.create({
      data: {
        storeId: source.storeId,
        inventoryPoolId: source.inventoryPoolId,
        skuId: source.skuId,
        locationId: source.locationId,
        unitCost: source.unitCost,
        costCurrency: source.costCurrency,
        fxRateId: source.fxRateId,
        sourceType: "SPLIT",
        sourceId: input.shipmentId,
        receivedAt: new Date(),
        batchLabel: source.batchLabel,
        status: "CONSOLIDATING",
      },
    });
    const meta = {
      shipmentId: input.shipmentId,
      sourceLotId: source.id,
      splitLotId: splitLot.id,
    };
    await tx.stockLedger.createMany({
      data: [
        {
          storeId: source.storeId,
          inventoryPoolId: source.inventoryPoolId,
          entityType: "LOT",
          entityId: source.id,
          locationId: source.locationId,
          deltaQty: requested.negated().toFixed(4),
          reason: "SPLIT_OUT",
          refType: "INBOUND_SHIPMENT",
          refId: input.shipmentId,
          meta,
        },
        {
          storeId: source.storeId,
          inventoryPoolId: source.inventoryPoolId,
          entityType: "LOT",
          entityId: splitLot.id,
          locationId: source.locationId,
          deltaQty: requested.toFixed(4),
          reason: "SPLIT_IN",
          refType: "INBOUND_SHIPMENT",
          refId: input.shipmentId,
          meta,
        },
      ],
    });
    resolvedLotLines.push({
      entityType: "LOT",
      entityId: splitLot.id,
      quantity: requested.toFixed(4),
    });
  }

  await Promise.all([
    tx.itemUnit.updateMany({
      where: { id: { in: units.map((unit) => unit.id) } },
      data: { status: "CONSOLIDATING" },
    }),
    tx.inboundShipmentInventoryLine.createMany({
      data: [...resolvedLotLines, ...unitLines].map((line) => ({
        shipmentId: input.shipmentId,
        entityType: line.entityType,
        entityId: line.entityId,
        quantity: line.entityType === "ITEM_UNIT" ? "1" : line.quantity,
      })),
    }),
  ]);
}

export async function receiveInventoryFromShipment(
  tx: Prisma.TransactionClient,
  input: {
    shipmentId: string;
    storeId: string;
    fromLocationId: string;
    toLocationId: string;
    receivedAt: Date;
  },
) {
  const lines = await tx.inboundShipmentInventoryLine.findMany({
    where: { shipmentId: input.shipmentId, status: "IN_TRANSIT" },
    orderBy: { createdAt: "asc" },
  });
  if (lines.length === 0) throw new Error("物流段没有待接收的库存明细");

  for (const line of lines) {
    if (line.entityType === "LOT") {
      const lot = await tx.inventoryLot.findFirst({
        where: {
          id: line.entityId,
          storeId: input.storeId,
          locationId: input.fromLocationId,
          status: "CONSOLIDATING",
        },
      });
      if (!lot) throw new Error("批次库存已变化，无法确认调拨到货");
      const quantity = new Decimal(line.quantity.toString());
      const onHand = await getLotOnHand(tx, lot.id);
      if (!quantity.eq(onHand)) throw new Error("批次库存数量已变化，无法确认调拨到货");

      const destinationLot = await tx.inventoryLot.create({
        data: {
          storeId: lot.storeId,
          inventoryPoolId: lot.inventoryPoolId,
          skuId: lot.skuId,
          locationId: input.toLocationId,
          unitCost: lot.unitCost,
          costCurrency: lot.costCurrency,
          fxRateId: lot.fxRateId,
          sourceType: "TRANSFER",
          sourceId: line.id,
          receivedAt: input.receivedAt,
          batchLabel: lot.batchLabel,
          status: "ACTIVE",
        },
      });
      const meta = {
        shipmentId: input.shipmentId,
        shipmentInventoryLineId: line.id,
        sourceLotId: lot.id,
        destinationLotId: destinationLot.id,
      };
      await tx.stockLedger.createMany({
        data: [
          {
            storeId: lot.storeId,
            inventoryPoolId: lot.inventoryPoolId,
            occurredAt: input.receivedAt,
            entityType: "LOT",
            entityId: lot.id,
            locationId: input.fromLocationId,
            deltaQty: quantity.negated().toFixed(4),
            reason: "TRANSFER_OUT",
            refType: "INBOUND_SHIPMENT",
            refId: input.shipmentId,
            meta,
          },
          {
            storeId: lot.storeId,
            inventoryPoolId: lot.inventoryPoolId,
            occurredAt: input.receivedAt,
            entityType: "LOT",
            entityId: destinationLot.id,
            locationId: input.toLocationId,
            deltaQty: quantity.toFixed(4),
            reason: "TRANSFER_IN",
            refType: "INBOUND_SHIPMENT",
            refId: input.shipmentId,
            meta,
          },
        ],
      });
      await Promise.all([
        tx.inventoryLot.update({ where: { id: lot.id }, data: { status: "CONSUMED" } }),
        tx.inboundShipmentInventoryLine.update({
          where: { id: line.id },
          data: { status: "RECEIVED", destinationEntityId: destinationLot.id },
        }),
      ]);
      continue;
    }

    if (line.entityType !== "ITEM_UNIT" || !new Decimal(line.quantity.toString()).eq(1)) {
      throw new Error("物流段包含不支持的库存明细");
    }
    const unit = await tx.itemUnit.findFirst({
      where: {
        id: line.entityId,
        storeId: input.storeId,
        locationId: input.fromLocationId,
        status: "CONSOLIDATING",
      },
    });
    if (!unit) throw new Error("单品库存已变化，无法确认调拨到货");
    const meta = { shipmentId: input.shipmentId, shipmentInventoryLineId: line.id };
    await Promise.all([
      tx.itemUnit.update({
        where: { id: unit.id },
        data: { locationId: input.toLocationId, status: "AVAILABLE" },
      }),
      tx.stockLedger.createMany({
        data: [
          {
            storeId: unit.storeId,
            inventoryPoolId: unit.inventoryPoolId,
            occurredAt: input.receivedAt,
            entityType: "ITEM_UNIT",
            entityId: unit.id,
            locationId: input.fromLocationId,
            deltaQty: "-1.0000",
            reason: "TRANSFER_OUT",
            refType: "INBOUND_SHIPMENT",
            refId: input.shipmentId,
            meta,
          },
          {
            storeId: unit.storeId,
            inventoryPoolId: unit.inventoryPoolId,
            occurredAt: input.receivedAt,
            entityType: "ITEM_UNIT",
            entityId: unit.id,
            locationId: input.toLocationId,
            deltaQty: "1.0000",
            reason: "TRANSFER_IN",
            refType: "INBOUND_SHIPMENT",
            refId: input.shipmentId,
            meta,
          },
        ],
      }),
      tx.inboundShipmentInventoryLine.update({
        where: { id: line.id },
        data: { status: "RECEIVED", destinationEntityId: unit.id },
      }),
    ]);
  }
}
