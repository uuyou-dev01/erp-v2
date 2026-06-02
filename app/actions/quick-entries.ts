"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  createAndProcessQuickEntry,
  createGroupedPurchaseQuickEntries,
  inspectQuickEntry,
  processQuickEntry,
  updateAndProcessQuickEntry,
  type QuickEntryRowInput,
} from "@/lib/application/quick-entry";

export async function getQuickEntries(storeId: string, limit = 50) {
  const entries = await prisma.quickEntry.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return entries.map((e) => ({
    ...e,
    quantity: e.quantity.toString(),
    purchasePrice: e.purchasePrice?.toString() ?? null,
    purchaseShippingFee: e.purchaseShippingFee?.toString() ?? null,
    transitShippingFee: e.transitShippingFee?.toString() ?? null,
    salePrice: e.salePrice?.toString() ?? null,
    saleShippingFee: e.saleShippingFee?.toString() ?? null,
    saleMiscFee: e.saleMiscFee?.toString() ?? null,
  }));
}

export async function getQuickEntryStats(storeId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayCount, pending, partial, failed] = await Promise.all([
    prisma.quickEntry.count({
      where: { storeId, createdAt: { gte: todayStart } },
    }),
    prisma.quickEntry.count({
      where: { storeId, processedStatus: "PENDING" },
    }),
    prisma.quickEntry.count({
      where: { storeId, processedStatus: "PARTIAL" },
    }),
    prisma.quickEntry.count({
      where: { storeId, processedStatus: "FAILED" },
    }),
  ]);

  return { todayCount, pending, partial, failed };
}

export async function saveQuickEntryRow(input: QuickEntryRowInput) {
  try {
    const result = await createAndProcessQuickEntry(input);
    revalidatePaths();
    return { success: true as const, ...result };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "保存失败",
    };
  }
}

export async function saveQuickEntryBatch(rows: QuickEntryRowInput[]) {
  const results: Array<{ index: number; success: boolean; error?: string; entryId?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const result = await createAndProcessQuickEntry(rows[i]);
      results.push({ index: i, success: true, entryId: result.entryId });
    } catch (error) {
      results.push({
        index: i,
        success: false,
        error: error instanceof Error ? error.message : "保存失败",
      });
    }
  }

  revalidatePaths();
  return {
    total: rows.length,
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

export async function saveQuickEntryBatchGrouped(rows: QuickEntryRowInput[]) {
  try {
    const result = await createGroupedPurchaseQuickEntries(rows);
    revalidatePaths();
    return {
      total: rows.length,
      success: result.entryIds.length,
      failed: 0,
      results: result.entryIds.map((entryId, index) => ({
        index,
        success: true,
        entryId,
      })),
      purchaseOrderId: result.purchaseOrderId,
    };
  } catch (error) {
    return {
      total: rows.length,
      success: 0,
      failed: rows.length,
      results: rows.map((_, index) => ({
        index,
        success: false,
        error: error instanceof Error ? error.message : "合并采购单失败",
      })),
    };
  }
}

export async function updateQuickEntry(entryId: string, input: Partial<QuickEntryRowInput>) {
  try {
    const result = await updateAndProcessQuickEntry(entryId, input);
    revalidatePaths();
    return { success: true as const, ...result };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "更新失败",
    };
  }
}

export async function inspectQuickEntryAction(
  entryId: string,
  result: "PASSED" | "FAILED",
  note?: string
) {
  try {
    const data = await inspectQuickEntry(entryId, result, note);
    revalidatePaths();
    return { success: true as const, ...data };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "检查失败",
    };
  }
}

export async function getQuickEntryById(entryId: string) {
  const entry = await prisma.quickEntry.findUnique({ where: { id: entryId } });
  if (!entry) return null;
  return {
    ...entry,
    quantity: entry.quantity.toString(),
    purchasePrice: entry.purchasePrice?.toString() ?? null,
    purchaseShippingFee: entry.purchaseShippingFee?.toString() ?? null,
    transitShippingFee: entry.transitShippingFee?.toString() ?? null,
    salePrice: entry.salePrice?.toString() ?? null,
    saleShippingFee: entry.saleShippingFee?.toString() ?? null,
    saleMiscFee: entry.saleMiscFee?.toString() ?? null,
  };
}

export async function retryQuickEntry(entryId: string) {
  try {
    const result = await processQuickEntry(entryId);
    revalidatePaths();
    return { success: true as const, ...result };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "重试失败",
    };
  }
}

export async function getIncompleteQuickEntries(storeId: string) {
  return prisma.quickEntry.findMany({
    where: {
      storeId,
      processedStatus: { in: ["PARTIAL", "FAILED", "PENDING"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
}

/** Parse tab-separated paste (Google Sheets) into row inputs */
export async function parsePasteRows(
  storeId: string,
  pasteText: string
): Promise<QuickEntryRowInput[]> {
  const lines = pasteText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const rows: QuickEntryRowInput[] = [];

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 3) continue;

    // Align with sheet: brand, name, variant, category, condition, price, currency, platform, date, ...
    const [
      brand,
      productName,
      variant,
      category,
      conditionType,
      purchasePrice,
      purchaseCurrency,
      purchasePlatform,
      purchaseDate,
      batchNote,
      listingPlatforms,
      purchaseTracking,
      purchaseShipping,
      location,
      transitTracking,
      transitShipping,
      statusCol,
      salePlatform,
      saleCurrency,
      saleTracking,
      salePrice,
      saleShipping,
      saleMisc,
      saleFee,
      saleDate,
    ] = cols.map((c) => c?.trim());

    if (!productName) continue;

    rows.push({
      storeId,
      sourceType: "PASTE",
      rawBrand: brand,
      rawProductName: productName,
      rawVariant: variant,
      rawCategory: category,
      conditionType: conditionType || "新品",
      purchasePrice,
      purchaseCurrency: purchaseCurrency || "CNY",
      purchasePlatformText: purchasePlatform,
      purchaseDate: purchaseDate || undefined,
      batchNote,
      listingPlatformsText: listingPlatforms,
      purchaseTrackingNo: purchaseTracking,
      purchaseShippingFee: purchaseShipping,
      currentLocationText: location,
      transitTrackingNo: transitTracking,
      transitShippingFee: transitShipping,
      salePlatformText: salePlatform,
      saleCurrency: saleCurrency,
      salePrice,
      saleShippingFee: saleShipping,
      saleMiscFee: saleMisc,
      salePlatformFeeText: saleFee,
      saleDate: saleDate || undefined,
      note: [statusCol, saleTracking].filter(Boolean).join(" / "),
    });
  }

  return rows;
}

function revalidatePaths() {
  revalidatePath("/workbench");
  revalidatePath("/dashboard");
  revalidatePath("/inventory/skus");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  revalidatePath("/procurement");
  revalidatePath("/inventory/coverage");
  revalidatePath("/inventory/coverage/pending");
  revalidatePath("/sales");
  revalidatePath("/reports");
}
