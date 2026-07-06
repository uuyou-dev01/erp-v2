import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runImport } from "@/app/actions/import";

const runId = `import_action_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;

describe("import action preflight validation", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Import Action Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Import Action Test Store",
        currency: "CNY",
      },
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("does not write any rows when a supported import file has validation errors", async () => {
    const result = await runImport(storeId, "SKU", [
      { code: `SKU_${runId}_1`, name: "Valid SKU" },
      { code: `SKU_${runId}_2`, name: "" },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      { row: 2, message: "SKU代码和名称为必填项" },
    ]);

    const importedSkus = await prisma.sKU.findMany({
      where: { storeId },
    });
    expect(importedSkus).toHaveLength(0);
  });

  it("does not write earlier rows when a later SKU row fails database validation", async () => {
    await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_EXISTING`,
        name: "Existing SKU",
      },
    });

    const result = await runImport(storeId, "SKU", [
      { code: `SKU_${runId}_NEW`, name: "New SKU" },
      { code: `SKU_${runId}_EXISTING`, name: "Duplicate SKU" },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      {
        row: 2,
        message: `SKU代码 SKU_${runId}_EXISTING 已存在`,
      },
    ]);

    const newSku = await prisma.sKU.findUnique({
      where: { storeId_code: { storeId, code: `SKU_${runId}_NEW` } },
    });
    expect(newSku).toBeNull();
  });

  it("does not write earlier inventory lots when a later lot row references a missing SKU", async () => {
    await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_LOT`,
        name: "Lot SKU",
      },
    });
    await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}`,
        name: "Import Warehouse",
        type: "WAREHOUSE",
      },
    });

    const result = await runImport(storeId, "INVENTORY_LOT", [
      {
        sku_code: `SKU_${runId}_LOT`,
        location_code: `WH_${runId}`,
        quantity: "2",
        unit_cost: "100",
      },
      {
        sku_code: `SKU_${runId}_MISSING`,
        location_code: `WH_${runId}`,
        quantity: "1",
        unit_cost: "80",
      },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      { row: 2, message: `SKU SKU_${runId}_MISSING 不存在` },
    ]);

    const lots = await prisma.inventoryLot.findMany({
      where: { storeId, sourceId: "CSV_IMPORT" },
    });
    expect(lots).toHaveLength(0);
  });

  it("rejects inventory lot imports when sku_code references a catalog group", async () => {
    const group = await prisma.sKU.create({
      data: {
        storeId,
        code: `GROUP_${runId}_LOT_IMPORT`,
        name: "Import Lot Group",
        catalogRole: "GROUP",
      },
    });
    await prisma.location.create({
      data: {
        storeId,
        code: `WH_${runId}_GROUP`,
        name: "Import Group Warehouse",
        type: "WAREHOUSE",
      },
    });

    const result = await runImport(storeId, "INVENTORY_LOT", [
      {
        sku_code: group.code,
        location_code: `WH_${runId}_GROUP`,
        quantity: "1",
        unit_cost: "100",
      },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.message).toContain("商品组只用于管理规格");

    const lots = await prisma.inventoryLot.findMany({
      where: { storeId, sourceId: "CSV_IMPORT" },
    });
    expect(lots).toHaveLength(0);
  });

  it("does not write earlier customer orders when a later order row references a missing platform", async () => {
    await prisma.platform.create({
      data: {
        storeId,
        code: `PLAT_${runId}`,
        name: "Import Platform",
        country: "JP",
      },
    });

    const result = await runImport(storeId, "CUSTOMER_ORDER", [
      {
        platform_code: `PLAT_${runId}`,
        customer_name: "Buyer One",
        external_order_no: `SO_${runId}_1`,
      },
      {
        platform_code: `PLAT_${runId}_MISSING`,
        customer_name: "Buyer Two",
        external_order_no: `SO_${runId}_2`,
      },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      { row: 2, message: `平台 PLAT_${runId}_MISSING 不存在` },
    ]);

    const orders = await prisma.customerOrder.findMany({
      where: { storeId, externalOrderNo: { in: [`SO_${runId}_1`, `SO_${runId}_2`] } },
    });
    expect(orders).toHaveLength(0);
  });

  it("does not write earlier purchase lines when a later purchase row references a missing SKU", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_PO`,
        name: "Purchase SKU",
      },
    });
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: `PO_${runId}`,
        currency: "CNY",
        subtotal: "0",
        totalAmount: "0",
      },
    });

    const result = await runImport(storeId, "PURCHASE_LINE", [
      {
        purchase_order_id: purchaseOrder.id,
        sku_code: sku.code,
        quantity: "2",
        unit_price: "100",
      },
      {
        purchase_order_id: purchaseOrder.id,
        sku_code: `SKU_${runId}_PO_MISSING`,
        quantity: "1",
        unit_price: "80",
      },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      { row: 2, message: `SKU SKU_${runId}_PO_MISSING 不存在` },
    ]);

    const purchaseLines = await prisma.purchaseLine.findMany({
      where: { purchaseOrderId: purchaseOrder.id },
    });
    expect(purchaseLines).toHaveLength(0);
  });

  it("rejects purchase line imports when sku_code references a catalog group", async () => {
    const group = await prisma.sKU.create({
      data: {
        storeId,
        code: `GROUP_${runId}_PO_IMPORT`,
        name: "Import Purchase Group",
        catalogRole: "GROUP",
      },
    });
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        storeId,
        orderNo: `PO_GROUP_${runId}`,
        currency: "CNY",
        subtotal: "0",
        totalAmount: "0",
      },
    });

    const result = await runImport(storeId, "PURCHASE_LINE", [
      {
        purchase_order_id: purchaseOrder.id,
        sku_code: group.code,
        quantity: "1",
        unit_price: "100",
      },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.message).toContain("商品组只用于管理规格");

    const purchaseLines = await prisma.purchaseLine.findMany({
      where: { purchaseOrderId: purchaseOrder.id },
    });
    expect(purchaseLines).toHaveLength(0);
  });

  it("rejects purchase line imports without a purchase order id instead of reporting false success", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_PO_REQUIRED`,
        name: "Purchase Required SKU",
      },
    });

    const result = await runImport(storeId, "PURCHASE_LINE", [
      {
        sku_code: sku.code,
        quantity: "2",
        unit_price: "100",
      },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      { row: 1, message: "采购单ID为必填项" },
    ]);
  });

  it("rejects purchase line imports when the purchase order belongs to another store", async () => {
    const otherStore = await prisma.store.create({
      data: {
        id: `store_${runId}_other`,
        organization: { connect: { code: organizationCode } },
        code: `STORE_${runId}_OTHER`,
        name: "Other Store",
        currency: "CNY",
      },
    });
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_PO_CROSS`,
        name: "Purchase Cross Store SKU",
      },
    });
    const otherPurchaseOrder = await prisma.purchaseOrder.create({
      data: {
        storeId: otherStore.id,
        orderNo: `PO_${runId}_OTHER`,
        currency: "CNY",
        subtotal: "0",
        totalAmount: "0",
      },
    });

    const result = await runImport(storeId, "PURCHASE_LINE", [
      {
        purchase_order_id: otherPurchaseOrder.id,
        sku_code: sku.code,
        quantity: "2",
        unit_price: "100",
      },
    ]);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      { row: 1, message: `采购单 ${otherPurchaseOrder.id} 不存在或不属于当前店铺` },
    ]);

    const purchaseLines = await prisma.purchaseLine.findMany({
      where: { purchaseOrderId: otherPurchaseOrder.id },
    });
    expect(purchaseLines).toHaveLength(0);
  });
});
