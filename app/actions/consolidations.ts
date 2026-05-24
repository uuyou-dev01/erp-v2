"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function addPurchaseOrdersToBatch(batchId: string, purchaseOrderIds: string[]) {
  const ids = Array.from(new Set(purchaseOrderIds)).filter(Boolean);
  if (ids.length === 0) return { success: 0, failed: 0 };

  const batch = await prisma.consolidationBatch.findUnique({
    where: { id: batchId },
    select: { id: true, storeId: true, status: true },
  });
  if (!batch) throw new Error("集运批次不存在");
  if (batch.status !== "OPEN") throw new Error("只能加入未封箱的集运批次");

  let success = 0;
  let failed = 0;
  for (const purchaseOrderId of ids) {
    try {
      const order = await prisma.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, storeId: batch.storeId, status: "RECEIVED" },
        include: { lines: true },
      });
      if (!order || order.lines.length === 0) {
        failed += 1;
        continue;
      }

      const lineIds = order.lines.map((line) => line.id);
      const existingLines = await prisma.consolidationBatchLine.findMany({
        where: {
          sourceType: "PURCHASE_LINE",
          sourceId: { in: lineIds },
          batch: { status: { in: ["OPEN", "SEALED", "SHIPPED"] } },
        },
        select: { sourceId: true },
      });
      const existingLineIds = new Set(existingLines.map((line) => line.sourceId));
      const linesToAdd = order.lines.filter((line) => !existingLineIds.has(line.id));
      if (linesToAdd.length === 0) {
        failed += 1;
        continue;
      }

      await prisma.consolidationBatchLine.createMany({
        data: linesToAdd.map((line) => ({
          batchId: batch.id,
          sourceType: "PURCHASE_LINE",
          sourceId: line.id,
          quantity: line.quantity,
        })),
      });
      success += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/logistics/consolidations");
  revalidatePath(`/logistics/consolidations/${batch.id}`);
  revalidatePath("/workbench");
  return { success, failed };
}

export async function getConsolidationBatches(storeId: string) {
  return prisma.consolidationBatch.findMany({
    where: { storeId },
    include: {
      fromLocation: true,
      toLocation: true,
      lines: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getConsolidationBatchById(id: string) {
  return prisma.consolidationBatch.findUnique({
    where: { id },
    include: {
      fromLocation: true,
      toLocation: true,
      lines: true,
    },
  });
}

export async function createConsolidationBatch(data: {
  storeId: string;
  fromLocationId?: string;
  toLocationId?: string;
  note?: string;
}) {
  const batch = await prisma.consolidationBatch.create({
    data: {
      storeId: data.storeId,
      fromLocationId: data.fromLocationId || null,
      toLocationId: data.toLocationId || null,
      note: data.note?.trim() || null,
    },
  });
  revalidatePath("/logistics/consolidations");
  return { id: batch.id };
}

export async function addPurchaseOrderToConsolidation(data: {
  batchId: string;
  purchaseOrderId: string;
}) {
  return addPurchaseOrdersToBatch(data.batchId, [data.purchaseOrderId]);
}

export async function addPurchaseOrdersToConsolidation(data: {
  batchId: string;
  purchaseOrderIds: string[];
}) {
  return addPurchaseOrdersToBatch(data.batchId, data.purchaseOrderIds);
}

export async function createConsolidationForPurchaseOrders(data: {
  storeId: string;
  purchaseOrderIds: string[];
  fromLocationId?: string;
  toLocationId?: string;
  note?: string;
}) {
  const batch = await createConsolidationBatch({
    storeId: data.storeId,
    fromLocationId: data.fromLocationId,
    toLocationId: data.toLocationId,
    note: data.note,
  });
  const result = await addPurchaseOrdersToBatch(batch.id, data.purchaseOrderIds);
  return { batchId: batch.id, ...result };
}

export async function updateConsolidationStatus(
  id: string,
  status: "OPEN" | "SEALED" | "SHIPPED" | "RECEIVED",
  data?: { outboundTrackingNo?: string; carrier?: string }
) {
  await prisma.consolidationBatch.update({
    where: { id },
    data: {
      status,
      outboundTrackingNo: data?.outboundTrackingNo?.trim() || undefined,
      carrier: data?.carrier?.trim() || undefined,
      shippedAt: status === "SHIPPED" ? new Date() : undefined,
      receivedAt: status === "RECEIVED" ? new Date() : undefined,
    },
  });
  revalidatePath("/logistics/consolidations");
  revalidatePath(`/logistics/consolidations/${id}`);
  revalidatePath("/workbench");
}
