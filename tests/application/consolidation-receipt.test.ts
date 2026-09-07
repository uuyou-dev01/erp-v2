import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  addInventoryToConsolidationBatch,
  addPurchaseOrderToConsolidation,
  createConsolidationForPurchaseOrders,
  getConsolidationBatchById,
  repairConsolidationOriginInventory,
  updateConsolidationDestination,
  updateConsolidationStatus,
} from "@/app/actions/consolidations";
import { confirmInboundShipmentDelivered, dispatchPurchaseTransfer } from "@/app/actions/logistics";

const runId = `consolidation_${Date.now()}`;
let organizationId = "";
let storeId = "";
let sourceLocationId = "";
let destinationLocationId = "";
let sourceLotId = "";
let batchId = "";

describe("consolidation receipt inventory transfer", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: `ORG_${runId}`, name: "Consolidation Test" },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: {
        organizationId,
        code: `STORE_${runId}`,
        name: "Consolidation Store",
        currency: "CNY",
      },
    });
    storeId = store.id;
    const [source, destination] = await Promise.all([
      prisma.location.create({
        data: {
          storeId,
          code: `SRC_${runId}`,
          name: "日本转运仓",
          type: "FORWARDER",
        },
      }),
      prisma.location.create({
        data: {
          storeId,
          code: `DST_${runId}`,
          name: "中国主仓",
          type: "WAREHOUSE",
        },
      }),
    ]);
    sourceLocationId = source.id;
    destinationLocationId = destination.id;
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}`,
        name: "集运测试商品",
      },
    });
    const order = await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: `PO_${runId}`,
        currency: "JPY",
        subtotal: "3000",
        totalAmount: "3000",
        status: "RECEIVED",
        destinationLocationId: sourceLocationId,
      },
    });
    const purchaseLine = await prisma.purchaseLine.create({
      data: {
        purchaseOrderId: order.id,
        skuId: sku.id,
        quantity: "3",
        unitPrice: "1000",
        lineAmount: "3000",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sourceLocationId,
        unitCost: "1000",
        costCurrency: "JPY",
        sourceType: "PURCHASE",
        sourceId: purchaseLine.id,
        receivedAt: new Date(),
      },
    });
    sourceLotId = lot.id;
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: sourceLocationId,
        deltaQty: "3",
        reason: "INBOUND_PURCHASE",
        refType: "PURCHASE_LINE",
        refId: purchaseLine.id,
      },
    });
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId,
        fromLocationId: sourceLocationId,
        toLocationId: destinationLocationId,
        status: "SHIPPED",
        lines: {
          create: {
            sourceType: "PURCHASE_LINE",
            sourceId: purchaseLine.id,
            quantity: "3",
          },
        },
      },
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it("moves all stock and writes balanced transfer ledgers on receipt", async () => {
    const serialized = await getConsolidationBatchById(batchId);
    expect(serialized?.lines[0]).toMatchObject({
      quantity: "3",
      displayTitle: "集运测试商品",
      skuCode: `SKU_${runId}`,
      sourceReference: `PO_${runId}`,
    });

    await updateConsolidationStatus(batchId, "RECEIVED");

    const [batch, sourceLot, destinationLot, transferLedgers] = await Promise.all([
      prisma.consolidationBatch.findUniqueOrThrow({ where: { id: batchId } }),
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: sourceLotId } }),
      prisma.inventoryLot.findFirstOrThrow({
        where: {
          storeId,
          locationId: destinationLocationId,
          sourceType: "TRANSFER",
        },
      }),
      prisma.stockLedger.findMany({
        where: {
          refType: "CONSOLIDATION_BATCH",
          refId: batchId,
        },
        orderBy: { reason: "asc" },
      }),
    ]);

    expect(batch.status).toBe("RECEIVED");
    expect(batch.receivedAt).not.toBeNull();
    expect(sourceLot.status).toBe("CONSUMED");
    expect(destinationLot.status).toBe("ACTIVE");
    expect(transferLedgers).toHaveLength(2);
    expect(
      transferLedgers.reduce((sum, ledger) => sum + Number(ledger.deltaQty.toString()), 0)
    ).toBe(0);
    expect(
      transferLedgers.map((ledger) => ({
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

    await expect(updateConsolidationStatus(batchId, "RECEIVED")).rejects.toThrow(
      "当前状态不可确认到货"
    );
    expect(
      await prisma.stockLedger.count({
        where: { refType: "CONSOLIDATION_BATCH", refId: batchId },
      })
    ).toBe(2);
  });
});

describe("purchase order consolidation preparation", () => {
  const preparationRunId = `consolidation_prepare_${Date.now()}`;
  let preparationOrganizationId = "";
  let preparationStoreId = "";
  let preparationSourceLocationId = "";
  let preparationDestinationLocationId = "";
  let preparationWrongLocationId = "";
  let preparationSkuId = "";

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: `ORG_${preparationRunId}`,
        name: "Consolidation Preparation Test",
      },
    });
    preparationOrganizationId = organization.id;
    const store = await prisma.store.create({
      data: {
        organizationId: preparationOrganizationId,
        code: `STORE_${preparationRunId}`,
        name: "Consolidation Preparation Store",
        currency: "CNY",
      },
    });
    preparationStoreId = store.id;
    const [source, destination, wrongLocation] = await Promise.all([
      prisma.location.create({
        data: {
          storeId: preparationStoreId,
          code: `SRC_${preparationRunId}`,
          name: "上海转运仓",
          type: "FORWARDER",
        },
      }),
      prisma.location.create({
        data: {
          storeId: preparationStoreId,
          code: `DST_${preparationRunId}`,
          name: "日本主仓",
          type: "WAREHOUSE",
        },
      }),
      prisma.location.create({
        data: {
          storeId: preparationStoreId,
          code: `WRONG_${preparationRunId}`,
          name: "上海家庭仓",
          type: "WAREHOUSE",
        },
      }),
    ]);
    preparationSourceLocationId = source.id;
    preparationDestinationLocationId = destination.id;
    preparationWrongLocationId = wrongLocation.id;
    const sku = await prisma.sKU.create({
      data: {
        storeId: preparationStoreId,
        code: `SKU_${preparationRunId}`,
        name: "自动入库并锁定商品",
      },
    });
    preparationSkuId = sku.id;
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: preparationStoreId } });
    await prisma.organization.deleteMany({
      where: { id: preparationOrganizationId },
    });
  });

  async function createReceivedOrder(input: {
    orderNo: string;
    locationId: string;
    quantity?: string;
  }) {
    return prisma.purchaseOrder.create({
      data: {
        storeId: preparationStoreId,
        orderNo: input.orderNo,
        currency: "CNY",
        subtotal: "200",
        totalAmount: "200",
        status: "RECEIVED",
        receivedAt: new Date(),
        destinationLocationId: input.locationId,
        lines: {
          create: {
            skuId: preparationSkuId,
            quantity: input.quantity ?? "2",
            unitPrice: "100",
            lineAmount: "200",
          },
        },
      },
      include: { lines: true },
    });
  }

  it("materializes and locks purchase inventory before joining a batch", async () => {
    const order = await createReceivedOrder({
      orderNo: `PO_LOCK_${preparationRunId}`,
      locationId: preparationSourceLocationId,
    });
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId: preparationStoreId,
        fromLocationId: preparationSourceLocationId,
        toLocationId: preparationDestinationLocationId,
      },
    });

    const result = await addPurchaseOrderToConsolidation({
      batchId: batch.id,
      purchaseOrderId: order.id,
    });

    expect(result).toMatchObject({ success: 1, failed: 0, errors: [] });
    const [line, lot, inboundLedger] = await Promise.all([
      prisma.consolidationBatchLine.findFirstOrThrow({
        where: {
          batchId: batch.id,
          sourceType: "PURCHASE_LINE",
          sourceId: order.lines[0].id,
        },
      }),
      prisma.inventoryLot.findFirstOrThrow({
        where: {
          sourceType: "PURCHASE",
          sourceId: order.lines[0].id,
        },
      }),
      prisma.stockLedger.findFirstOrThrow({
        where: {
          refType: "PURCHASE_LINE",
          refId: order.lines[0].id,
          reason: "INBOUND_PURCHASE",
        },
      }),
    ]);
    expect(line.quantity.toString()).toBe("2");
    expect(lot).toMatchObject({
      locationId: preparationSourceLocationId,
      status: "CONSOLIDATING",
    });
    expect(inboundLedger.deltaQty.toString()).toBe("2");

    await updateConsolidationStatus(batch.id, "SEALED");
    await updateConsolidationStatus(batch.id, "SHIPPED");
    await updateConsolidationStatus(batch.id, "RECEIVED");

    const [receivedBatch, sourceLot, destinationLot] = await Promise.all([
      prisma.consolidationBatch.findUniqueOrThrow({ where: { id: batch.id } }),
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } }),
      prisma.inventoryLot.findFirstOrThrow({
        where: {
          sourceType: "TRANSFER",
          sourceId: line.id,
          locationId: preparationDestinationLocationId,
        },
      }),
    ]);
    expect(receivedBatch.status).toBe("RECEIVED");
    expect(sourceLot.status).toBe("CONSUMED");
    expect(destinationLot.status).toBe("ACTIVE");
  });

  it("splits only the selected quantity and keeps the rest at the origin", async () => {
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId: preparationStoreId,
        skuId: preparationSkuId,
        locationId: preparationSourceLocationId,
        unitCost: "40",
        costCurrency: "CNY",
        sourceType: "MANUAL",
        sourceId: `PARTIAL_${preparationRunId}`,
        receivedAt: new Date(),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId: preparationStoreId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: preparationSourceLocationId,
        deltaQty: "5",
        reason: "ADJUSTMENT",
        refType: "TEST",
        refId: lot.id,
      },
    });
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId: preparationStoreId,
        fromLocationId: preparationSourceLocationId,
        toLocationId: preparationDestinationLocationId,
      },
    });

    await expect(
      addInventoryToConsolidationBatch({
        batchId: batch.id,
        lines: [{ entityType: "LOT", entityId: lot.id, quantity: "2" }],
      })
    ).resolves.toMatchObject({ batchId: batch.id, added: 1 });

    const line = await prisma.consolidationBatchLine.findFirstOrThrow({
      where: { batchId: batch.id, sourceType: "LOT" },
    });
    const splitLot = await prisma.inventoryLot.findUniqueOrThrow({
      where: { id: line.sourceId },
    });
    const [originBalance, splitBalance] = await Promise.all([
      prisma.stockLedger.aggregate({
        where: { entityType: "LOT", entityId: lot.id },
        _sum: { deltaQty: true },
      }),
      prisma.stockLedger.aggregate({
        where: { entityType: "LOT", entityId: splitLot.id },
        _sum: { deltaQty: true },
      }),
    ]);
    expect(line.quantity.toString()).toBe("2");
    expect(lot.id).not.toBe(splitLot.id);
    expect(splitLot).toMatchObject({
      locationId: preparationSourceLocationId,
      sourceType: "SPLIT",
      sourceId: batch.id,
      status: "CONSOLIDATING",
    });
    expect(originBalance._sum.deltaQty?.toString()).toBe("3");
    expect(splitBalance._sum.deltaQty?.toString()).toBe("2");
    await expect(
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })
    ).resolves.toMatchObject({ status: "ACTIVE" });

    await updateConsolidationStatus(batch.id, "SEALED");
    await updateConsolidationStatus(batch.id, "SHIPPED");
    await updateConsolidationStatus(batch.id, "RECEIVED");

    const destinationLot = await prisma.inventoryLot.findFirstOrThrow({
      where: {
        storeId: preparationStoreId,
        locationId: preparationDestinationLocationId,
        sourceType: "TRANSFER",
        sourceId: line.id,
      },
    });
    const destinationBalance = await prisma.stockLedger.aggregate({
      where: { entityType: "LOT", entityId: destinationLot.id },
      _sum: { deltaQty: true },
    });
    expect(destinationBalance._sum.deltaQty?.toString()).toBe("2");
    await expect(
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })
    ).resolves.toMatchObject({ status: "ACTIVE", locationId: preparationSourceLocationId });
  });

  it("requires a destination for purchase consolidation and before sealing", async () => {
    const order = await createReceivedOrder({
      orderNo: `PO_ROUTE_REQUIRED_${preparationRunId}`,
      locationId: preparationSourceLocationId,
    });
    const before = await prisma.consolidationBatch.count({
      where: { storeId: preparationStoreId },
    });

    await expect(
      createConsolidationForPurchaseOrders({
        storeId: preparationStoreId,
        purchaseOrderIds: [order.id],
      })
    ).rejects.toThrow("请选择集运目的仓库");
    expect(await prisma.consolidationBatch.count({ where: { storeId: preparationStoreId } })).toBe(
      before
    );

    const draft = await prisma.consolidationBatch.create({
      data: { storeId: preparationStoreId, fromLocationId: preparationSourceLocationId },
    });
    await expect(updateConsolidationStatus(draft.id, "SEALED")).rejects.toThrow(
      "请先设置集运目的仓库"
    );
    await expect(
      prisma.consolidationBatch.findUniqueOrThrow({ where: { id: draft.id } })
    ).resolves.toMatchObject({ status: "OPEN", toLocationId: null });
  });

  it("allows an open or sealed batch to fill a missing destination, but not after dispatch", async () => {
    const sealed = await prisma.consolidationBatch.create({
      data: {
        storeId: preparationStoreId,
        fromLocationId: preparationSourceLocationId,
        status: "SEALED",
      },
    });

    await expect(
      updateConsolidationDestination(sealed.id, preparationDestinationLocationId)
    ).resolves.toMatchObject({
      id: sealed.id,
      toLocationId: preparationDestinationLocationId,
      toLocationName: "日本主仓",
    });
    await expect(
      prisma.consolidationBatch.findUniqueOrThrow({ where: { id: sealed.id } })
    ).resolves.toMatchObject({ toLocationId: preparationDestinationLocationId });

    await prisma.consolidationBatch.update({
      where: { id: sealed.id },
      data: { status: "SHIPPED" },
    });
    await expect(
      updateConsolidationDestination(sealed.id, preparationWrongLocationId)
    ).rejects.toThrow("集运批次发出后不能修改目的仓库");
  });

  it("locks and receives purchase inventory after a completed transfer leg", async () => {
    const order = await createReceivedOrder({
      orderNo: `PO_TRANSFERRED_${preparationRunId}`,
      locationId: preparationWrongLocationId,
    });
    const shipment = await dispatchPurchaseTransfer({
      purchaseOrderId: order.id,
      toLocationId: preparationSourceLocationId,
      trackingNo: `TRANSFERRED_${preparationRunId}`,
    });
    await confirmInboundShipmentDelivered(
      shipment.id,
      new Date(),
      undefined,
      preparationSourceLocationId
    );

    const shipmentLine = await prisma.inboundShipmentInventoryLine.findFirstOrThrow({
      where: { shipmentId: shipment.id, entityType: "LOT" },
    });
    const transferredLot = await prisma.inventoryLot.findUniqueOrThrow({
      where: { id: shipmentLine.destinationEntityId! },
    });
    expect(transferredLot).toMatchObject({
      sourceType: "TRANSFER",
      locationId: preparationSourceLocationId,
      status: "ACTIVE",
    });

    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId: preparationStoreId,
        fromLocationId: preparationSourceLocationId,
        toLocationId: preparationDestinationLocationId,
      },
    });
    await expect(
      addPurchaseOrderToConsolidation({ batchId: batch.id, purchaseOrderId: order.id })
    ).resolves.toMatchObject({ success: 1, failed: 0 });
    await expect(
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: transferredLot.id } })
    ).resolves.toMatchObject({ status: "CONSOLIDATING" });

    await updateConsolidationStatus(batch.id, "SEALED");
    await updateConsolidationStatus(batch.id, "SHIPPED");
    await updateConsolidationStatus(batch.id, "RECEIVED");

    const destinationLot = await prisma.inventoryLot.findFirstOrThrow({
      where: {
        storeId: preparationStoreId,
        locationId: preparationDestinationLocationId,
        sourceType: "TRANSFER",
        sourceId: { not: shipmentLine.id },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(destinationLot.status).toBe("ACTIVE");
    await expect(
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: transferredLot.id } })
    ).resolves.toMatchObject({ status: "CONSUMED" });
  });

  it("rejects a purchase order whose arrival location differs from the batch origin", async () => {
    const order = await createReceivedOrder({
      orderNo: `PO_WRONG_${preparationRunId}`,
      locationId: preparationWrongLocationId,
    });
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId: preparationStoreId,
        fromLocationId: preparationSourceLocationId,
        toLocationId: preparationDestinationLocationId,
      },
    });

    await expect(
      addPurchaseOrderToConsolidation({
        batchId: batch.id,
        purchaseOrderId: order.id,
      })
    ).rejects.toThrow("到货仓“上海家庭仓”与集运起点“上海转运仓”不一致");

    expect(await prisma.consolidationBatchLine.count({ where: { batchId: batch.id } })).toBe(0);
    expect(
      await prisma.inventoryLot.count({
        where: { sourceType: "PURCHASE", sourceId: order.lines[0].id },
      })
    ).toBe(0);
  });

  it("blocks dispatch when the batch inventory is not at the origin", async () => {
    const order = await createReceivedOrder({
      orderNo: `PO_DISPATCH_BLOCK_${preparationRunId}`,
      locationId: preparationWrongLocationId,
    });
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId: preparationStoreId,
        fromLocationId: preparationSourceLocationId,
        toLocationId: preparationDestinationLocationId,
        status: "SEALED",
        lines: {
          create: {
            sourceType: "PURCHASE_LINE",
            sourceId: order.lines[0].id,
            quantity: "2",
          },
        },
      },
    });

    await expect(updateConsolidationStatus(batch.id, "SHIPPED")).rejects.toThrow(
      /到货仓“上海家庭仓”与集运起点“上海转运仓”不一致/
    );
    expect(
      await prisma.consolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        select: { status: true },
      })
    ).toEqual({ status: "SEALED" });
  });

  it("repairs a legacy shipped batch with an audited transfer to its origin", async () => {
    const order = await createReceivedOrder({
      orderNo: `PO_REPAIR_${preparationRunId}`,
      locationId: preparationWrongLocationId,
      quantity: "3",
    });
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId: preparationStoreId,
        fromLocationId: preparationSourceLocationId,
        toLocationId: preparationDestinationLocationId,
        status: "SHIPPED",
        lines: {
          create: {
            sourceType: "PURCHASE_LINE",
            sourceId: order.lines[0].id,
            quantity: "3",
          },
        },
      },
    });

    const before = await getConsolidationBatchById(batch.id);
    expect(before?.lines[0].inventoryIssue).toEqual({
      code: "ORIGIN_STOCK_MISSING",
      currentLocationName: "上海家庭仓",
      expectedLocationName: "上海转运仓",
      missingQuantity: "3",
    });

    await expect(repairConsolidationOriginInventory(batch.id)).resolves.toEqual({
      id: batch.id,
      repairedLines: 1,
    });

    const [purchaseOrder, repairedLot, repairLedgers, after] = await Promise.all([
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.inventoryLot.findFirstOrThrow({
        where: {
          sourceType: "PURCHASE",
          sourceId: order.lines[0].id,
        },
      }),
      prisma.stockLedger.findMany({
        where: {
          refType: "CONSOLIDATION_ORIGIN_REPAIR",
          refId: batch.id,
        },
        orderBy: { reason: "asc" },
      }),
      getConsolidationBatchById(batch.id),
    ]);
    expect(purchaseOrder.destinationLocationId).toBe(preparationWrongLocationId);
    expect(repairedLot).toMatchObject({
      locationId: preparationSourceLocationId,
      status: "CONSOLIDATING",
    });
    expect(repairLedgers).toHaveLength(2);
    expect(repairLedgers.reduce((sum, ledger) => sum + Number(ledger.deltaQty.toString()), 0)).toBe(
      0
    );
    expect(after?.lines[0].inventoryIssue).toBeNull();

    await expect(updateConsolidationStatus(batch.id, "RECEIVED")).resolves.toBeUndefined();
    expect(
      await prisma.consolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        select: { status: true },
      })
    ).toEqual({ status: "RECEIVED" });
  });

  it("rejects mixed arrival locations before creating a new batch", async () => {
    const [sourceOrder, wrongOrder] = await Promise.all([
      createReceivedOrder({
        orderNo: `PO_MIX_A_${preparationRunId}`,
        locationId: preparationSourceLocationId,
      }),
      createReceivedOrder({
        orderNo: `PO_MIX_B_${preparationRunId}`,
        locationId: preparationWrongLocationId,
      }),
    ]);
    const before = await prisma.consolidationBatch.count({
      where: { storeId: preparationStoreId },
    });

    await expect(
      createConsolidationForPurchaseOrders({
        storeId: preparationStoreId,
        purchaseOrderIds: [sourceOrder.id, wrongOrder.id],
        toLocationId: preparationDestinationLocationId,
      })
    ).rejects.toThrow("所选采购单不在同一个到货仓");

    expect(
      await prisma.consolidationBatch.count({
        where: { storeId: preparationStoreId },
      })
    ).toBe(before);
  });

  it("reports every incompatible purchase line before changing the batch", async () => {
    const [firstOrder, secondOrder] = await Promise.all([
      createReceivedOrder({
        orderNo: `PO_MISSING_A_${preparationRunId}`,
        locationId: preparationWrongLocationId,
        quantity: "1",
      }),
      createReceivedOrder({
        orderNo: `PO_MISSING_B_${preparationRunId}`,
        locationId: preparationWrongLocationId,
        quantity: "3",
      }),
    ]);
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId: preparationStoreId,
        fromLocationId: preparationSourceLocationId,
        toLocationId: preparationDestinationLocationId,
        status: "SHIPPED",
        lines: {
          create: [
            {
              sourceType: "PURCHASE_LINE",
              sourceId: firstOrder.lines[0].id,
              quantity: "1",
            },
            {
              sourceType: "PURCHASE_LINE",
              sourceId: secondOrder.lines[0].id,
              quantity: "3",
            },
          ],
        },
      },
    });

    await expect(updateConsolidationStatus(batch.id, "RECEIVED")).rejects.toThrow(
      /2 项.*PO_MISSING_A_.*到货仓.*集运起点.*PO_MISSING_B_.*到货仓.*集运起点/
    );

    expect(
      await prisma.consolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        select: { status: true },
      })
    ).toEqual({ status: "SHIPPED" });
    expect(
      await prisma.stockLedger.count({
        where: { refType: "CONSOLIDATION_BATCH", refId: batch.id },
      })
    ).toBe(0);
  });
});
