"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { EntityType } from "@/lib/application/next-actions";
import { retryQuickEntry } from "@/app/actions/quick-entries";
import { confirmOrder, markOrderShipped, settleCustomerOrder } from "@/app/actions/customer-orders";
import { confirmInboundShipmentDelivered } from "@/app/actions/logistics";
import { createListing } from "@/app/actions/listings";
import {
  addPurchaseOrderToConsolidation,
  createConsolidationForPurchaseOrders,
} from "@/app/actions/consolidations";
import {
  markPurchaseAsShipped,
  markPurchaseOrderArrived,
  receivePurchaseOrder,
} from "@/app/actions/purchase-orders";

export interface FillLogisticsPayload {
  carrier?: string;
  etaDate?: string;
  destinationLocationId?: string;
  purchaseTrackingNo?: string;
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
  scratchNote?: string;
  serialNo?: string;
  note?: string;
}

export interface CreateListingPayload {
  platformIds: string[];
}

export interface ShipOrderPayload {
  trackingNo?: string;
  shipper?: string;
  shippingMethod?: string;
  proofNote?: string;
}

export interface SettleOrderPayload {
  actualSalePrice?: string;
  platformFee?: string;
  shippingFee?: string;
  actualReceived?: string;
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
    payload.scratchNote,
    payload.serialNo ? `编号:${payload.serialNo}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
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

async function resolvePlatformId(storeId: string, platformText?: string) {
  const text = clean(platformText);
  if (!text) throw new Error("请填写上架平台");

  const platform = await prisma.platform.findFirst({
    where: {
      storeId,
      OR: [
        { name: { contains: text, mode: "insensitive" } },
        { code: { equals: text, mode: "insensitive" } },
        { code: { contains: text, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!platform) throw new Error(`未找到平台：${text}`);
  return platform.id;
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

async function resolveSelectedLocation(storeId: string, locationId?: string, locationText?: string) {
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
    if (!clean(payload.destinationLocationId)) {
      throw new Error("请选择预计到货位置");
    }
    await markPurchaseAsShipped({
      purchaseOrderId: entityId,
      shippedAt: new Date(),
      trackingNo: clean(payload.purchaseTrackingNo),
      carrier: clean(payload.carrier),
      etaDate: optionalInputDate(payload.etaDate),
      destinationLocationId: clean(payload.destinationLocationId),
      shipmentNote: logisticsNote(payload),
      shipmentMode: "purchase_only",
    });
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
    if (shipment.purchaseOrderId && shipment.purchaseOrder?.status !== "RECEIVED") {
      const locationId = await resolveSelectedLocation(
        shipment.storeId,
        payload.arrivalLocationId,
        payload.arrivalLocation
      );
      await markPurchaseOrderArrived({
        purchaseOrderId: shipment.purchaseOrderId,
        locationId,
        receivedAt: arrivedAt,
      });
    }
    await confirmInboundShipmentDelivered(entityId, arrivedAt, payload.note);
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
    include: { purchaseOrder: true },
  });
  if (!shipment) throw new Error("物流段不存在");
  if (!shipment.purchaseOrderId || !shipment.purchaseOrder) {
    throw new Error("该物流段没有关联采购单，无法入库");
  }

  const locationId = await resolveSelectedLocation(
    shipment.storeId,
    payload.inboundLocationId || payload.arrivalLocationId,
    payload.arrivalLocation
  );

  if (shipment.purchaseOrder.status !== "RECEIVED") {
    await markPurchaseOrderArrived({
      purchaseOrderId: shipment.purchaseOrderId,
      locationId,
      receivedAt: arrivedAt,
    });
  }
  await confirmInboundShipmentDelivered(entityId, arrivedAt, payload.note);
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
  const locationId = await resolveSelectedLocation(order.storeId, payload.locationId, payload.location);
  await createPurchaseLineInspections(entityId, locationId, {
    result: "PASSED",
    note: payload.note || "待分流确认入库",
  });
  await receivePurchaseOrder({
    purchaseOrderId: entityId,
    locationId,
    receivedAt: order.receivedAt ?? new Date(),
  });
  revalidatePath("/workbench");
  return { success: true };
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
    include: { inboundShipments: { select: { legIndex: true } } },
  });
  if (!order) throw new Error("采购单不存在");
  if (order.status !== "RECEIVED") throw new Error("只有待分流采购单可以发往其他位置");
  if (!clean(payload.toLocationId)) throw new Error("请选择目标位置");

  const toLocationId = await resolveSelectedLocation(order.storeId, payload.toLocationId);
  const maxLegIndex = order.inboundShipments.reduce(
    (max, shipment) => Math.max(max, shipment.legIndex),
    1
  );

  await prisma.inboundShipment.create({
    data: {
      storeId: order.storeId,
      purchaseOrderId: order.id,
      legIndex: maxLegIndex + 1,
      fromLocationId: order.destinationLocationId,
      toLocationId,
      trackingNo: clean(payload.trackingNo) ?? null,
      carrier: clean(payload.carrier) ?? null,
      etaDate: optionalInputDate(payload.etaDate),
      shippedAt: new Date(),
      status: "IN_TRANSIT",
      shipmentNote: clean(payload.note) ?? null,
    },
  });

  revalidatePath("/workbench");
  revalidatePath("/logistics/consolidations");
  return { success: true };
}

export async function submitReturnPurchase(
  entityType: EntityType,
  entityId: string,
  payload: ReturnPurchasePayload
) {
  if (entityType !== "purchaseOrder") {
    throw new Error("当前对象不支持退货终止");
  }
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: entityId },
    select: { id: true, status: true, shipmentNote: true },
  });
  if (!order) throw new Error("采购单不存在");
  if (order.status !== "RECEIVED") throw new Error("只有待分流采购单可以退货终止");

  const returnNote = [
    payload.reason ? `退货原因:${payload.reason}` : "退货终止",
    payload.trackingNo ? `退货单号:${payload.trackingNo}` : null,
    payload.carrier ? `承运商:${payload.carrier}` : null,
    payload.note,
  ].filter(Boolean).join(" / ");

  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      status: "RETURNED",
      shipmentNote: [order.shipmentNote, returnNote].filter(Boolean).join("\n"),
    },
  });

  revalidatePath("/workbench");
  revalidatePath("/procurement");
  revalidatePath(`/procurement/${order.id}`);
  return { success: true };
}

export async function submitCreateListing(
  entityType: EntityType,
  entityId: string,
  payload: CreateListingPayload
) {
  const platformIds = [...new Set(payload.platformIds.filter(Boolean))];
  if (platformIds.length === 0) throw new Error("请至少选择一个平台");

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
      results.push(
        await createListing({
          storeId: item.storeId,
          platformId,
          listingType: "ITEM_UNIT",
          itemUnitId: item.id,
        })
      );
    }
    revalidatePath("/workbench");
    revalidatePath(`/inventory/items/${item.id}`);
    revalidatePath(`/inventory/skus/${item.skuId}`);
    revalidatePath("/listing");
    return {
      ids: results.map((row) => row.id),
      skuId: sku?.id ?? item.skuId,
      skuCode: sku?.code,
      listingPageHref: "/listing",
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
      results.push(
        await createListing({
          storeId: lot.storeId,
          platformId,
          listingType: "SKU",
          skuId: lot.skuId,
        })
      );
    }
    revalidatePath("/workbench");
    revalidatePath("/inventory/skus");
    revalidatePath(`/inventory/skus/${lot.skuId}`);
    revalidatePath("/listing");
    return {
      ids: results.map((row) => row.id),
      skuId: sku?.id ?? lot.skuId,
      skuCode: sku?.code,
      listingPageHref: "/listing",
      skuPageHref: sku ? `/inventory/skus/${sku.id}` : undefined,
    };
  }

  throw new Error("当前对象不支持创建上架");
}

export async function submitShipOrder(entityId: string, payload: ShipOrderPayload) {
  await markOrderShipped(entityId, clean(payload.trackingNo));
  return { success: true };
}

export async function submitSettleOrder(entityId: string, payload: SettleOrderPayload) {
  await settleCustomerOrder(entityId, {
    platformFee: clean(payload.platformFee),
    shippingFee: clean(payload.shippingFee),
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
