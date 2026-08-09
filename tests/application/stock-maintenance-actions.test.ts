import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  dispatchSkuLocationStockTransfer,
  listTransferableInventoryRows,
  recordOtherLocationStock,
  transferSkuLocationStock,
} from "@/app/actions/stocktake";

const runId = `stock_maintenance_${Date.now()}`;
let organizationId = "";
let storeId = "";
let sourceLocationId = "";
let destinationLocationId = "";
let entryLocationId = "";

describe("stock maintenance actions", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: `ORG_${runId}`,
        name: "Stock Maintenance Test",
      },
    });
    organizationId = organization.id;

    const store = await prisma.store.create({
      data: {
        organizationId,
        code: `STORE_${runId}`,
        name: "Stock Maintenance Store",
        currency: "CNY",
      },
    });
    storeId = store.id;

    const [source, destination, entry] = await Promise.all([
      prisma.location.create({
        data: {
          storeId,
          code: `SRC_${runId}`,
          name: "原仓",
          type: "WAREHOUSE",
        },
      }),
      prisma.location.create({
        data: {
          storeId,
          code: `DST_${runId}`,
          name: "目标仓",
          type: "WAREHOUSE",
        },
      }),
      prisma.location.create({
        data: {
          storeId,
          code: `ENTRY_${runId}`,
          name: "补录仓",
          type: "WAREHOUSE",
        },
      }),
    ]);
    sourceLocationId = source.id;
    destinationLocationId = destination.id;
    entryLocationId = entry.id;
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it("records a missing warehouse balance as an audited ADJUST entry", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `ENTRY_SKU_${runId}`,
        name: "漏录库存测试商品",
      },
    });

    const entry = await recordOtherLocationStock({
      storeId,
      skuId: sku.id,
      locationId: entryLocationId,
      quantity: 4,
      unitCost: "80.75",
      currency: "cny",
      reason: "MISSED_ENTRY",
      notes: "仓库实物核对后补录",
      operator: "tester",
    });

    const [lot, ledger] = await Promise.all([
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: entry.lotId } }),
      prisma.stockLedger.findFirstOrThrow({
        where: {
          entityType: "LOT",
          entityId: entry.lotId,
        },
      }),
    ]);

    expect(lot).toMatchObject({
      skuId: sku.id,
      locationId: entryLocationId,
      sourceType: "ADJUSTMENT",
      costCurrency: "CNY",
      status: "ACTIVE",
    });
    expect(ledger).toMatchObject({
      locationId: entryLocationId,
      reason: "ADJUST",
      refType: "STOCK_ADJUSTMENT",
    });
    expect(ledger.deltaQty.toString()).toBe("4");

    await expect(
      recordOtherLocationStock({
        storeId,
        skuId: sku.id,
        locationId: entryLocationId,
        quantity: 1,
        unitCost: "80.75",
        currency: "CNY",
        reason: "OTHER",
      })
    ).rejects.toThrow("已有库存");
  });

  it("moves FIFO lot stock with balanced transfer ledgers and preserved cost", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `TRANSFER_SKU_${runId}`,
        name: "仓间调拨测试商品",
      },
    });
    const sourceLot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sourceLocationId,
        unitCost: "125.50",
        costCurrency: "JPY",
        sourceType: "PURCHASE",
        sourceId: `PO_${runId}`,
        receivedAt: new Date("2026-07-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: sourceLot.id,
        locationId: sourceLocationId,
        deltaQty: "5",
        reason: "INBOUND_PURCHASE",
      },
    });

    const transfer = await transferSkuLocationStock({
      storeId,
      skuId: sku.id,
      fromLocationId: sourceLocationId,
      toLocationId: destinationLocationId,
      quantity: 3,
      notes: "测试调拨",
      operator: "tester",
    });

    expect(transfer.moved).toHaveLength(1);
    const destinationLotId = transfer.moved[0]?.destinationLotId;
    expect(destinationLotId).toBeTruthy();

    const [sourceAfter, destinationLot, ledgers] = await Promise.all([
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: sourceLot.id } }),
      prisma.inventoryLot.findUniqueOrThrow({
        where: { id: destinationLotId },
      }),
      prisma.stockLedger.findMany({
        where: {
          refType: "INVENTORY_TRANSFER",
          refId: transfer.operationId,
        },
        orderBy: { reason: "asc" },
      }),
    ]);

    expect(sourceAfter.status).toBe("ACTIVE");
    expect(destinationLot).toMatchObject({
      skuId: sku.id,
      locationId: destinationLocationId,
      sourceType: "TRANSFER",
      costCurrency: "JPY",
    });
    expect(destinationLot.unitCost.toString()).toBe("125.5");
    expect(ledgers).toHaveLength(2);
    expect(ledgers.reduce((sum, ledger) => sum + Number(ledger.deltaQty.toString()), 0)).toBe(0);
    expect(
      ledgers.map((ledger) => ({
        reason: ledger.reason,
        locationId: ledger.locationId,
        quantity: ledger.deltaQty.toString(),
      }))
    ).toEqual([
      {
        reason: "TRANSFER_IN",
        locationId: destinationLocationId,
        quantity: "3",
      },
      {
        reason: "TRANSFER_OUT",
        locationId: sourceLocationId,
        quantity: "-3",
      },
    ]);

    await expect(
      transferSkuLocationStock({
        storeId,
        skuId: sku.id,
        fromLocationId: sourceLocationId,
        toLocationId: destinationLocationId,
        quantity: 3,
      })
    ).rejects.toThrow("可调拨库存不足");
  });

  it("does not transfer quantity reserved by an active order allocation", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `RESERVED_SKU_${runId}`,
        name: "订单占用库存测试商品",
      },
    });
    const sourceLot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sourceLocationId,
        unitCost: "50",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: `PO_RESERVED_${runId}`,
        receivedAt: new Date(),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: sourceLot.id,
        locationId: sourceLocationId,
        deltaQty: "5",
        reason: "INBOUND_PURCHASE",
      },
    });
    const order = await prisma.customerOrder.create({
      data: {
        storeId,
        orderNumber: `ORDER_${runId}`,
        customerName: "测试客户",
        orderDate: new Date(),
        currency: "CNY",
        subtotal: "200",
        totalPaid: "200",
        lines: {
          create: {
            skuId: sku.id,
            quantity: "4",
            unitPrice: "50",
            lineAmount: "200",
          },
        },
      },
      include: { lines: true },
    });
    await prisma.orderAllocation.create({
      data: {
        orderLineId: order.lines[0]!.id,
        allocationType: "LOT",
        lotId: sourceLot.id,
        quantity: "4",
        unitCost: "50",
        costAmount: "200",
        status: "ALLOCATED",
      },
    });

    await expect(
      transferSkuLocationStock({
        storeId,
        skuId: sku.id,
        fromLocationId: sourceLocationId,
        toLocationId: destinationLocationId,
        quantity: 2,
      })
    ).rejects.toThrow("可调拨库存不足：可调 1，本次需要 2");
  });

  it("lists and moves the exact ItemUnit instead of hiding it from warehouse transfer", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `UNIT_TRANSFER_${runId}`,
        name: "一物一单转仓测试商品",
      },
    });
    const unit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sourceLocationId,
        unitCost: "1800",
        costCurrency: "CNY",
        unitCode: `IU_${runId}`,
        sourceType: "PURCHASE",
        sourceId: `PURCHASE_LINE_${runId}`,
        status: "AVAILABLE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "ITEM_UNIT",
        entityId: unit.id,
        locationId: sourceLocationId,
        deltaQty: "1",
        reason: "INBOUND_PURCHASE",
      },
    });

    const rows = await listTransferableInventoryRows({ storeId, q: sku.code });
    expect(rows).toEqual([
      expect.objectContaining({
        entityType: "ITEM_UNIT",
        itemUnitId: unit.id,
        unitCode: unit.unitCode,
        bookQty: 1,
      }),
    ]);

    const transfer = await transferSkuLocationStock({
      storeId,
      skuId: sku.id,
      itemUnitId: unit.id,
      fromLocationId: sourceLocationId,
      toLocationId: destinationLocationId,
      quantity: 1,
    });
    const moved = await prisma.itemUnit.findUniqueOrThrow({ where: { id: unit.id } });
    const ledgers = await prisma.stockLedger.findMany({
      where: { refType: "INVENTORY_TRANSFER", refId: transfer.operationId },
    });
    expect(moved.locationId).toBe(destinationLocationId);
    expect(ledgers.map((row) => Number(row.deltaQty)).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("dispatches an exact ItemUnit as hand carry and keeps it in transit until receipt", async () => {
    const sku = await prisma.sKU.create({
      data: { storeId, code: `HAND_CARRY_${runId}`, name: "随身携带测试商品" },
    });
    const unit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sourceLocationId,
        unitCost: "900",
        costCurrency: "JPY",
        unitCode: `HAND_${runId}`,
        sourceType: "PURCHASE",
        sourceId: `HAND_LINE_${runId}`,
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "ITEM_UNIT",
        entityId: unit.id,
        locationId: sourceLocationId,
        deltaQty: "1",
        reason: "INBOUND_PURCHASE",
      },
    });

    const transfer = await dispatchSkuLocationStockTransfer({
      storeId,
      skuId: sku.id,
      itemUnitId: unit.id,
      fromLocationId: sourceLocationId,
      toLocationId: destinationLocationId,
      quantity: 1,
      transportMode: "HAND_CARRY",
      carriedBy: "我本人",
    });
    const [shipment, locked, line] = await Promise.all([
      prisma.inboundShipment.findUniqueOrThrow({ where: { id: transfer.shipmentId } }),
      prisma.itemUnit.findUniqueOrThrow({ where: { id: unit.id } }),
      prisma.inboundShipmentInventoryLine.findFirstOrThrow({
        where: { shipmentId: transfer.shipmentId },
      }),
    ]);
    expect(shipment).toMatchObject({
      transportMode: "HAND_CARRY",
      carriedBy: "我本人",
      status: "IN_TRANSIT",
    });
    expect(locked).toMatchObject({ locationId: sourceLocationId, status: "CONSOLIDATING" });
    expect(line).toMatchObject({ entityType: "ITEM_UNIT", entityId: unit.id });
  });
});
