"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createInboundInventoryLot } from "@/lib/application/inventory";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import {
  type ImportEntityType,
  validateImportRows,
} from "@/lib/application/import-validation";

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

  if (isSupportedImportEntityType(entityType) && rows.length === 0) {
    const emptyFileErrors = validateImportRows(entityType, rows);
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        successRows: 0,
        failedRows: 0,
        errorReport: emptyFileErrors as unknown as Prisma.InputJsonValue,
      },
    });

    return { success: 0, failed: 0, errors: emptyFileErrors };
  }

  if (isSupportedImportEntityType(entityType)) {
    const preflightErrors = [
      ...validateImportRows(entityType, rows),
      ...(await validateImportDatabaseState(storeId, entityType, rows)),
    ];
    if (preflightErrors.length > 0) {
      const failedRows = new Set(preflightErrors.map((error) => error.row)).size;
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          successRows: 0,
          failedRows,
          errorReport: preflightErrors as unknown as Prisma.InputJsonValue,
        },
      });

      return { success: 0, failed: failedRows, errors: preflightErrors };
    }
  }

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

function isSupportedImportEntityType(
  entityType: string
): entityType is ImportEntityType {
  return ["SKU", "INVENTORY_LOT", "PURCHASE_LINE", "CUSTOMER_ORDER"].includes(
    entityType
  );
}

async function validateImportDatabaseState(
  storeId: string,
  entityType: ImportEntityType,
  rows: Record<string, string>[]
) {
  const errors: Array<{ row: number; message: string }> = [];
  if (entityType === "SKU") {
    return validateSkuImportDatabaseState(storeId, rows);
  }
  if (entityType === "INVENTORY_LOT") {
    errors.push(...(await validateSkuCodeReferences(storeId, rows)));
    errors.push(...(await validateLocationCodeReferences(storeId, rows)));
  }
  if (entityType === "PURCHASE_LINE") {
    errors.push(...(await validateSkuCodeReferences(storeId, rows)));
    errors.push(...(await validatePurchaseOrderReferences(storeId, rows)));
  }
  if (entityType === "CUSTOMER_ORDER") {
    errors.push(...(await validatePlatformCodeReferences(storeId, rows)));
  }

  return errors;
}

async function validateSkuImportDatabaseState(
  storeId: string,
  rows: Record<string, string>[]
) {
  const errors: Array<{ row: number; message: string }> = [];
  const codes = rows
    .map((row) => row.code?.trim())
    .filter((code): code is string => Boolean(code));
  if (codes.length === 0) return errors;

  const existingSkus = await prisma.sKU.findMany({
    where: {
      storeId,
      code: { in: codes },
    },
    select: { code: true },
  });
  const existingCodes = new Set(existingSkus.map((sku) => sku.code));

  rows.forEach((row, index) => {
    const code = row.code?.trim();
    if (code && existingCodes.has(code)) {
      errors.push({
        row: index + 1,
        message: `SKU代码 ${code} 已存在`,
      });
    }
  });

  return errors;
}

async function validateSkuCodeReferences(
  storeId: string,
  rows: Record<string, string>[]
) {
  const codes = rows
    .map((row) => row.sku_code?.trim())
    .filter((code): code is string => Boolean(code));
  if (codes.length === 0) return [];

  const skus = await prisma.sKU.findMany({
    where: { storeId, code: { in: Array.from(new Set(codes)) } },
    select: { code: true },
  });
  const existingCodes = new Set(skus.map((sku) => sku.code));

  return rows.flatMap((row, index) => {
    const code = row.sku_code?.trim();
    if (!code || existingCodes.has(code)) return [];
    return [{ row: index + 1, message: `SKU ${code} 不存在` }];
  });
}

async function validateLocationCodeReferences(
  storeId: string,
  rows: Record<string, string>[]
) {
  const codes = rows
    .map((row) => row.location_code?.trim())
    .filter((code): code is string => Boolean(code));
  if (codes.length === 0) return [];

  const locations = await prisma.location.findMany({
    where: { storeId, code: { in: Array.from(new Set(codes)) } },
    select: { code: true },
  });
  const existingCodes = new Set(locations.map((location) => location.code));

  return rows.flatMap((row, index) => {
    const code = row.location_code?.trim();
    if (!code || existingCodes.has(code)) return [];
    return [{ row: index + 1, message: `仓库 ${code} 不存在` }];
  });
}

async function validatePlatformCodeReferences(
  storeId: string,
  rows: Record<string, string>[]
) {
  const codes = rows
    .map((row) => row.platform_code?.trim())
    .filter((code): code is string => Boolean(code));
  if (codes.length === 0) return [];

  const platforms = await prisma.platform.findMany({
    where: { storeId, code: { in: Array.from(new Set(codes)) } },
    select: { code: true },
  });
  const existingCodes = new Set(platforms.map((platform) => platform.code));

  return rows.flatMap((row, index) => {
    const code = row.platform_code?.trim();
    if (!code || existingCodes.has(code)) return [];
    return [{ row: index + 1, message: `平台 ${code} 不存在` }];
  });
}

async function validatePurchaseOrderReferences(
  storeId: string,
  rows: Record<string, string>[]
) {
  const ids = rows
    .map((row) => row.purchase_order_id?.trim())
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { storeId, id: { in: Array.from(new Set(ids)) } },
    select: { id: true },
  });
  const existingIds = new Set(purchaseOrders.map((order) => order.id));

  return rows.flatMap((row, index) => {
    const id = row.purchase_order_id?.trim();
    if (!id || existingIds.has(id)) return [];
    return [{ row: index + 1, message: `采购单 ${id} 不存在或不属于当前店铺` }];
  });
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
  await assertOperationalSku(prisma, {
    storeId,
    skuId: sku.id,
    actionLabel: "入库",
  });

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
  await assertOperationalSku(prisma, {
    storeId,
    skuId: sku.id,
    actionLabel: "采购",
  });

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
    if (!platform) throw new Error(`平台 ${platformCode} 不存在`);
    platformId = platform.id;
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
