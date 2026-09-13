import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getManagedWarehouseInventory } from "@/lib/application/warehouse-inventory";
import { resolveInventoryAcquisitions } from "@/lib/application/inventory-acquisition";

const auth = vi.hoisted(() => ({ id: "" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/user-context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/user-context")>()),
  requireAuthenticatedUser: async () => prisma.user.findUniqueOrThrow({ where: { id: auth.id } }),
}));

import { requestWarehouseStocktake } from "@/app/actions/warehouse-inventory";
import { saveCollaborationShippingPreparationAction } from "@/app/actions/collaboration-tasks";
import { saveOrderShippingProof } from "@/app/actions/customer-orders";

const run = `warehouse_preparation_${Date.now()}`;
let storeId = "",
  orgId = "",
  locationId = "",
  otherLocationId = "",
  ownerId = "",
  managerId = "",
  operatorId = "",
  skuId = "",
  orderId = "",
  taskId = "",
  purchaseLineId = "",
  splitId = "",
  transferId = "",
  unitId = "";

describe("warehouse inventory and pre-shipment collaboration", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { code: run, name: run } });
    orgId = org.id;
    const store = await prisma.store.create({
      data: { organizationId: orgId, code: run, name: run, currency: "CNY" },
    });
    storeId = store.id;
    const users = await Promise.all(
      ["owner", "manager", "operator"].map((role) =>
        prisma.user.create({
          data: {
            email: `${run}_${role}@example.invalid`,
            password: "test",
            name: role,
            role: role === "owner" ? "OWNER" : "USER",
            storeId: role === "owner" ? storeId : null,
          },
        })
      )
    );
    [ownerId, managerId, operatorId] = users.map((u) => u.id);
    auth.id = managerId;
    await prisma.membership.create({
      data: { organizationId: orgId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
    });
    const locations = await Promise.all(
      ["managed", "private"].map((code) =>
        prisma.location.create({ data: { storeId, code, name: code, type: "WAREHOUSE" } })
      )
    );
    [locationId, otherLocationId] = locations.map((l) => l.id);
    await prisma.locationFulfiller.createMany({
      data: [
        {
          organizationId: orgId,
          locationId,
          userId: managerId,
          email: users[1].email,
          role: "MANAGER",
          status: "ACTIVE",
          invitedById: ownerId,
        },
        {
          organizationId: orgId,
          locationId,
          userId: operatorId,
          email: users[2].email,
          role: "OPERATOR",
          status: "ACTIVE",
          invitedById: ownerId,
        },
      ],
    });
    const sku = await prisma.sKU.create({ data: { storeId, code: run, name: "Test goods" } });
    skuId = sku.id;
    const purchase = await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: run,
        currency: "CNY",
        subtotal: "10",
        totalAmount: "10",
        orderedAt: new Date("2026-08-01T02:00:00Z"),
        lines: { create: { skuId, quantity: "10", unitPrice: "1", lineAmount: "10" } },
      },
      include: { lines: true },
    });
    purchaseLineId = purchase.lines[0].id;
    const lot = await makeLot(locationId, "10", "PURCHASE", purchaseLineId);
    await makeLot(otherLocationId, "999", "OPENING", run);
    const order = await prisma.customerOrder.create({
      data: {
        storeId,
        orderNumber: run,
        customerName: "Customer",
        orderDate: new Date(),
        currency: "CNY",
        subtotal: "2",
        totalPaid: "2",
        orderStatus: "CONFIRMED",
        lines: {
          create: {
            skuId,
            quantity: "2",
            lineAmount: "2",
            allocations: {
              create: {
                allocationType: "LOT",
                lotId: lot.id,
                quantity: "2",
                unitCost: "1",
                costAmount: "2",
                status: "PENDING",
              },
            },
          },
        },
      },
    });
    orderId = order.id;
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        storeId,
        type: "SHIP_ORDER",
        status: "IN_PROGRESS",
        title: "Ship",
        refType: "CUSTOMER_ORDER",
        refId: orderId,
        createdById: ownerId,
        assignedToId: managerId,
        fulfillmentLocationId: locationId,
      },
    });
    taskId = task.id;
    await prisma.inboundShipment.create({
      data: {
        storeId,
        fromLocationId: locationId,
        toLocationId: otherLocationId,
        status: "IN_TRANSIT",
        inventoryLines: {
          create: { entityType: "LOT", entityId: lot.id, quantity: "3", status: "IN_TRANSIT" },
        },
      },
    });
    await prisma.consolidationBatch.create({
      data: {
        storeId,
        fromLocationId: locationId,
        toLocationId: otherLocationId,
        status: "SHIPPED",
        lines: { create: { sourceType: "LOT", sourceId: lot.id, quantity: "2" } },
      },
    });
    const split = await makeLot(otherLocationId, "1", "SPLIT", run);
    splitId = split.id;
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: split.id,
        locationId: otherLocationId,
        deltaQty: "1",
        reason: "SPLIT_IN",
        refType: "TEST",
        refId: run,
        meta: { sourceLotId: lot.id },
      },
    });
    const transfer = await makeLot(otherLocationId, "1", "TRANSFER", run);
    transferId = transfer.id;
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: transfer.id,
        locationId: otherLocationId,
        deltaQty: "1",
        reason: "TRANSFER_IN",
        refType: "TEST",
        refId: run,
        meta: { sourceLotId: split.id },
      },
    });
    const inventorySplit = await prisma.inventorySplit.create({
      data: {
        storeId,
        splitType: "UNBOX",
        sourceType: "LOT",
        sourceId: transfer.id,
        totalSourceCost: "1",
      },
    });
    const unit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId,
        locationId,
        unitCost: "1",
        costCurrency: "CNY",
        sourceType: "SPLIT",
        sourceId: inventorySplit.id,
        status: "RETURN_CHECK",
      },
    });
    unitId = unit.id;
  });

  it("shows only the active manager's warehouse with physical stock including reserved and return-check goods, excluding dispatched goods", async () => {
    const warehouses = await getManagedWarehouseInventory(managerId);
    expect(warehouses).toHaveLength(1);
    expect(warehouses[0].locationId).toBe(locationId);
    expect(warehouses[0].rows).toEqual([
      { skuId, code: run, name: "Test goods", physical: "6", reserved: "2" },
    ]);
    expect(JSON.stringify(warehouses)).not.toContain("unitCost");
    expect(await getManagedWarehouseInventory(operatorId)).toEqual([]);
    expect(await getManagedWarehouseInventory(ownerId)).toEqual([]);
    await prisma.locationFulfiller.updateMany({
      where: { userId: managerId },
      data: { status: "SUSPENDED" },
    });
    expect(await getManagedWarehouseInventory(managerId)).toEqual([]);
    await prisma.locationFulfiller.updateMany({
      where: { userId: managerId },
      data: { status: "ACTIVE" },
    });
  });

  it("does not let a suspended organization member regain inventory or preparation access through a leftover roster", async () => {
    const membership = await prisma.membership.create({
      data: { organizationId: orgId, userId: managerId, role: "STAFF", status: "SUSPENDED" },
    });
    auth.id = managerId;
    expect(await getManagedWarehouseInventory(managerId)).toEqual([]);
    expect((await requestWarehouseStocktake({ locationId, note: "Denied" })).success).toBe(false);
    expect(
      (await saveCollaborationShippingPreparationAction(taskId, { imageUrls: [] })).success
    ).toBe(false);
    await prisma.membership.delete({ where: { id: membership.id } });
  });

  it("traces the original purchase date through split, transfer, and individual unit conversion", async () => {
    const refs = [
      { sourceType: "PURCHASE_LINE", sourceId: purchaseLineId },
      { sourceType: "LOT", sourceId: splitId },
      { sourceType: "LOT", sourceId: transferId },
      { sourceType: "ITEM_UNIT", sourceId: unitId },
    ];
    const found = await resolveInventoryAcquisitions(storeId, refs);
    for (const ref of refs)
      expect(found.get(`${ref.sourceType}:${ref.sourceId}`)).toEqual({
        orderNo: run,
        purchasedAt: "2026-08-01T02:00:00.000Z",
      });
    const denied = await resolveInventoryAcquisitions("different-store", refs);
    for (const ref of refs) expect(denied.get(`${ref.sourceType}:${ref.sourceId}`)).toBeNull();
  });

  it("submits a stocktake request to the owner without changing inventory and rejects other warehouse/operator access", async () => {
    const before = await prisma.stockLedger.count({ where: { storeId } });
    auth.id = managerId;
    expect(
      (await requestWarehouseStocktake({ locationId, note: "Expected 6, found 5" })).success
    ).toBe(true);
    expect(
      await prisma.notification.count({
        where: { recipientId: ownerId, type: "WAREHOUSE_STOCKTAKE_REQUEST" },
      })
    ).toBe(1);
    expect(
      (await requestWarehouseStocktake({ locationId: otherLocationId, note: "Not allowed" }))
        .success
    ).toBe(false);
    auth.id = operatorId;
    expect((await requestWarehouseStocktake({ locationId, note: "Not allowed" })).success).toBe(
      false
    );
    expect(await prisma.stockLedger.count({ where: { storeId } })).toBe(before);
    auth.id = managerId;
  });

  it("persists both parties' pre-shipment images immediately, preserves other fields and never ships the order", async () => {
    const [ownerImage, managerImage] = await Promise.all([
      makeAsset(ownerId),
      makeAsset(managerId),
    ]);
    const ownerUrl = `/api/assets/${ownerImage.id}/content`,
      managerUrl = `/api/assets/${managerImage.id}/content`;
    await prisma.customerOrder.update({
      where: { id: orderId },
      data: { shippingProof: { imageUrls: [ownerUrl], pickupCode: "KEEP-ME" } },
    });
    const saved = await saveCollaborationShippingPreparationAction(taskId, {
      imageUrls: [managerUrl],
      proofNote: "Please scan before shipping",
    });
    expect(saved.success).toBe(true);
    const order = await prisma.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.orderStatus).toBe("CONFIRMED");
    expect(order.shippedAt).toBeNull();
    expect(order.shippingProof).toMatchObject({
      imageUrls: [ownerUrl, managerUrl],
      pickupCode: "KEEP-ME",
      proofNote: "Please scan before shipping",
    });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe(
      "IN_PROGRESS"
    );
    expect(
      await prisma.notification.count({
        where: { recipientId: ownerId, type: "SHIPPING_PREPARATION_UPDATED" },
      })
    ).toBe(1);
    auth.id = operatorId;
    expect(
      (await saveCollaborationShippingPreparationAction(taskId, { imageUrls: [managerUrl] }))
        .success
    ).toBe(false);
    auth.id = managerId;
    const foreign = await makeAsset(managerId, "another-order");
    expect(
      (
        await saveCollaborationShippingPreparationAction(taskId, {
          imageUrls: [`/api/assets/${foreign.id}/content`],
        })
      ).success
    ).toBe(false);
  });

  it("merges simultaneous uploads from the workbench and collaboration portal without losing images", async () => {
    auth.id = managerId;
    const assets = await Promise.all([makeAsset(managerId), makeAsset(managerId)]);
    const urls = assets.map((asset) => `/api/assets/${asset.id}/content`);
    const [portal] = await Promise.all([
      saveCollaborationShippingPreparationAction(taskId, { imageUrls: [urls[0]] }),
      saveOrderShippingProof(orderId, { imageUrls: [urls[1]] }),
    ]);
    expect(portal.success).toBe(true);
    const order = await prisma.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect((order.shippingProof as { imageUrls: string[] }).imageUrls).toEqual(
      expect.arrayContaining(urls)
    );
    await saveOrderShippingProof(orderId, {}, { removedImageUrls: [urls[0]] });
    const updated = await prisma.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect((updated.shippingProof as { imageUrls: string[] }).imageUrls).not.toContain(urls[0]);
    expect((updated.shippingProof as { imageUrls: string[] }).imageUrls).toContain(urls[1]);
    expect(updated.orderStatus).toBe("CONFIRMED");
  });

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { storeId } });
    await prisma.mobileAsset.deleteMany({ where: { storeId } });
    await prisma.store.delete({ where: { id: storeId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, managerId, operatorId] } } });
  });
});

async function makeLot(location: string, quantity: string, sourceType: string, sourceId: string) {
  const lot = await prisma.inventoryLot.create({
    data: {
      storeId,
      skuId,
      locationId: location,
      unitCost: "1",
      costCurrency: "CNY",
      sourceType,
      sourceId,
      receivedAt: new Date("2026-09-13T00:00:00Z"),
    },
  });
  await prisma.stockLedger.create({
    data: {
      storeId,
      entityType: "LOT",
      entityId: lot.id,
      locationId: location,
      deltaQty: quantity,
      reason: "INBOUND_PURCHASE",
      refType: "TEST",
      refId: run,
    },
  });
  return lot;
}

async function makeAsset(userId: string, refId = orderId) {
  return prisma.mobileAsset.create({
    data: {
      organizationId: orgId,
      storeId,
      userId,
      storageKey: `${run}/${userId}/${refId}.png`,
      mimeType: "image/png",
      byteSize: 10,
      purpose: "BUSINESS_EVIDENCE",
      visibility: "ORGANIZATION_PRIVATE",
      status: "READY",
      refType: "CUSTOMER_ORDER",
      refId,
    },
  });
}
