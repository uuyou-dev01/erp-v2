"use server";

import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import {
  createInboundInventoryLot,
  createInboundItemUnit,
} from "@/lib/application/inventory";

const SUPPORTED_CURRENCIES = new Set(["CNY", "JPY", "USD", "EUR"]);
const MAX_LINES = 200;
const MAX_ITEM_UNITS_PER_LINE = 500;

export type OpeningStockTrackingMode = "LOT" | "ITEM_UNIT";

export interface CreateOpeningStockLineInput {
  skuId: string;
  locationId: string;
  trackingMode: OpeningStockTrackingMode;
  quantity: string;
  unitCost: string;
  currency: string;
  conditionGrade?: string;
  note?: string;
}

export interface CreateOpeningStockInput {
  storeId: string;
  openingAt: string;
  note?: string;
  lines: CreateOpeningStockLineInput[];
}

function parseNonNegativeDecimal(value: string, label: string) {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new Error(`${label}必须是有效数字`);
  }
  if (!decimal.isFinite() || decimal.lt(0)) {
    throw new Error(`${label}不能小于 0`);
  }
  return decimal;
}

function parsePositiveDecimal(value: string, label: string) {
  const decimal = parseNonNegativeDecimal(value, label);
  if (decimal.lte(0)) throw new Error(`${label}必须大于 0`);
  return decimal;
}

function openingDocumentNo(openingAt: Date) {
  const date = [
    openingAt.getFullYear(),
    String(openingAt.getMonth() + 1).padStart(2, "0"),
    String(openingAt.getDate()).padStart(2, "0"),
  ].join("");
  return `OPEN-${date}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function getOpeningStocks(storeId: string) {
  const context = await requireUserContext({ storeId });
  return prisma.openingStock.findMany({
    where: { storeId: context.activeStoreId },
    include: {
      lines: {
        select: {
          id: true,
          quantity: true,
          unitCost: true,
          currency: true,
        },
      },
    },
    orderBy: [{ openingAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getOpeningStockById(id: string) {
  const document = await prisma.openingStock.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          sku: {
            select: {
              id: true,
              code: true,
              name: true,
              catalogRole: true,
              parentSku: { select: { name: true } },
            },
          },
          location: {
            select: { id: true, code: true, name: true, region: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!document) return null;
  await requireUserContext({ storeId: document.storeId });
  return document;
}

export async function createOpeningStock(data: CreateOpeningStockInput) {
  const context = await requireUserContext({ storeId: data.storeId });
  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw new Error("请至少录入一行期初库存");
  }
  if (data.lines.length > MAX_LINES) {
    throw new Error(`单张期初库存单最多 ${MAX_LINES} 行`);
  }

  const openingAt = new Date(data.openingAt);
  if (Number.isNaN(openingAt.getTime())) {
    throw new Error("期初日期无效");
  }
  const futureLimit = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (openingAt > futureLimit) {
    throw new Error("期初日期不能晚于明天");
  }

  const normalizedLines = data.lines.map((line, index) => {
    const row = index + 1;
    const quantity = parsePositiveDecimal(line.quantity, `第 ${row} 行数量`);
    const unitCost = parseNonNegativeDecimal(line.unitCost, `第 ${row} 行单位成本`);
    const trackingMode =
      line.trackingMode === "ITEM_UNIT" ? "ITEM_UNIT" : "LOT";
    if (trackingMode === "ITEM_UNIT") {
      if (!quantity.isInteger()) {
        throw new Error(`第 ${row} 行按单件管理时，数量必须是整数`);
      }
      if (quantity.gt(MAX_ITEM_UNITS_PER_LINE)) {
        throw new Error(
          `第 ${row} 行单件数量不能超过 ${MAX_ITEM_UNITS_PER_LINE}`,
        );
      }
    }
    const currency = line.currency.trim().toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      throw new Error(`第 ${row} 行币种无效`);
    }
    if (!line.skuId || !line.locationId) {
      throw new Error(`第 ${row} 行请选择商品和仓库`);
    }
    return {
      ...line,
      trackingMode,
      currency,
      quantity,
      unitCost,
      conditionGrade: line.conditionGrade?.trim() || null,
      note: line.note?.trim() || null,
    };
  });

  const skuIds = [...new Set(normalizedLines.map((line) => line.skuId))];
  const locationIds = [
    ...new Set(normalizedLines.map((line) => line.locationId)),
  ];
  const [skus, locations] = await Promise.all([
    prisma.sKU.findMany({
      where: {
        id: { in: skuIds },
        storeId: context.activeStoreId,
      },
      select: { id: true, catalogRole: true },
    }),
    prisma.location.findMany({
      where: {
        id: { in: locationIds },
        storeId: context.activeStoreId,
      },
      select: { id: true },
    }),
  ]);
  if (skus.length !== skuIds.length) throw new Error("部分商品不存在或无权访问");
  if (skus.some((sku) => sku.catalogRole === "GROUP")) {
    throw new Error("商品组不承接库存，请选择具体规格或无规格商品");
  }
  if (locations.length !== locationIds.length) {
    throw new Error("部分仓库不存在或无权访问");
  }

  const documentNo = openingDocumentNo(openingAt);
  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.openingStock.create({
      data: {
        storeId: context.activeStoreId,
        documentNo,
        status: "POSTED",
        openingAt,
        note: data.note?.trim() || null,
        createdById: context.userId,
        postedById: context.userId,
        postedAt: new Date(),
      },
    });

    for (const [index, line] of normalizedLines.entries()) {
      const createdLine = await tx.openingStockLine.create({
        data: {
          openingStockId: created.id,
          skuId: line.skuId,
          locationId: line.locationId,
          trackingMode: line.trackingMode,
          quantity: line.quantity.toFixed(4),
          unitCost: line.unitCost.toFixed(4),
          currency: line.currency,
          conditionGrade: line.conditionGrade,
          note: line.note,
        },
      });
      const refMeta = {
        openingStockId: created.id,
        documentNo,
        lineNumber: index + 1,
      };

      if (line.trackingMode === "LOT") {
        const lot = await createInboundInventoryLot(tx, {
          storeId: context.activeStoreId,
          skuId: line.skuId,
          locationId: line.locationId,
          quantity: line.quantity.toFixed(4),
          unitCost: line.unitCost.toFixed(4),
          costCurrency: line.currency,
          sourceType: "OPENING_STOCK",
          sourceId: createdLine.id,
          receivedAt: openingAt,
          batchLabel: documentNo,
          refType: "OPENING_STOCK_LINE",
          refId: createdLine.id,
          ledgerReason: "OPENING_BALANCE",
          meta: refMeta,
        });
        await tx.openingStockLine.update({
          where: { id: createdLine.id },
          data: { generatedLotId: lot.id },
        });
      } else {
        const unitIds: string[] = [];
        for (let unitIndex = 0; unitIndex < line.quantity.toNumber(); unitIndex += 1) {
          const unit = await createInboundItemUnit(tx, {
            storeId: context.activeStoreId,
            skuId: line.skuId,
            locationId: line.locationId,
            unitCost: line.unitCost.toFixed(4),
            costCurrency: line.currency,
            conditionGrade: line.conditionGrade ?? undefined,
            notes: line.note ?? undefined,
            batchLabel: documentNo,
            sourceType: "OPENING_STOCK",
            sourceId: createdLine.id,
            receivedAt: openingAt,
            refType: "OPENING_STOCK_LINE",
            refId: createdLine.id,
            ledgerReason: "OPENING_BALANCE",
            meta: refMeta,
          });
          unitIds.push(unit.id);
        }
        await tx.openingStockLine.update({
          where: { id: createdLine.id },
          data: { generatedItemUnitIds: unitIds },
        });
      }
    }

    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
        actorId: context.userId,
        action: "OPENING_STOCK_POSTED",
        refType: "OPENING_STOCK",
        refId: created.id,
        message: `确认期初库存单 ${documentNo}，共 ${normalizedLines.length} 行`,
        after: {
          documentNo,
          openingAt: openingAt.toISOString(),
          lineCount: normalizedLines.length,
        },
      },
    });

    return created;
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/skus");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/opening-stock");
  for (const skuId of skuIds) {
    revalidatePath(`/inventory/skus/${skuId}`);
  }
  return document;
}

export async function createOpeningStockAction(data: CreateOpeningStockInput) {
  try {
    const document = await createOpeningStock(data);
    return actionSuccess({
      id: document.id,
      documentNo: document.documentNo,
    });
  } catch (error) {
    return toActionFailure(error, "确认期初库存失败，请重试");
  }
}
