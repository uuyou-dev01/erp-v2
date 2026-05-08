"use server";

import { prisma } from "@/lib/prisma";
import { createInboundInventoryLot } from "@/lib/application/inventory";

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

export async function runImport(
  storeId: string,
  entityType: string,
  rows: Record<string, string>[]
): Promise<ImportResult> {
  const job = await prisma.importJob.create({
    data: {
      storeId,
      entityType,
      status: "PROCESSING",
      totalRows: rows.length,
    },
  });

  let success = 0;
  let failed = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      switch (entityType) {
        case "SKU":
          await importSKU(storeId, rows[i], i + 1, errors);
          break;
        case "INVENTORY_LOT":
          await importInventoryLot(storeId, rows[i], i + 1, errors);
          break;
        case "PURCHASE_LINE":
          await importPurchaseLine(storeId, rows[i], i + 1, errors);
          break;
        case "CUSTOMER_ORDER":
          await importCustomerOrder(storeId, rows[i], i + 1, errors);
          break;
        default:
          errors.push({ row: i + 1, message: `不支持的导入类型: ${entityType}` });
          failed++;
          continue;
      }
      success++;
    } catch (err) {
      failed++;
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "未知错误" });
    }
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: failed === rows.length ? "FAILED" : "COMPLETED",
      successRows: success,
      failedRows: failed,
      errorReport: errors.length > 0 ? errors : undefined,
    },
  });

  return { success, failed, errors };
}

async function importSKU(
  storeId: string,
  row: Record<string, string>,
  _rowNum: number,
  _errors: Array<{ row: number; message: string }>
) {
  const code = row.code?.trim();
  const name = row.name?.trim();
  if (!code || !name) {
    throw new Error("SKU代码和名称为必填项");
  }

  const existing = await prisma.sKU.findUnique({
    where: { storeId_code: { storeId, code } },
  });
  if (existing) {
    throw new Error(`SKU代码 ${code} 已存在`);
  }

  await prisma.sKU.create({
    data: {
      storeId,
      code,
      name,
      category: row.category?.trim() || undefined,
      brand: row.brand?.trim() || undefined,
      description: row.description?.trim() || undefined,
    },
  });
}

async function importInventoryLot(
  storeId: string,
  row: Record<string, string>,
  _rowNum: number,
  _errors: Array<{ row: number; message: string }>
) {
  const skuCode = row.sku_code?.trim();
  const locationCode = row.location_code?.trim();
  const quantity = row.quantity?.trim();
  const unitCost = row.unit_cost?.trim();

  if (!skuCode || !locationCode || !quantity || !unitCost) {
    throw new Error("SKU代码、仓库代码、数量和单价为必填项");
  }

  const sku = await prisma.sKU.findUnique({
    where: { storeId_code: { storeId, code: skuCode } },
  });
  if (!sku) throw new Error(`SKU ${skuCode} 不存在`);

  const location = await prisma.location.findUnique({
    where: { storeId_code: { storeId, code: locationCode } },
  });
  if (!location) throw new Error(`仓库 ${locationCode} 不存在`);

  await prisma.$transaction(async (tx) => {
    await createInboundInventoryLot(tx, {
      storeId,
      skuId: sku.id,
      locationId: location.id,
      quantity,
      unitCost,
      costCurrency: row.currency?.trim() || "CNY",
      sourceType: "PURCHASE",
      sourceId: "CSV_IMPORT",
      receivedAt: row.received_at ? new Date(row.received_at) : new Date(),
      refType: "IMPORT",
      meta: {
        skuCode,
        locationCode,
        source: "CSV_IMPORT",
      },
    });
  });
}

async function importPurchaseLine(
  storeId: string,
  row: Record<string, string>,
  _rowNum: number,
  _errors: Array<{ row: number; message: string }>
) {
  const skuCode = row.sku_code?.trim();
  const quantity = row.quantity?.trim();
  const unitPrice = row.unit_price?.trim();
  const orderId = row.purchase_order_id?.trim();

  if (!skuCode || !quantity || !unitPrice) {
    throw new Error("SKU代码、数量和单价为必填项");
  }

  const sku = await prisma.sKU.findUnique({
    where: { storeId_code: { storeId, code: skuCode } },
  });
  if (!sku) throw new Error(`SKU ${skuCode} 不存在`);

  const qty = parseFloat(quantity);
  const price = parseFloat(unitPrice);

  if (orderId) {
    await prisma.purchaseLine.create({
      data: {
        purchaseOrderId: orderId,
        skuId: sku.id,
        quantity: qty,
        unitPrice: price,
        lineAmount: qty * price,
      },
    });
  }
}

async function importCustomerOrder(
  storeId: string,
  row: Record<string, string>,
  _rowNum: number,
  _errors: Array<{ row: number; message: string }>
) {
  const customerName = row.customer_name?.trim();
  const platformCode = row.platform_code?.trim();
  const currency = row.currency?.trim() || "JPY";

  if (!customerName) {
    throw new Error("客户名称为必填项");
  }

  let platformId: string | undefined;
  if (platformCode) {
    const platform = await prisma.platform.findUnique({
      where: { storeId_code: { storeId, code: platformCode } },
    });
    if (platform) platformId = platform.id;
  }

  const orderNumber = `ORD-${Date.now()}-${_rowNum}`;

  await prisma.customerOrder.create({
    data: {
      storeId,
      orderNumber,
      platformId,
      externalOrderNo: row.external_order_no?.trim() || undefined,
      customerName,
      orderDate: row.order_date ? new Date(row.order_date) : new Date(),
      currency,
      subtotal: 0,
      totalPaid: 0,
      countryFlow: row.country_flow?.trim() || "CN_TO_JP",
    },
  });
}
