import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { returnPurchaseOrder } from "@/app/actions/purchase-orders";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const runId = `purchase_return_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
let locationId = "";
let skuId = "";

describe("purchase return inventory reversal", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: organizationCode, name: "Purchase Return Test" },
    });
    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Purchase Return Test Store",
        currency: "CNY",
      },
    });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `LOC_${runId}`,
        name: "Return Test Location",
        type: "WAREHOUSE",
      },
    });
    locationId = location.id;
    const sku = await prisma.sKU.create({
      data: { storeId, code: `SKU_${runId}`, name: "Return Test SKU" },
    });
    skuId = sku.id;
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("reverses available inbound inventory when a received purchase is returned", async () => {
    const order = await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: `PO_${runId}_OK`,
        currency: "CNY",
        subtotal: "200",
        totalAmount: "200",
        status: "RECEIVED",
        receivedAt: new Date(),
      },
    });
    const line = await prisma.purchaseLine.create({
      data: {
        purchaseOrderId: order.id,
        skuId,
        quantity: "2",
        unitPrice: "100",
        lineAmount: "200",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId,
        locationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: line.id,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId,
        deltaQty: "2",
        reason: "INBOUND_PURCHASE",
        refType: "PURCHASE_LINE",
        refId: line.id,
      },
    });

    await returnPurchaseOrder({ purchaseOrderId: order.id, note: "退货测试" });

    const [updatedOrder, updatedLot, returnLedger] = await Promise.all([
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } }),
      prisma.stockLedger.findFirstOrThrow({
        where: {
          entityType: "LOT",
          entityId: lot.id,
          reason: "RETURN_TO_SUPPLIER",
        },
      }),
    ]);
    expect(updatedOrder.status).toBe("RETURNED");
    expect(updatedOrder.shipmentNote).toContain("退货测试");
    expect(updatedLot.status).toBe("CONSUMED");
    expect(returnLedger.deltaQty.toString()).toBe("-2");
  });

  it("blocks a full return when purchase inventory has been allocated", async () => {
    const order = await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: `PO_${runId}_ALLOCATED`,
        currency: "CNY",
        subtotal: "100",
        totalAmount: "100",
        status: "RECEIVED",
        receivedAt: new Date(),
      },
    });
    const line = await prisma.purchaseLine.create({
      data: {
        purchaseOrderId: order.id,
        skuId,
        quantity: "1",
        unitPrice: "100",
        lineAmount: "100",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId,
        locationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: line.id,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId,
        deltaQty: "1",
        reason: "INBOUND_PURCHASE",
      },
    });
    const customerOrder = await prisma.customerOrder.create({
      data: {
        storeId,
        orderNumber: `SO_${runId}`,
        customerName: "Test",
        orderDate: new Date(),
        currency: "CNY",
        subtotal: "100",
        totalPaid: "100",
      },
    });
    const orderLine = await prisma.orderLine.create({
      data: {
        orderId: customerOrder.id,
        skuId,
        quantity: "1",
        lineAmount: "100",
      },
    });
    await prisma.orderAllocation.create({
      data: {
        orderLineId: orderLine.id,
        allocationType: "LOT",
        lotId: lot.id,
        quantity: "1",
        unitCost: "100",
        costAmount: "100",
        status: "ALLOCATED",
      },
    });

    await expect(
      returnPurchaseOrder({ purchaseOrderId: order.id, note: "不应成功" })
    ).rejects.toThrow("不能整单退货");
    const unchanged = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.status).toBe("RECEIVED");
  });
});
