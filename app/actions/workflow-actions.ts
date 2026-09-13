"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  normalizeItemConditionType,
  normalizeItemFunctionStatus,
  normalizeUsedItemGrade,
  validateItemCondition,
} from "@/lib/inventory/item-condition";
import type { EntityType } from "@/lib/application/next-actions";
import { retryQuickEntry } from "@/app/actions/quick-entries";
import {
  confirmOrder,
  cancelCustomerOrder,
  markOrderDelivered,
  markOrderReturned,
  markOrderShipped,
  saveOrderShippingProof,
  settleCustomerOrder,
} from "@/app/actions/customer-orders";
import { approveReturnInspection } from "@/app/actions/item-units";
import { shippingProofToJson, type ShippingProof } from "@/lib/application/shipping-proof";
import { confirmInboundShipmentDelivered, dispatchPurchaseTransfer } from "@/app/actions/logistics";
import { createListing } from "@/app/actions/listings";
import {
  addPurchaseOrderToConsolidation,
  createConsolidationForPurchaseOrders,
} from "@/app/actions/consolidations";
import {
  markPurchaseAsShipped,
  markPurchaseOrderArrived,
  receivePurchaseOrder,
  returnPurchaseOrder,
} from "@/app/actions/purchase-orders";
import {
  LOGISTICS_COST_SOURCE_TYPES,
  normalizeLogisticsCostInput,
  saveLogisticsShippingCost,
} from "@/lib/application/logistics-cost";

export interface FillLogisticsPayload {
  shippedWithoutTracking?: boolean;
  carrier?: string;
  etaDate?: string;
  destinationLocationId?: string;
  purchaseTrackingNo?: string;
  shippingCost?: string;
  shippingCurrency?: string;
  note?: string;
}

export interface ConfirmArrivalPayload {
  arrivedAt?: string;
  arrivalLocationId?: string;
  arrivalLocation?: string;
  isComplete?: boolean;
  needsInspection?: boolean;
  directInbound?: boolean;
  note?: string;
}

export interface ShipmentArrivalProcessingPayload extends ConfirmArrivalPayload, InspectionPayload {
  inboundLocationId?: string;
  returnReason?: string;
  trackingNo?: string;
  carrier?: string;
}

export interface InboundPayload {
  locationId?: string;
  location?: string;
  note?: string;
}

export interface ConsolidatePurchasePayload {
  batchMode?: "existing" | "new";
  batchId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  note?: string;
}

export interface TransferPurchasePayload {
  toLocationId?: string;
  trackingNo?: string;
  carrier?: string;
  etaDate?: string;
  shippingCost?: string;
  shippingCurrency?: string;
  note?: string;
}

export interface ReturnPurchasePayload {
  reason?: string;
  trackingNo?: string;
  carrier?: string;
  note?: string;
}

export interface InspectionPayload {
  result: "PASSED" | "FAILED";
  conditionType?: string;
  isNewSealed?: boolean;
  packageComplete?: boolean;
  missingParts?: string;
  conditionGrade?: string;
  functionStatus?: string;
  scratchNote?: string;
  serialNo?: string;
  note?: string;
}

export interface CreateListingPayload {
  platformIds: string[];
}

export interface ShipOrderPayload {
  confirmation?: import("@/lib/application/shipment-confirmation").ShipmentConfirmationInput;
  trackingNo?: string;
  shipper?: string;
  shippingMethod?: string;
  pickupCode?: string;
  proofNote?: string;
  imageUrls?: string[];
}

function buildShippingProof(payload: ShipOrderPayload): ShippingProof {
  return shippingProofToJson({
    shipper: clean(payload.shipper),
    shippingMethod: clean(payload.shippingMethod),
    pickupCode: clean(payload.pickupCode),
    proofNote: clean(payload.proofNote),
    imageUrls: payload.imageUrls?.filter(Boolean),
  });
}

export interface SettleOrderPayload {
  actualSalePrice?: string;
  platformFee?: string;
  shippingFee?: string;
  fxRate?: string;
}

function clean(value?: string | null) {
  return value?.trim() || undefined;
}

function todayInputDate(value?: string) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function optionalInputDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function logisticsNote(payload: FillLogisticsPayload) {
  return clean(payload.note);
}

function inspectionNote(payload: InspectionPayload) {
  return [
    payload.note,
    payload.conditionType ? `类型:${payload.conditionType}` : null,
    payload.isNewSealed ? "全新" : null,
    payload.packageComplete ? "包装完整" : null,
    payload.missingParts ? `缺件:${payload.missingParts}` : null,
    payload.conditionGrade ? `成色:${payload.conditionGrade}` : null,
    payload.functionStatus ? `功能:${payload.functionStatus}` : null,
    payload.scratchNote,
    payload.serialNo ? `编号:${payload.serialNo}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

async function updateQuickEntryConditionFromInspection(
  purchaseOrderId: string,
  payload: InspectionPayload
) {
  if (!payload.conditionType) return;
  const conditionType = normalizeItemConditionType(payload.conditionType);
  const conditionGrade =
    conditionType === "USED"
      ? (normalizeUsedItemGrade(payload.conditionGrade) ?? "UNASSESSED")
      : null;
  const functionStatus = normalizeItemFunctionStatus(payload.functionStatus, conditionType);
  const notes = [payload.scratchNote, payload.missingParts, payload.note]
    .filter(Boolean)
    .join(" / ");
  const conditionError = validateItemCondition({
    conditionType,
    conditionGrade,
    functionStatus,
    notes,
  });
  if (conditionError) throw new Error(conditionError);

  const lines = await prisma.purchaseLine.findMany({
    where: { purchaseOrderId },
    select: { id: true },
  });
  if (lines.length === 0) return;
  await prisma.quickEntry.updateMany({
    where: { generatedPurchaseLineId: { in: lines.map((line) => line.id) } },
    data: {
      conditionType,
      conditionGrade,
      functionStatus,
      batchNote: notes || undefined,
    },
  });
}

async function createPurchaseLineInspections(
  purchaseOrderId: string,
  locationId: string,
  payload: InspectionPayload
) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      storeId: true,
      lines: { select: { id: true } },
    },
  });
  if (!order) throw new Error("采购单不存在");
  if (order.lines.length === 0) return;

  const note = inspectionNote(payload);
  await prisma.inspectionEvent.createMany({
    data: order.lines.map((line) => ({
      storeId: order.storeId,
      refType: "PURCHASE_LINE",
      refId: line.id,
      locationId,
      result: payload.result,
      failureReason: payload.result === "FAILED" ? note || "到货检查未通过" : undefined,
      inspectedAt: new Date(),
      photos: payload.serialNo ? { serialNo: payload.serialNo } : undefined,
    })),
  });
}

async function resolveOrCreateLocation(storeId: string, locationText?: string) {
  const text = clean(locationText);
  if (!text) {
    const fallback = await prisma.location.findFirst({
      where: { storeId },
      orderBy: { createdAt: "asc" },
    });
    if (!fallback) throw new Error("请先创建至少一个仓库位置");
    return fallback.id;
  }

  const existing = await prisma.location.findFirst({
    where: {
      storeId,
      OR: [
        { name: { contains: text, mode: "insensitive" } },
        { code: { equals: text, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;

  const created = await prisma.location.create({
    data: {
      storeId,
      code: `LOC-${Date.now().toString(36).toUpperCase()}`,
      name: text,
      type: /转运|运输|在途|国际/i.test(text) ? "TRANSIT" : "WAREHOUSE",
      isSellableDefault: !/转运|运输|在途|国际/i.test(text),
    },
  });
  return created.id;
}

async function resolveSelectedLocation(
  storeId: string,
  locationId?: string,
  locationText?: string
) {
  const id = clean(locationId);
  if (!id) return resolveOrCreateLocation(storeId, locationText);

  const location = await prisma.location.findFirst({
    where: { id, storeId },
    select: { id: true },
  });
  if (!location) throw new Error("到货位置不存在，请重新选择");
  return location.id;
}

export async function submitFillLogistics(
  entityType: EntityType,
  entityId: string,
  payload: FillLogisticsPayload
) {
  if (entityType === "purchaseOrder") {
    if (!clean(payload.purchaseTrackingNo) && payload.shippedWithoutTracking !== true) {
      throw new Error("请填写采购物流单号，或明确勾选「暂无单号，确认已发货」");
    }
    if (!clean(payload.destinationLocationId)) {
      throw new Error("请选择预计到货位置");
    }
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: entityId },
      select: { storeId: true, currency: true },
    });
    if (!order) throw new Error("采购单不存在");
    const shippingCost = normalizeLogisticsCostInput(
      { amount: payload.shippingCost, currency: payload.shippingCurrency },
      order.currency
    );

    const shippedAt = new Date();
    await markPurchaseAsShipped({
      purchaseOrderId: entityId,
      shippedAt,
      trackingNo: clean(payload.purchaseTrackingNo),
      carrier: clean(payload.carrier),
      etaDate: optionalInputDate(payload.etaDate),
      destinationLocationId: clean(payload.destinationLocationId),
      shipmentNote: logisticsNote(payload),
      shipmentMode: "purchase_only",
    });
    if (shippingCost) {
      await saveLogisticsShippingCost(prisma, {
        storeId: order.storeId,
        sourceType: LOGISTICS_COST_SOURCE_TYPES.purchase,
        sourceId: entityId,
        amount: shippingCost.amount.toFixed(4),
        currency: shippingCost.currency,
        fallbackCurrency: order.currency,
        occurredAt: shippedAt,
        note: "采购卖家发货邮费",
      });
    }
    revalidatePath("/workbench");
    return { success: true };
  }

  throw new Error("当前对象不支持填写物流");
}

export async function submitConfirmArrival(
  entityType: EntityType,
  entityId: string,
  payload: ConfirmArrivalPayload
) {
  const arrivedAt = todayInputDate(payload.arrivedAt);

  if (entityType === "shipment") {
    const shipment = await prisma.inboundShipment.findUnique({
      where: { id: entityId },
      include: { purchaseOrder: true },
    });
    if (!shipment) throw new Error("物流段不存在");
    const locationId = await resolveSelectedLocation(
      shipment.storeId,
      payload.arrivalLocationId || shipment.toLocationId || undefined,
      payload.arrivalLocation
    );
    if (shipment.purchaseOrderId && shipment.purchaseOrder?.status !== "RECEIVED") {
      await markPurchaseOrderArrived({
        purchaseOrderId: shipment.purchaseOrderId,
        locationId,
        receivedAt: arrivedAt,
      });
    }
    await confirmInboundShipmentDelivered(entityId, arrivedAt, payload.note, locationId);
    revalidatePath("/workbench");
    return { success: true };
  }

  if (entityType === "purchaseOrder") {
    const order = await prisma.purchaseOrder.findUnique({ where: { id: entityId } });
    if (!order) throw new Error("采购单不存在");
    const locationId = await resolveSelectedLocation(
      order.storeId,
      payload.arrivalLocationId,
      payload.arrivalLocation
    );
    await markPurchaseOrderArrived({
      purchaseOrderId: entityId,
      locationId,
      receivedAt: arrivedAt,
    });
    revalidatePath("/workbench");
    return { success: true };
  }

  throw new Error("当前对象不支持确认到货");
}

export async function submitShipmentArrivalProcessing(
  entityType: EntityType,
  entityId: string,
  payload: ShipmentArrivalProcessingPayload
) {
  if (entityType !== "shipment") {
    throw new Error("当前对象不支持运输到达处理");
  }

  const arrivedAt = todayInputDate(payload.arrivedAt);
  const shipment = await prisma.inboundShipment.findUnique({
    where: { id: entityId },
    include: { purchaseOrder: true, inventoryLines: { select: { id: true } } },
  });
  if (!shipment) throw new Error("物流段不存在");

  const locationId = await resolveSelectedLocation(
    shipment.storeId,
    payload.inboundLocationId || payload.arrivalLocationId || shipment.toLocationId || undefined,
    payload.arrivalLocation
  );

  if (!shipment.purchaseOrderId || !shipment.purchaseOrder) {
    if (shipment.inventoryLines.length === 0) {
      throw new Error("该物流段没有关联库存，无法确认到货");
    }
    if (payload.result === "FAILED") {
      await prisma.inboundShipment.update({
        where: { id: shipment.id },
        data: {
          status: "EXCEPTION",
          shipmentNote: inspectionNote(payload) || "目标仓检查未通过",
        },
      });
      revalidatePath("/workbench");
      return { success: true };
    }
    await confirmInboundShipmentDelivered(entityId, arrivedAt, payload.note, locationId);
    revalidatePath("/workbench");
    revalidatePath("/inventory/sellable");
    return { success: true };
  }

  if (shipment.purchaseOrder.status !== "RECEIVED") {
    await markPurchaseOrderArrived({
      purchaseOrderId: shipment.purchaseOrderId,
      locationId,
      receivedAt: arrivedAt,
    });
  }
  await confirmInboundShipmentDelivered(entityId, arrivedAt, payload.note, locationId);
  await createPurchaseLineInspections(shipment.purchaseOrderId, locationId, payload);

  if (payload.result === "FAILED") {
    await submitReturnPurchase("purchaseOrder", shipment.purchaseOrderId, {
      reason: payload.returnReason || inspectionNote(payload) || "运输到达检查异常",
      trackingNo: payload.trackingNo,
      carrier: payload.carrier,
      note: payload.note,
    });
    revalidatePath("/workbench");
    return { success: true };
  }

  await updateQuickEntryConditionFromInspection(shipment.purchaseOrderId, payload);

  await receivePurchaseOrder({
    purchaseOrderId: shipment.purchaseOrderId,
    locationId,
    receivedAt: arrivedAt,
  });

  revalidatePath("/workbench");
  return { success: true };
}

export async function submitInbound(
  entityType: EntityType,
  entityId: string,
  payload: InboundPayload
) {
  if (entityType !== "purchaseOrder") {
    throw new Error("当前对象不支持确认入库");
  }
  const order = await prisma.purchaseOrder.findUnique({ where: { id: entityId } });
  if (!order) throw new Error("采购单不存在");
  const locationId = await resolveSelectedLocation(
    order.storeId,
    payload.locationId,
    payload.location
  );
  await receivePurchaseOrder({
    purchaseOrderId: entityId,
    locationId,
    receivedAt: order.receivedAt ?? new Date(),
  });
  await createPurchaseLineInspections(entityId, locationId, {
    result: "PASSED",
    note: payload.note || "待分流确认入库",
  });
  revalidatePath("/workbench");
  revalidatePath("/inventory/sellable");
  return {
    success: true,
    sellablePageHref: "/inventory/sellable?from=workbench&unlisted=1",
  };
}

export async function submitConsolidatePurchase(
  entityType: EntityType,
  entityId: string,
  payload: ConsolidatePurchasePayload
) {
  if (entityType !== "purchaseOrder") {
    throw new Error("当前对象不支持加入集运");
  }
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: entityId },
    select: { id: true, storeId: true, status: true, destinationLocationId: true },
  });
  if (!order) throw new Error("采购单不存在");
  if (order.status !== "RECEIVED") throw new Error("只有待分流采购单可以加入集运");

  if (payload.batchMode === "new") {
    await createConsolidationForPurchaseOrders({
      storeId: order.storeId,
      purchaseOrderIds: [order.id],
      fromLocationId: payload.fromLocationId || order.destinationLocationId || undefined,
      toLocationId: payload.toLocationId,
      note: payload.note,
    });
  } else {
    if (!payload.batchId) throw new Error("请选择集运批次");
    await addPurchaseOrderToConsolidation({
      batchId: payload.batchId,
      purchaseOrderId: order.id,
    });
  }

  revalidatePath("/workbench");
  return { success: true };
}

export async function submitTransferPurchase(
  entityType: EntityType,
  entityId: string,
  payload: TransferPurchasePayload
) {
  if (entityType !== "purchaseOrder") {
    throw new Error("当前对象不支持发往其他位置");
  }
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: entityId },
    select: {
      id: true,
      storeId: true,
      status: true,
      destinationLocationId: true,
      receivedAt: true,
      lines: { select: { id: true } },
    },
  });
  if (!order) throw new Error("采购单不存在");
  if (order.status !== "RECEIVED") throw new Error("只有待分流采购单可以发往其他位置");
  if (!order.destinationLocationId) throw new Error("采购单没有记录当前到货位置");
  if (!clean(payload.toLocationId)) throw new Error("请选择目标位置");

  const toLocationId = await resolveSelectedLocation(order.storeId, payload.toLocationId);
  await createPurchaseLineInspections(order.id, order.destinationLocationId, {
    result: "PASSED",
    note: payload.note || "分流检查通过，立即发起转仓",
  });
  const shipment = await dispatchPurchaseTransfer({
    purchaseOrderId: order.id,
    toLocationId,
    trackingNo: clean(payload.trackingNo),
    carrier: clean(payload.carrier),
    shippingCost: clean(payload.shippingCost),
    shippingCurrency: clean(payload.shippingCurrency),
    etaDate: optionalInputDate(payload.etaDate),
    note: clean(payload.note),
  });

  revalidatePath("/workbench");
  revalidatePath("/logistics/consolidations");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  return {
    success: true,
    shipmentId: shipment.id,
    inventoryPageHref: "/inventory/lots",
  };
}

export async function submitReturnPurchase(
  entityType: EntityType,
  entityId: string,
  payload: ReturnPurchasePayload
) {
  if (entityType !== "purchaseOrder") {
    throw new Error("当前对象不支持退货终止");
  }
  const returnNote = [
    payload.reason ? `退货原因:${payload.reason}` : "退货终止",
    payload.trackingNo ? `退货单号:${payload.trackingNo}` : null,
    payload.carrier ? `承运商:${payload.carrier}` : null,
    payload.note,
  ]
    .filter(Boolean)
    .join(" / ");

  await returnPurchaseOrder({
    purchaseOrderId: entityId,
    note: returnNote,
  });
  return { success: true };
}

export async function submitCreateListing(
  entityType: EntityType,
  entityId: string,
  payload: CreateListingPayload
) {
  const platformIds = [...new Set(payload.platformIds.filter(Boolean))];
  if (platformIds.length === 0) throw new Error("请至少选择一个平台");

  if (entityType === "sku") {
    const sku = await prisma.sKU.findUnique({
      where: { id: entityId },
      select: { id: true, code: true, storeId: true },
    });
    if (!sku) throw new Error("SKU 不存在");

    const platforms = await prisma.platform.findMany({
      where: { storeId: sku.storeId, id: { in: platformIds } },
      select: { id: true },
    });
    if (platforms.length !== platformIds.length) throw new Error("包含无效的平台");

    const existing = await prisma.listing.findMany({
      where: {
        storeId: sku.storeId,
        skuId: sku.id,
        platformId: { in: platformIds },
        status: "ACTIVE",
      },
      select: { platformId: true },
    });
    const existingIds = new Set(existing.map((row) => row.platformId));
    const toCreate = platformIds.filter((id) => !existingIds.has(id));
    if (toCreate.length === 0) throw new Error("所选平台均已有 Listing");

    const results = [];
    for (const platformId of toCreate) {
      const result = await createListing({
        storeId: sku.storeId,
        platformId,
        listingType: "SKU",
        skuId: sku.id,
      });
      if (!result.success) throw new Error(result.error);
      results.push(result);
    }

    revalidatePath("/workbench");
    revalidatePath("/inventory/skus");
    revalidatePath(`/inventory/skus/${sku.id}`);
    revalidatePath("/inventory/coverage");
    revalidatePath("/inventory/coverage/pending");
    revalidatePath("/inventory/sellable");
    return {
      ids: results.map((row) => row.id),
      skuId: sku.id,
      skuCode: sku.code,
      listingPageHref: "/inventory/sellable",
      skuPageHref: `/inventory/skus/${sku.id}`,
    };
  }

  if (entityType === "itemUnit") {
    const item = await prisma.itemUnit.findUnique({ where: { id: entityId } });
    if (!item) throw new Error("单件商品不存在");
    const platforms = await prisma.platform.findMany({
      where: { storeId: item.storeId, id: { in: platformIds } },
      select: { id: true },
    });
    if (platforms.length !== platformIds.length) throw new Error("包含无效的平台");

    const existing = await prisma.listing.findMany({
      where: {
        storeId: item.storeId,
        itemUnitId: item.id,
        platformId: { in: platformIds },
        status: "ACTIVE",
      },
      select: { platformId: true },
    });
    const existingIds = new Set(existing.map((row) => row.platformId));
    const toCreate = platformIds.filter((id) => !existingIds.has(id));
    if (toCreate.length === 0) throw new Error("所选平台均已有 Listing");

    const sku = await prisma.sKU.findUnique({
      where: { id: item.skuId },
      select: { id: true, code: true },
    });

    const results = [];
    for (const platformId of toCreate) {
      const result = await createListing({
        storeId: item.storeId,
        platformId,
        listingType: "ITEM_UNIT",
        itemUnitId: item.id,
      });
      if (!result.success) throw new Error(result.error);
      results.push(result);
    }
    revalidatePath("/workbench");
    revalidatePath(`/inventory/items/${item.id}`);
    revalidatePath(`/inventory/skus/${item.skuId}`);
    revalidatePath("/inventory/coverage");
    revalidatePath("/inventory/coverage/pending");
    revalidatePath("/inventory/sellable");
    return {
      ids: results.map((row) => row.id),
      skuId: sku?.id ?? item.skuId,
      skuCode: sku?.code,
      listingPageHref: "/inventory/sellable",
      skuPageHref: sku ? `/inventory/skus/${sku.id}` : undefined,
    };
  }

  if (entityType === "inventoryLot") {
    const lot = await prisma.inventoryLot.findUnique({ where: { id: entityId } });
    if (!lot) throw new Error("库存批次不存在");
    const platforms = await prisma.platform.findMany({
      where: { storeId: lot.storeId, id: { in: platformIds } },
      select: { id: true },
    });
    if (platforms.length !== platformIds.length) throw new Error("包含无效的平台");

    const existing = await prisma.listing.findMany({
      where: {
        storeId: lot.storeId,
        skuId: lot.skuId,
        platformId: { in: platformIds },
        status: "ACTIVE",
      },
      select: { platformId: true },
    });
    const existingIds = new Set(existing.map((row) => row.platformId));
    const toCreate = platformIds.filter((id) => !existingIds.has(id));
    if (toCreate.length === 0) throw new Error("所选平台均已有 Listing");

    const sku = await prisma.sKU.findUnique({
      where: { id: lot.skuId },
      select: { id: true, code: true },
    });

    const results = [];
    for (const platformId of toCreate) {
      const result = await createListing({
        storeId: lot.storeId,
        platformId,
        listingType: "SKU",
        skuId: lot.skuId,
      });
      if (!result.success) throw new Error(result.error);
      results.push(result);
    }
    revalidatePath("/workbench");
    revalidatePath("/inventory/skus");
    revalidatePath(`/inventory/skus/${lot.skuId}`);
    revalidatePath("/inventory/coverage");
    revalidatePath("/inventory/coverage/pending");
    revalidatePath("/inventory/sellable");
    return {
      ids: results.map((row) => row.id),
      skuId: sku?.id ?? lot.skuId,
      skuCode: sku?.code,
      listingPageHref: "/inventory/sellable",
      skuPageHref: sku ? `/inventory/skus/${sku.id}` : undefined,
    };
  }

  throw new Error("当前对象不支持添加上架记录");
}

export async function submitSaveShippingProof(
  entityId: string,
  payload: ShipOrderPayload & { removedImageUrls?: string[] }
) {
  await saveOrderShippingProof(entityId, buildShippingProof(payload), {
    trackingNo: clean(payload.trackingNo),
    removedImageUrls: payload.removedImageUrls,
  });
  revalidatePath("/workbench");
  return { success: true };
}

export async function submitConfirmDelivery(entityId: string) {
  await markOrderDelivered(entityId);
  revalidatePath("/workbench");
  return { success: true };
}

export interface RegisterReturnPayload {
  note?: string;
  returnTrackingNo?: string;
  restockMode?: "RETURN_CHECK" | "AVAILABLE";
  refundAmount?: string;
  platformFeeReversal?: string;
  shippingFeeReversal?: string;
}

export interface CancelOrderPayload {
  reason?: string;
}

export interface ApproveReturnInspectionPayload {
  note?: string;
}

export async function submitCancelOrder(entityId: string, payload: CancelOrderPayload) {
  await cancelCustomerOrder(entityId, clean(payload.reason));
  revalidatePath("/workbench");
  return { success: true };
}

export async function submitRegisterReturn(entityId: string, payload: RegisterReturnPayload) {
  await markOrderReturned(entityId, {
    note: clean(payload.note),
    returnTrackingNo: clean(payload.returnTrackingNo),
    restockMode: payload.restockMode,
    refundAmount: clean(payload.refundAmount),
    platformFeeReversal: clean(payload.platformFeeReversal),
    shippingFeeReversal: clean(payload.shippingFeeReversal),
  });
  revalidatePath("/workbench");
  return { success: true };
}

export async function submitApproveReturnInspection(
  entityId: string,
  payload: ApproveReturnInspectionPayload
) {
  await approveReturnInspection(entityId, clean(payload.note));
  revalidatePath("/workbench");
  return { success: true };
}

export async function submitShipOrder(entityId: string, payload: ShipOrderPayload) {
  await markOrderShipped(entityId, {
    trackingNo: clean(payload.trackingNo),
    shippingProof: buildShippingProof(payload),
    confirmation: payload.confirmation,
  });
  revalidatePath("/workbench");
  return { success: true };
}

export async function submitSettleOrder(entityId: string, payload: SettleOrderPayload) {
  await settleCustomerOrder(entityId, {
    actualSalePrice: clean(payload.actualSalePrice),
    platformFee: clean(payload.platformFee),
    shippingFee: clean(payload.shippingFee),
    fxRate: clean(payload.fxRate),
  });
  return { success: true };
}

export async function submitConfirmOrder(entityId: string) {
  await confirmOrder({ orderId: entityId });
  revalidatePath("/workbench");
  return { success: true };
}

export async function submitResolveException(entityType: EntityType, entityId: string) {
  if (entityType === "quickEntry") return retryQuickEntry(entityId);
  throw new Error("当前异常需要打开完整详情处理");
}
