import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getSkuStockBreakdown } from "@/lib/application/inventory";
import { collectWorkItems } from "@/lib/application/workflow-queries";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  confirmInboundShipmentDelivered,
  dispatchInventoryTransfer,
  dispatchPurchaseTransfer,
} from "@/app/actions/logistics";
import { dispatchSkuLocationStockTransfer } from "@/app/actions/stocktake";
import { submitShipmentArrivalProcessing } from "@/app/actions/workflow-actions";
import { receivePurchaseOrder } from "@/app/actions/purchase-orders";

const runId = `purchase_transfer_${Date.now()}`;
let organizationId = "";
let storeId = "";
let sourceLocationId = "";
let destinationLocationId = "";
let orderId = "";
let lineId = "";
let skuId = "";

describe("purchase disposition transfer inventory", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: `ORG_${runId}`, name: "Purchase Transfer Test" },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: {
        organizationId,
        code: `STORE_${runId}`,
        name: "Purchase Transfer Store",
        currency: "CNY",
      },
    });
    storeId = store.id;
    const [source, destination] = await Promise.all([
      prisma.location.create({
        data: {
          storeId,
          code: `SHA_${runId}`,
          name: "上海仓库",
          type: "WAREHOUSE",
          isSellableDefault: true,
        },
      }),
      prisma.location.create({
        data: {
          storeId,
          code: `FWD_${runId}`,
          name: "转运仓库",
          type: "FORWARDER",
          isSellableDefault: false,
        },
      }),
    ]);
    sourceLocationId = source.id;
    destinationLocationId = destination.id;
    const sku = await prisma.sKU.create({
      data: { storeId, code: `SKU_${runId}`, name: "转运测试商品" },
    });
    skuId = sku.id;
    const order = await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: `PO_${runId}`,
        currency: "CNY",
        subtotal: "200",
        totalAmount: "200",
        status: "RECEIVED",
        receivedAt: new Date(),
        destinationLocationId: sourceLocationId,
      },
    });
    orderId = order.id;
    const line = await prisma.purchaseLine.create({
      data: {
        purchaseOrderId: order.id,
        skuId: sku.id,
        quantity: "2",
        unitPrice: "100",
        lineAmount: "200",
      },
    });
    lineId = line.id;
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it("creates and locks source inventory while the transfer remains in transit", async () => {
    const shipment = await dispatchPurchaseTransfer({
      purchaseOrderId: orderId,
      toLocationId: destinationLocationId,
      trackingNo: `TRACK_${runId}`,
    });

    const [sourceLot, inboundLedgers] = await Promise.all([
      prisma.inventoryLot.findFirstOrThrow({
        where: {
          storeId,
          sourceType: "PURCHASE",
          sourceId: lineId,
          locationId: sourceLocationId,
        },
      }),
      prisma.stockLedger.findMany({
        where: { storeId, refType: "PURCHASE_LINE", refId: lineId },
      }),
    ]);

    expect(shipment).toMatchObject({
      status: "IN_TRANSIT",
      fromLocationId: sourceLocationId,
      toLocationId: destinationLocationId,
      legIndex: 2,
    });
    expect(sourceLot.status).toBe("CONSOLIDATING");
    expect(inboundLedgers.map((row) => row.deltaQty.toString())).toEqual(["2"]);

    await expect(
      dispatchPurchaseTransfer({
        purchaseOrderId: orderId,
        toLocationId: destinationLocationId,
      })
    ).rejects.toThrow("已有未完成的转运物流");

    await confirmInboundShipmentDelivered(
      shipment.id,
      new Date(),
      "转运仓签收",
      destinationLocationId,
    );

    const shipmentLine = await prisma.inboundShipmentInventoryLine.findFirstOrThrow({
      where: { shipmentId: shipment.id, entityType: "LOT" },
    });
    const [receivedShipment, order, consumedSource, destinationLot, transferLedgers] =
      await Promise.all([
        prisma.inboundShipment.findUniqueOrThrow({ where: { id: shipment.id } }),
        prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } }),
        prisma.inventoryLot.findUniqueOrThrow({ where: { id: sourceLot.id } }),
        prisma.inventoryLot.findFirstOrThrow({
          where: {
            id: shipmentLine.destinationEntityId!,
          },
        }),
        prisma.stockLedger.findMany({
          where: { refType: "INBOUND_SHIPMENT", refId: shipment.id },
          orderBy: { reason: "asc" },
        }),
      ]);

    expect(receivedShipment.status).toBe("DELIVERED");
    expect(order.destinationLocationId).toBe(destinationLocationId);
    expect(consumedSource.status).toBe("CONSUMED");
    expect(destinationLot.status).toBe("ACTIVE");
    expect(transferLedgers).toHaveLength(2);
    expect(
      transferLedgers.reduce((sum, row) => sum + Number(row.deltaQty.toString()), 0)
    ).toBe(0);
    expect(
      transferLedgers.map((row) => ({
        reason: row.reason,
        locationId: row.locationId,
        quantity: row.deltaQty.toString(),
      }))
    ).toEqual([
      { reason: "TRANSFER_IN", locationId: destinationLocationId, quantity: "2" },
      { reason: "TRANSFER_OUT", locationId: sourceLocationId, quantity: "-2" },
    ]);

    const workItems = await collectWorkItems(storeId);
    expect(
      workItems.some(
        (item) =>
          item.entityType === "purchaseOrder" &&
          item.entityId === orderId &&
          item.queue === "pendingDisposition" &&
          item.currentStatusLabel === "转运仓待分流",
      ),
    ).toBe(true);

    const nextShipment = await dispatchPurchaseTransfer({
      purchaseOrderId: orderId,
      toLocationId: sourceLocationId,
      trackingNo: `TRACK_BACK_${runId}`,
    });
    const nextLine = await prisma.inboundShipmentInventoryLine.findFirstOrThrow({
      where: { shipmentId: nextShipment.id },
    });
    expect(nextLine.entityId).toBe(destinationLot.id);
    await confirmInboundShipmentDelivered(nextShipment.id);
    await expect(
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } }),
    ).resolves.toMatchObject({ destinationLocationId: sourceLocationId });

    await expect(
      receivePurchaseOrder({
        purchaseOrderId: orderId,
        locationId: destinationLocationId,
        receivedAt: new Date(),
      }),
    ).rejects.toThrow("如需移动商品，请发起转仓物流");
    await expect(
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } }),
    ).resolves.toMatchObject({ destinationLocationId: sourceLocationId });
  });

  it("uses the same transfer aggregate for non-purchase lots and individual units", async () => {
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId,
        locationId: sourceLocationId,
        unitCost: "88",
        costCurrency: "CNY",
        sourceType: "OPENING_STOCK",
        sourceId: `OPENING_${runId}`,
        receivedAt: new Date(),
      },
    });
    const unit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId,
        locationId: sourceLocationId,
        unitCost: "99",
        costCurrency: "CNY",
        sourceType: "SPLIT",
        sourceId: `SPLIT_${runId}`,
      },
    });
    await prisma.stockLedger.createMany({
      data: [
        {
          storeId,
          entityType: "LOT",
          entityId: lot.id,
          locationId: sourceLocationId,
          deltaQty: "3",
          reason: "OPENING_BALANCE",
        },
        {
          storeId,
          entityType: "ITEM_UNIT",
          entityId: unit.id,
          locationId: sourceLocationId,
          deltaQty: "1",
          reason: "SPLIT_IN",
        },
      ],
    });

    const shipment = await dispatchInventoryTransfer({
      storeId,
      fromLocationId: sourceLocationId,
      toLocationId: destinationLocationId,
      lines: [
        { entityType: "LOT", entityId: lot.id, quantity: "3" },
        { entityType: "ITEM_UNIT", entityId: unit.id },
      ],
      trackingNo: `GENERIC_${runId}`,
      shippingCost: "18.5",
      shippingCurrency: "CNY",
    });
    const [lockedLines, logisticsCost] = await Promise.all([
      prisma.inboundShipmentInventoryLine.findMany({
        where: { shipmentId: shipment.id },
        orderBy: { entityType: "asc" },
      }),
      prisma.logisticsCost.findUnique({
        where: {
          storeId_sourceType_sourceId_feeType: {
            storeId,
            sourceType: "INBOUND_SHIPMENT",
            sourceId: shipment.id,
            feeType: "SHIPPING",
          },
        },
      }),
    ]);
    expect(lockedLines.map((line) => line.entityType)).toEqual(["ITEM_UNIT", "LOT"]);
    expect(logisticsCost).toMatchObject({ currency: "CNY" });
    expect(logisticsCost?.amount.toString()).toBe("18.5");
    const inTransitStock = await getSkuStockBreakdown(storeId, skuId);
    expect(inTransitStock.inTransitQty).toBeGreaterThanOrEqual(4);
    expect(
      inTransitStock.inTransitLocations.some((location) =>
        location.name.includes("上海仓库 → 转运仓库（转运中）"),
      ),
    ).toBe(true);

    await confirmInboundShipmentDelivered(shipment.id);

    const [receivedLines, receivedUnit] = await Promise.all([
      prisma.inboundShipmentInventoryLine.findMany({
        where: { shipmentId: shipment.id },
      }),
      prisma.itemUnit.findUniqueOrThrow({ where: { id: unit.id } }),
    ]);
    expect(receivedLines.every((line) => line.status === "RECEIVED")).toBe(true);
    expect(receivedLines.every((line) => Boolean(line.destinationEntityId))).toBe(true);
    expect(receivedUnit).toMatchObject({
      locationId: destinationLocationId,
      status: "AVAILABLE",
    });

    const arrivedStock = await getSkuStockBreakdown(storeId, skuId);
    expect(arrivedStock.inTransitQty).toBe(0);
    expect(arrivedStock.heldQty).toBeGreaterThanOrEqual(4);
    expect(
      arrivedStock.heldLocations.some(
        (location) => location.locationId === destinationLocationId && location.qty >= 4,
      ),
    ).toBe(true);
  });

  it("can start a partial logistics transfer from ordinary inventory at any time", async () => {
    const sku = await prisma.sKU.create({
      data: { storeId, code: `ANYTIME_${runId}`, name: "随时转仓商品" },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sourceLocationId,
        unitCost: "50",
        costCurrency: "CNY",
        sourceType: "OPENING_STOCK",
        sourceId: `ANYTIME_OPENING_${runId}`,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: sourceLocationId,
        deltaQty: "5",
        reason: "OPENING_BALANCE",
      },
    });

    const transfer = await dispatchSkuLocationStockTransfer({
      storeId,
      skuId: sku.id,
      fromLocationId: sourceLocationId,
      toLocationId: destinationLocationId,
      quantity: 2,
      trackingNo: `ANYTIME_TRACK_${runId}`,
    });
    const shipmentLine = await prisma.inboundShipmentInventoryLine.findFirstOrThrow({
      where: { shipmentId: transfer.shipmentId },
    });
    expect(shipmentLine.entityId).not.toBe(lot.id);
    expect(shipmentLine.quantity.toString()).toBe("2");

    const sourceBalance = await prisma.stockLedger.aggregate({
      where: { entityType: "LOT", entityId: lot.id },
      _sum: { deltaQty: true },
    });
    expect(sourceBalance._sum.deltaQty?.toString()).toBe("3");

    await submitShipmentArrivalProcessing("shipment", transfer.shipmentId, {
      result: "PASSED",
      inboundLocationId: destinationLocationId,
      note: "普通库存转仓签收",
    });
    const receivedLine = await prisma.inboundShipmentInventoryLine.findUniqueOrThrow({
      where: { id: shipmentLine.id },
    });
    const destinationBalance = await prisma.stockLedger.aggregate({
      where: { entityType: "LOT", entityId: receivedLine.destinationEntityId! },
      _sum: { deltaQty: true },
    });
    expect(destinationBalance._sum.deltaQty?.toString()).toBe("2");
  });
});
