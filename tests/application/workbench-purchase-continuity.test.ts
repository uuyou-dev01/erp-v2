import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const context = vi.hoisted(() => ({
  organizationId: "",
  activeStoreId: "",
  storeIds: [] as string[],
  userId: "",
  role: "OWNER",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/user-context", () => ({ requireUserContext: async () => context }));
import {
  bulkConfirmArrivals,
  bulkInboundPurchases,
  bulkUpdatePurchaseOrderLogistics,
  getWorkbenchWorkItems,
} from "@/app/actions/workbench";
import { submitFillLogistics } from "@/app/actions/workflow-actions";
import { collectWorkItems, getQueueCounts } from "@/lib/application/workflow-queries";

const runId = `continuity_${Date.now()}`;
let skuId: string;
let sourceId: string;
let otherId: string;
let targetId: string;

async function order(suffix: string, status = "ORDERED", locationId = sourceId) {
  return prisma.purchaseOrder.create({
    data: {
      storeId: context.activeStoreId,
      orderNo: `${runId}_${suffix}`,
      status,
      destinationLocationId: locationId,
      currency: "CNY",
      subtotal: "10",
      totalAmount: "10",
      receivedAt: status === "RECEIVED" ? new Date() : null,
      lines: { create: { skuId, quantity: "1", unitPrice: "10", lineAmount: "10" } },
    },
  });
}

describe("workbench purchase continuity", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { code: runId, name: runId } });
    context.organizationId = org.id;
    const store = await prisma.store.create({
      data: { organizationId: org.id, code: runId, name: runId },
    });
    context.activeStoreId = store.id;
    context.storeIds = [store.id];
    const user = await prisma.user.create({
      data: {
        email: `${runId}@example.invalid`,
        name: "Continuity tester",
        password: "unused",
        role: "OWNER",
        storeId: store.id,
      },
    });
    context.userId = user.id;
    const sku = await prisma.sKU.create({
      data: { storeId: store.id, name: runId, code: runId, catalogRole: "SIMPLE" },
    });
    skuId = sku.id;
    const source = await prisma.location.create({
      data: {
        storeId: store.id,
        name: "已收货仓",
        code: "CONT_SOURCE",
        type: "WAREHOUSE",
        isSellableDefault: true,
      },
    });
    sourceId = source.id;
    const other = await prisma.location.create({
      data: {
        storeId: store.id,
        name: "另一个仓",
        code: "CONT_OTHER",
        type: "WAREHOUSE",
        isSellableDefault: true,
      },
    });
    otherId = other.id;
    const oldIds = Array.from({ length: 130 }, (_, index) => `${runId}_old_${index}`);
    await prisma.purchaseOrder.createMany({
      data: oldIds.map((id) => ({
        id,
        storeId: store.id,
        orderNo: id,
        status: "ORDERED",
        currency: "CNY",
        subtotal: "10",
        totalAmount: "10",
        updatedAt: new Date("2025-01-01"),
      })),
    });
    await prisma.purchaseLine.createMany({
      data: oldIds.map((id) => ({
        purchaseOrderId: id,
        skuId,
        quantity: "1",
        unitPrice: "10",
        lineAmount: "10",
      })),
    });
    targetId = (await order("target")).id;
  });
  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: context.activeStoreId } });
    await prisma.user.deleteMany({ where: { id: context.userId } });
    await prisma.organization.deleteMany({ where: { id: context.organizationId } });
  });

  it("does not mark blank tracking as shipped without explicit intent", async () => {
    await expect(
      bulkUpdatePurchaseOrderLogistics([targetId], {
        destinationLocationId: sourceId,
        purchaseTrackingNo: "   ",
      })
    ).rejects.toThrow("暂无单号，确认已发货");
    await expect(
      submitFillLogistics("purchaseOrder", targetId, { destinationLocationId: sourceId })
    ).rejects.toThrow("暂无单号，确认已发货");
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: targetId } })).status).toBe(
      "ORDERED"
    );
  });

  it("keeps a newly shipped order visible after more than 120 older orders", async () => {
    expect(
      await bulkUpdatePurchaseOrderLogistics([targetId], {
        destinationLocationId: sourceId,
        shippedWithoutTracking: true,
      })
    ).toMatchObject({ success: 1, failed: 0 });
    const item = (await collectWorkItems(context.activeStoreId, "pendingArrival", 1)).find(
      (item) => item.entityId === targetId
    );
    expect(item).toMatchObject({
      queue: "pendingArrival",
      currentStatusLabel: "运输中 · 运单待补",
      metadata: { destinationLocationId: sourceId },
    });
    const all = await getWorkbenchWorkItems(
      context.activeStoreId,
      undefined,
      Number.POSITIVE_INFINITY
    );
    expect(all).toHaveLength(131);
    expect(all.some((item) => item.entityId === targetId)).toBe(true);
    expect(await getQueueCounts(context.activeStoreId)).toMatchObject({
      missingLogistics: 130,
      pendingArrival: 1,
      total: 131,
    });
  });

  it("single and batch shipment registration both support explicit no-tracking intent", async () => {
    const single = await order("single");
    expect(
      await submitFillLogistics("purchaseOrder", single.id, {
        destinationLocationId: sourceId,
        shippedWithoutTracking: true,
      })
    ).toMatchObject({ success: true });
    const tracked = await order("tracked");
    expect(
      await bulkUpdatePurchaseOrderLogistics([tracked.id], {
        destinationLocationId: sourceId,
        purchaseTrackingNo: "SF-CONTINUITY",
      })
    ).toMatchObject({ success: 1, failed: 0 });
    const items = await collectWorkItems(context.activeStoreId, "pendingArrival");
    expect(items.map((item) => item.entityId)).toEqual(
      expect.arrayContaining([single.id, tracked.id])
    );
  });

  it("uses each order's received warehouse when confirming a mixed-warehouse batch", async () => {
    const first = await order("received_a", "RECEIVED", sourceId);
    const second = await order("received_b", "RECEIVED", otherId);
    expect(await bulkInboundPurchases({ purchaseOrderIds: [first.id, second.id] })).toMatchObject({
      success: 2,
      failed: 0,
    });
    for (const [id, locationId] of [
      [first.id, sourceId],
      [second.id, otherId],
    ]) {
      const line = await prisma.purchaseLine.findFirstOrThrow({ where: { purchaseOrderId: id } });
      expect(
        await prisma.inventoryLot.findFirst({
          where: { sourceType: "PURCHASE", sourceId: line.id },
        })
      ).toMatchObject({ locationId });
      expect(
        await prisma.stockLedger.count({
          where: { refType: "PURCHASE_LINE", refId: line.id, reason: "INBOUND_PURCHASE" },
        })
      ).toBe(1);
    }
  });

  it("requires an explicit arrival decision and keeps inbound at the actual warehouse", async () => {
    const shipped = await order("actual_arrival", "SHIPPED", sourceId);
    await expect(
      bulkConfirmArrivals({ purchaseOrderIds: [shipped.id] })
    ).rejects.toThrow("请先确认各单预计到货位置");
    expect(
      (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: shipped.id } })).status
    ).toBe("SHIPPED");

    expect(
      await bulkConfirmArrivals({ purchaseOrderIds: [shipped.id], arrivalLocationId: otherId })
    ).toMatchObject({ success: 1, failed: 0 });
    expect(
      await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: shipped.id } })
    ).toMatchObject({ status: "RECEIVED", destinationLocationId: otherId });
    expect(await bulkInboundPurchases({ purchaseOrderIds: [shipped.id] })).toMatchObject({
      success: 1,
      failed: 0,
    });
    const line = await prisma.purchaseLine.findFirstOrThrow({
      where: { purchaseOrderId: shipped.id },
    });
    expect(
      await prisma.inventoryLot.findFirstOrThrow({
        where: { sourceType: "PURCHASE", sourceId: line.id },
      })
    ).toMatchObject({ locationId: otherId });
  });

  it("confirms mixed expected locations per order only when explicitly chosen", async () => {
    const first = await order("expected_a", "SHIPPED", sourceId);
    const second = await order("expected_b", "SHIPPED", otherId);
    expect(
      await bulkConfirmArrivals({
        purchaseOrderIds: [first.id, second.id],
        useExpectedLocations: true,
      })
    ).toMatchObject({ success: 2, failed: 0 });
    expect(
      (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: first.id } }))
        .destinationLocationId
    ).toBe(sourceId);
    expect(
      (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: second.id } }))
        .destinationLocationId
    ).toBe(otherId);
  });

  it("records a shipment's selected actual arrival on both shipment and purchase order", async () => {
    const shipped = await order("shipment_arrival", "SHIPPED", sourceId);
    const shipment = await prisma.inboundShipment.create({
      data: {
        storeId: context.activeStoreId,
        purchaseOrderId: shipped.id,
        status: "IN_TRANSIT",
        toLocationId: sourceId,
      },
    });
    expect(
      await bulkConfirmArrivals({ shipmentIds: [shipment.id], arrivalLocationId: otherId })
    ).toMatchObject({ success: 1, failed: 0 });
    expect(await prisma.inboundShipment.findUniqueOrThrow({ where: { id: shipment.id } })).toMatchObject({
      status: "DELIVERED",
      toLocationId: otherId,
    });
    expect(
      await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: shipped.id } })
    ).toMatchObject({ status: "RECEIVED", destinationLocationId: otherId });
  });

  it("reports the real mismatch error and creates no stock for the failed order", async () => {
    const received = await order("wrong_warehouse", "RECEIVED", sourceId);
    const result = await bulkInboundPurchases({
      purchaseOrderIds: [received.id],
      locationId: otherId,
    });
    expect(result).toMatchObject({
      success: 0,
      failed: 1,
      errors: [expect.stringContaining("如需移动商品，请发起转仓物流")],
    });
    const line = await prisma.purchaseLine.findFirstOrThrow({
      where: { purchaseOrderId: received.id },
    });
    expect(await prisma.inventoryLot.count({ where: { sourceId: line.id } })).toBe(0);
  });

  it("reports partial failures without hiding the reason", async () => {
    const received = await order("partial_valid", "RECEIVED", sourceId);
    const pending = await order("partial_invalid");
    expect(
      await bulkInboundPurchases({ purchaseOrderIds: [received.id, pending.id] })
    ).toMatchObject({
      success: 1,
      failed: 1,
      errors: [expect.stringContaining("只有已到货待分流")],
    });
  });
});
