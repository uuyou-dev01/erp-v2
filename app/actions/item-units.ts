"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { stringToDecimal } from "@/lib/decimal";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { createItemUnitWithIdentity } from "@/lib/application/item-unit-identity";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import { requireUserContext } from "@/lib/auth/user-context";
import { canViewInventoryCost, hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { hasLocationCapability } from "@/lib/auth/scope-access";
import {
  itemConditionReadyForSale,
  normalizeItemConditionType,
  normalizeItemFunctionStatus,
  normalizeUsedItemGrade,
  validateItemCondition,
} from "@/lib/inventory/item-condition";
import { deriveItemUnitOperationalState } from "@/lib/application/item-unit-operational-state";

async function requireInventoryManager(storeId: string) {
  const context = await requireUserContext({ storeId });
  if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) {
    throw new Error("只有库存管理员可以新增、编辑或删除单件库存");
  }
  return context;
}

/**
 * Get all item units for a store
 */
export async function getItemUnits(storeId: string) {
  const context = await requireUserContext({ storeId });
  const showCost = canViewInventoryCost(context.role);
  const items = await prisma.itemUnit.findMany({
    where: { storeId: context.activeStoreId },
    include: {
      sku: {
        include: {
          parentSku: { select: { code: true, name: true } },
        },
      },
      location: true,
      listings: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const itemIds = items.map((item) => item.id);
  const purchaseLineIds = items
    .filter((item) => item.sourceType === "PURCHASE")
    .map((item) => item.sourceId);
  const [afterSalesReceipts, inspections] = await Promise.all([
    itemIds.length > 0
      ? prisma.afterSalesReceipt.findMany({
          where: { itemUnitId: { in: itemIds } },
          select: { itemUnitId: true },
        })
      : Promise.resolve([]),
    itemIds.length > 0
      ? prisma.inspectionEvent.findMany({
          where: {
            storeId: context.activeStoreId,
            OR: [
              { refType: "ITEM_UNIT", refId: { in: itemIds } },
              ...(purchaseLineIds.length > 0
                ? [{ refType: "PURCHASE_LINE", refId: { in: purchaseLineIds } }]
                : []),
            ],
          },
          orderBy: { inspectedAt: "desc" },
          select: { refType: true, refId: true, result: true, failureReason: true },
        })
      : Promise.resolve([]),
  ]);
  const afterSalesItemIds = new Set(
    afterSalesReceipts
      .map((receipt) => receipt.itemUnitId)
      .filter((id): id is string => Boolean(id))
  );
  const inspectionByRef = new Map<
    string,
    { result: string; failureReason: string | null }
  >();
  for (const inspection of inspections) {
    const key = `${inspection.refType}:${inspection.refId}`;
    if (!inspectionByRef.has(key)) {
      inspectionByRef.set(key, {
        result: inspection.result,
        failureReason: inspection.failureReason,
      });
    }
  }

  return items.map((item) => {
    const inspection =
      inspectionByRef.get(`ITEM_UNIT:${item.id}`) ??
      (item.sourceType === "PURCHASE"
        ? inspectionByRef.get(`PURCHASE_LINE:${item.sourceId}`)
        : undefined);
    const photoCount = Array.isArray(item.photos) ? item.photos.length : 0;
    return {
      ...item,
      unitCost: showCost ? item.unitCost.toString() : null,
      costCurrency: showCost ? item.costCurrency : null,
      costHidden: !showCost,
      photoCount,
      activeListingCount: item.listings.length,
      operationalState: deriveItemUnitOperationalState({
        status: item.status,
        conditionType: item.conditionType,
        conditionGrade: item.conditionGrade,
        functionStatus: item.functionStatus,
        notes: item.notes,
        photoCount,
        sourceType: item.sourceType,
        locationName: item.location.name,
        locationSellable: item.location.isSellableDefault,
        latestInspectionResult: inspection?.result,
        latestInspectionFailureReason: inspection?.failureReason,
        hasAfterSalesReceipt: afterSalesItemIds.has(item.id),
      }),
    };
  });
}

/**
 * Get item unit by ID with full details
 */
export async function getItemUnitById(id: string) {
  const context = await requireUserContext();
  const item = await prisma.itemUnit.findUnique({
    where: { id },
    include: {
      sku: true,
      location: true,
      listings: {
        include: { platform: true },
        orderBy: { listedAt: "desc" },
      },
      allocations: {
        include: {
          orderLine: {
            include: {
              order: true,
            },
          },
        },
      },
    },
  });

  if (!item) return null;

  const canAccess =
    context.storeIds.includes(item.storeId) ||
    Boolean(item.inventoryPoolId && context.inventoryPoolIds.includes(item.inventoryPoolId));
  if (!canAccess) return null;
  let showCost = context.storeIds.includes(item.storeId) && canViewInventoryCost(context.role);
  if (!showCost && item.inventoryPoolId) {
    const poolAccess = await prisma.inventoryPoolAccess.findUnique({
      where: {
        inventoryPoolId_userId: {
          inventoryPoolId: item.inventoryPoolId,
          userId: context.userId,
        },
      },
      select: { permissions: true },
    });
    showCost = Boolean(
      poolAccess?.permissions &&
      typeof poolAccess.permissions === "object" &&
      !Array.isArray(poolAccess.permissions) &&
      (poolAccess.permissions as Record<string, unknown>).viewCost === true
    );
  }

  const unitCost = showCost
    ? typeof item.unitCost === "object" && item.unitCost !== null && "toString" in item.unitCost
      ? item.unitCost.toString()
      : String(item.unitCost)
    : null;

  // Get operational evidence separately. All item pages use the same projection.
  const [ledgerEntries, afterSalesReceipt, inspections] = await Promise.all([
    prisma.stockLedger.findMany({
      where: {
        entityType: "ITEM_UNIT",
        entityId: id,
      },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.afterSalesReceipt.findFirst({
      where: { itemUnitId: id },
      select: { id: true },
    }),
    prisma.inspectionEvent.findMany({
      where: {
        storeId: item.storeId,
        OR: [
          { refType: "ITEM_UNIT", refId: item.id },
          ...(item.sourceType === "PURCHASE"
            ? [{ refType: "PURCHASE_LINE", refId: item.sourceId }]
            : []),
        ],
      },
      orderBy: { inspectedAt: "desc" },
      take: 1,
      select: { result: true, failureReason: true },
    }),
  ]);
  const photoCount = Array.isArray(item.photos) ? item.photos.length : 0;

  return {
    ...item,
    unitCost,
    costCurrency: showCost ? item.costCurrency : null,
    costHidden: !showCost,
    operationalState: deriveItemUnitOperationalState({
      status: item.status,
      conditionType: item.conditionType,
      conditionGrade: item.conditionGrade,
      functionStatus: item.functionStatus,
      notes: item.notes,
      photoCount,
      sourceType: item.sourceType,
      locationName: item.location.name,
      locationSellable: item.location.isSellableDefault,
      latestInspectionResult: inspections[0]?.result,
      latestInspectionFailureReason: inspections[0]?.failureReason,
      hasAfterSalesReceipt: Boolean(afterSalesReceipt),
    }),
    listings: item.listings.map((listing) => ({
      ...listing,
      listedPrice: listing.listedPrice?.toString() ?? null,
      feeRateOverride: listing.feeRateOverride?.toString() ?? null,
      shippingFeeOverride: listing.shippingFeeOverride?.toString() ?? null,
      estimatedNet: listing.estimatedNet?.toString() ?? null,
    })),
    ledgerEntries: ledgerEntries.map((entry) => ({
      ...entry,
      deltaQty: entry.deltaQty.toString(),
    })),
  };
}

/**
 * Create a new item unit
 */
export async function createItemUnit(data: {
  storeId: string;
  skuId: string;
  locationId: string;
  unitCost: string;
  costCurrency: string;
  conditionType?: string;
  conditionGrade?: string;
  functionStatus?: string;
  photos?: string[];
  ownerId?: string;
  holderId?: string;
  notes?: string;
}) {
  await requireInventoryManager(data.storeId);
  await assertOperationalSku(prisma, {
    storeId: data.storeId,
    skuId: data.skuId,
    actionLabel: "创建单件库存",
  });

  const unitCostDecimal = stringToDecimal(data.unitCost);
  const conditionType = normalizeItemConditionType(
    data.conditionType ?? (data.conditionGrade ? "USED" : undefined)
  );
  const conditionGrade =
    conditionType === "USED" ? (normalizeUsedItemGrade(data.conditionGrade) ?? "UNASSESSED") : null;
  const functionStatus = normalizeItemFunctionStatus(data.functionStatus, conditionType);
  const conditionError = validateItemCondition({
    conditionType,
    conditionGrade,
    functionStatus,
    notes: data.notes,
  });
  if (conditionError) throw new Error(conditionError);
  const status = itemConditionReadyForSale({
    conditionType,
    conditionGrade,
    functionStatus,
    notes: data.notes,
    photoCount: data.photos?.length ?? 0,
  })
    ? "AVAILABLE"
    : "RETURN_CHECK";

  const item = await prisma.$transaction(async (tx) => {
    // Create item unit
    const newItem = await createItemUnitWithIdentity(tx, {
      storeId: data.storeId,
      data: {
        storeId: data.storeId,
        skuId: data.skuId,
        locationId: data.locationId,
        unitCost: unitCostDecimal,
        costCurrency: data.costCurrency,
        conditionType,
        conditionGrade,
        functionStatus,
        photos: data.photos || [],
        ownerId: data.ownerId,
        holderId: data.holderId,
        notes: data.notes,
        sourceType: "MANUAL",
        sourceId: "manual",
        status,
      },
    });

    // Write to stock ledger (INBOUND_PURCHASE)
    await tx.stockLedger.create({
      data: {
        storeId: data.storeId,
        occurredAt: new Date(),
        entityType: "ITEM_UNIT",
        entityId: newItem.id,
        locationId: data.locationId,
        deltaQty: stringToDecimal("1"),
        reason: "INBOUND_PURCHASE",
        refType: "MANUAL",
        refId: newItem.id,
      },
    });

    return newItem;
  });

  revalidatePath("/inventory/items");
  return item;
}

export async function createItemUnitAction(data: {
  storeId: string;
  skuId: string;
  locationId: string;
  unitCost: string;
  costCurrency: string;
  conditionType?: string;
  conditionGrade?: string;
  functionStatus?: string;
  photos?: string[];
  ownerId?: string;
  holderId?: string;
  notes?: string;
}) {
  try {
    const item = await createItemUnit(data);
    return actionSuccess({ id: item.id });
  } catch (error) {
    return toActionFailure(error, "创建单品失败，请重试");
  }
}

/**
 * Update item unit
 */
export async function updateItemUnit(
  id: string,
  data: {
    conditionType?: string;
    conditionGrade?: string;
    functionStatus?: string;
    photos?: string[];
    ownerId?: string;
    holderId?: string;
    notes?: string;
  }
) {
  const existing = await prisma.itemUnit.findUnique({
    where: { id },
    include: {
      allocations: {
        where: { status: { in: ["PENDING", "ALLOCATED", "SHIPPED"] } },
      },
    },
  });

  if (!existing) {
    throw new Error("单品不存在");
  }
  await requireInventoryManager(existing.storeId);

  if (!["AVAILABLE", "RETURN_CHECK"].includes(existing.status) || existing.allocations.length > 0) {
    throw new Error("仅可用或待复检且未分配订单的单件可以编辑");
  }

  const conditionType = normalizeItemConditionType(data.conditionType ?? existing.conditionType);
  const conditionGrade =
    conditionType === "USED"
      ? (normalizeUsedItemGrade(data.conditionGrade ?? existing.conditionGrade) ?? "UNASSESSED")
      : null;
  const functionStatus = normalizeItemFunctionStatus(
    data.functionStatus ?? existing.functionStatus,
    conditionType
  );
  const photos =
    data.photos ?? (Array.isArray(existing.photos) ? (existing.photos as string[]) : []);
  const notes = data.notes ?? existing.notes;
  const conditionFieldsChanged =
    data.conditionType !== undefined ||
    data.conditionGrade !== undefined ||
    data.functionStatus !== undefined ||
    data.notes !== undefined ||
    data.photos !== undefined;
  if (conditionFieldsChanged) {
    const conditionError = validateItemCondition({
      conditionType,
      conditionGrade,
      functionStatus,
      notes,
    });
    if (conditionError) throw new Error(conditionError);
  }
  const status = itemConditionReadyForSale({
    conditionType,
    conditionGrade,
    functionStatus,
    notes,
    photoCount: photos.length,
  })
    ? "AVAILABLE"
    : "RETURN_CHECK";

  const item = await prisma.itemUnit.update({
    where: { id },
    data: {
      conditionType,
      conditionGrade,
      functionStatus,
      photos,
      ownerId: data.ownerId,
      holderId: data.holderId,
      notes,
      status,
    },
  });

  revalidatePath("/inventory/items");
  revalidatePath(`/inventory/items/${id}`);
  return item;
}

export async function updateItemUnitAction(
  id: string,
  data: {
    conditionType?: string;
    conditionGrade?: string;
    functionStatus?: string;
    photos?: string[];
    ownerId?: string;
    holderId?: string;
    notes?: string;
  }
) {
  try {
    const item = await updateItemUnit(id, data);
    return actionSuccess({ id: item.id });
  } catch (error) {
    return toActionFailure(error, "保存单品失败，请重试");
  }
}

/**
 * Delete item unit when it has no blocking relations.
 */
export async function deleteItemUnit(id: string, storeId: string) {
  await requireInventoryManager(storeId);
  const item = await prisma.itemUnit.findFirst({
    where: { id, storeId },
    include: {
      allocations: {
        where: { status: { in: ["PENDING", "ALLOCATED", "SHIPPED"] } },
      },
      listings: { where: { status: "ACTIVE" } },
    },
  });

  if (!item) {
    throw new Error("单品不存在或无权删除");
  }

  if (item.status === "ALLOCATED") {
    throw new Error("该单品状态为已分配，无法删除。请先解除订单分配。");
  }

  if (item.allocations.length > 0) {
    throw new Error("该单品仍有关联订单分配，无法删除。");
  }

  if (item.listings.length > 0) {
    throw new Error("该单品仍有上架中的记录，请先下架后再删除。");
  }

  await prisma.$transaction(async (tx) => {
    await tx.listing.deleteMany({ where: { itemUnitId: id, storeId } });
    await tx.stockLedger.deleteMany({
      where: { storeId, entityType: "ITEM_UNIT", entityId: id },
    });
    await tx.itemUnit.delete({ where: { id } });
  });

  revalidatePath("/inventory/items");
  revalidatePath(`/inventory/items/${id}`);
  revalidatePath("/inventory/sellable");
}

export async function deleteItemUnitAction(id: string, storeId: string) {
  try {
    await deleteItemUnit(id, storeId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除单品失败，请重试");
  }
}

/**
 * Check if item unit is available (not allocated or consumed)
 */
export async function isItemUnitAvailable(id: string): Promise<boolean> {
  const item = await prisma.itemUnit.findUnique({
    where: { id },
    include: {
      allocations: {
        where: {
          status: {
            in: ["PENDING", "ALLOCATED"],
          },
        },
      },
    },
  });

  if (!item) return false;
  if (item.status !== "AVAILABLE") return false;
  if (item.allocations.length > 0) return false;

  return true;
}

export async function approveReturnInspection(itemUnitId: string, note?: string) {
  const item = await prisma.itemUnit.findUnique({ where: { id: itemUnitId } });
  if (!item) throw new Error("单品不存在");
  const context = await requireUserContext();
  const isManager =
    context.storeIds.includes(item.storeId) && hasRoleAtLeast(context.role, ROLES.MANAGER);
  const canInspect =
    context.locationIds.includes(item.locationId) &&
    (await hasLocationCapability(context.userId, item.locationId, "inspect"));
  if (!isManager && !canInspect) throw new Error("当前账号没有该仓库的质检权限");
  if (item.status !== "RETURN_CHECK") {
    throw new Error("只有处于待检查状态的单件可以放行");
  }

  const photoCount = Array.isArray(item.photos) ? item.photos.length : 0;
  if (
    !itemConditionReadyForSale({
      conditionType: item.conditionType,
      conditionGrade: item.conditionGrade,
      functionStatus: item.functionStatus,
      notes: item.notes,
      photoCount,
    })
  ) {
    throw new Error("品级、功能状态或必要图片尚未补齐，请先进入单件详情完成检查信息");
  }

  const inspectionNote = note?.trim();
  const mergedNotes = [item.notes, inspectionNote ? `检验放行：${inspectionNote}` : "检验放行"]
    .filter(Boolean)
    .join("\n");

  await prisma.$transaction(async (tx) => {
    await tx.itemUnit.update({
      where: { id: itemUnitId },
      data: {
        status: "AVAILABLE",
        notes: mergedNotes || undefined,
      },
    });
    await tx.inspectionEvent.create({
      data: {
        storeId: item.storeId,
        inventoryPoolId: item.inventoryPoolId,
        refType: "ITEM_UNIT",
        refId: item.id,
        locationId: item.locationId,
        result: "PASSED",
        details: { source: "WORKBENCH_RELEASE", note: inspectionNote ?? null },
      },
    });
  });

  revalidatePath("/inventory/items");
  revalidatePath(`/inventory/items/${itemUnitId}`);
  revalidatePath("/inventory/sellable");
  revalidatePath("/workbench");
}
