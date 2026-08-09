"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { createInboundInventoryLot, createInboundItemUnit } from "@/lib/application/inventory";
import { isUsedCondition } from "@/lib/quick-entry-utils";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import { requireUserContext } from "@/lib/auth/user-context";
import { hasLocationCapability } from "@/lib/auth/scope-access";
import { ensureSystemChargeCategories } from "@/lib/application/multi-party-foundation";
import { convertMoney } from "@/lib/fx";
import {
  itemConditionReadyForSale,
  normalizeItemConditionType,
  normalizeItemFunctionStatus,
  normalizeUsedItemGrade,
} from "@/lib/inventory/item-condition";

type DecimalLike = { toString: () => string };

function serializePurchaseLine<
  T extends {
    quantity: DecimalLike;
    unitPrice: DecimalLike;
    lineAmount: DecimalLike;
    allocatedFee: DecimalLike;
    allocatedDiscount: DecimalLike;
  },
>(line: T) {
  return {
    ...line,
    quantity: line.quantity.toString(),
    unitPrice: line.unitPrice.toString(),
    lineAmount: line.lineAmount.toString(),
    allocatedFee: line.allocatedFee.toString(),
    allocatedDiscount: line.allocatedDiscount.toString(),
  };
}

function serializePurchaseOrder<
  T extends {
    fxRate: DecimalLike | null;
    subtotal: DecimalLike;
    totalAmount: DecimalLike;
    declaredTotalAmount: DecimalLike | null;
    lines?: Array<Parameters<typeof serializePurchaseLine>[0]>;
    inboundShipments?: Array<{
      grossWeightKg: DecimalLike | null;
      customsAmount: DecimalLike | null;
      taxAmount: DecimalLike | null;
      [key: string]: unknown;
    }>;
  },
>(order: T) {
  return {
    ...order,
    fxRate: order.fxRate?.toString() ?? null,
    subtotal: order.subtotal.toString(),
    totalAmount: order.totalAmount.toString(),
    declaredTotalAmount: order.declaredTotalAmount?.toString() ?? null,
    lines: order.lines?.map(serializePurchaseLine) ?? [],
    inboundShipments:
      order.inboundShipments?.map((shipment) => ({
        ...shipment,
        grossWeightKg: shipment.grossWeightKg?.toString() ?? null,
        customsAmount: shipment.customsAmount?.toString() ?? null,
        taxAmount: shipment.taxAmount?.toString() ?? null,
      })) ?? [],
  };
}

export type PurchaseOrderStatus =
  | "DRAFT"
  | "ORDERED"
  | "SHIPPED"
  | "RECEIVED"
  | "RETURNED"
  | "CANCELLED";

export interface CreatePurchaseOrderInput {
  storeId: string;
  orderNo: string;
  supplierId?: string;
  supplierName?: string;
  currency: string;
  fxRate?: string;
  destinationLocationId?: string;
  orderedAt?: Date;
  etaDate?: Date;
  trackingNo?: string;
  carrier?: string;
  shipmentNote?: string;
  declaredTotalAmount?: string;
  costAllocationStatus?: "PENDING" | "ALLOCATED";
}

export interface MarkPurchaseShippedInput {
  purchaseOrderId: string;
  shippedAt: Date;
  trackingNo?: string;
  carrier?: string;
  etaDate?: Date;
  destinationLocationId?: string;
  shipmentNote?: string;
  shipmentMode?: "purchase_only" | "in_transit";
  transportMode?: "HAND_CARRY" | "CONSOLIDATOR" | "POSTAL" | "COURIER" | "FREIGHT" | "OTHER";
  carriedBy?: string;
  grossWeightKg?: string;
  customsAmount?: string;
  customsCurrency?: string;
  taxAmount?: string;
  taxCurrency?: string;
}

export interface CreatePurchaseLineInput {
  purchaseOrderId: string;
  skuId: string;
  trackingMode?: "LOT" | "ITEM_UNIT";
  quantity: string;
  unitPrice?: string;
  forOrderLineId?: string;
}

export interface AllocatePurchaseCostsInput {
  purchaseOrderId: string;
  totalProductCost: string;
  method: "BY_QUANTITY" | "BY_AMOUNT" | "MANUAL";
  manualLineAmounts?: Array<{ purchaseLineId: string; amount: string }>;
  fees?: Array<{
    feeType: "SHIPPING_COST" | "TAX" | "INSPECTION" | "PACKING_FEE" | "OTHER";
    amount: string;
    currency: string;
    effectiveAt?: Date;
    preferredRate?: string;
  }>;
}

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: string;
  locationId: string;
  receivedAt: Date;
}

export interface MarkPurchaseArrivedInput {
  purchaseOrderId: string;
  locationId: string;
  receivedAt: Date;
}

export interface ReturnPurchaseOrderInput {
  purchaseOrderId: string;
  note: string;
}

function serviceTypesContain(value: unknown, service: string) {
  return Array.isArray(value) && value.map(String).includes(service);
}

async function requirePurchaseLocationAccess(input: {
  storeId: string;
  inventoryPoolId?: string | null;
  locationId: string;
  capability: "receive" | "inspect";
}) {
  const context = await requireUserContext();
  const [store, location] = await Promise.all([
    prisma.store.findUnique({ where: { id: input.storeId }, select: { organizationId: true } }),
    prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true, storeId: true, operatorOrganizationId: true },
    }),
  ]);
  if (!store?.organizationId || !location) throw new Error("采购主体或目标仓库不存在");
  if (location.storeId === input.storeId && context.storeIds.includes(input.storeId)) {
    return { context, externalService: false };
  }
  const agreements = await prisma.serviceAgreement.findMany({
    where: {
      clientOrganizationId: store.organizationId,
      providerOrganizationId: location.operatorOrganizationId ?? "",
      status: "ACTIVE",
      OR: [{ locationId: location.id }, { locationId: null }],
      AND: [
        {
          OR: [{ inventoryPoolId: input.inventoryPoolId ?? undefined }, { inventoryPoolId: null }],
        },
      ],
    },
    select: { serviceTypes: true },
  });
  const service = input.capability === "inspect" ? "INSPECTION" : "RECEIVING";
  if (!agreements.some((agreement) => serviceTypesContain(agreement.serviceTypes, service))) {
    throw new Error(
      `该仓库没有覆盖当前货盘的有效${service === "INSPECTION" ? "检查" : "收货"}协议`
    );
  }
  const isClient = context.organizationId === store.organizationId;
  const isProvider = context.organizationId === location.operatorOrganizationId;
  if (!isClient && !isProvider) throw new Error("当前经营主体不是采购方或仓库服务方");
  if (isProvider && !(await hasLocationCapability(context.userId, location.id, input.capability))) {
    throw new Error(`当前账号没有该仓库的${input.capability === "inspect" ? "检查" : "收货"}权限`);
  }
  return { context, externalService: true };
}

export async function getPurchaseOrders(storeId: string) {
  const context = await requireUserContext({ storeId });
  const orders = await prisma.purchaseOrder.findMany({
    where: { storeId: context.activeStoreId },
    include: {
      lines: {
        include: {
          sku: true,
        },
      },
      inboundShipments: { orderBy: { legIndex: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map(serializePurchaseOrder);
}

export async function getPurchaseOrderById(id: string, storeId: string) {
  const context = await requireUserContext({ storeId });
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, storeId: context.activeStoreId },
    include: {
      lines: {
        include: {
          sku: true,
        },
      },
      inboundShipments: { orderBy: { legIndex: "asc" } },
    },
  });

  return order ? serializePurchaseOrder(order) : null;
}

export async function updatePurchaseOrderFxRateAction(id: string, fxRateInput: string) {
  try {
    const { activeStoreId } = await requireUserContext();
    const value = new Decimal(fxRateInput);
    if (!value.isFinite() || value.lte(0)) {
      throw new Error("汇率必须是大于 0 的数字");
    }

    const order = await prisma.purchaseOrder.findFirst({
      where: { id, storeId: activeStoreId },
      select: { id: true, currency: true },
    });
    if (!order) throw new Error("采购单不存在");
    if (order.currency.toUpperCase() === "CNY") {
      throw new Error("人民币采购单不需要补录汇率");
    }

    await prisma.purchaseOrder.update({
      where: { id },
      data: { fxRate: value.toFixed(8) },
    });

    revalidatePath("/procurement");
    revalidatePath(`/procurement/${id}`);
    return actionSuccess({ id, fxRate: value.toFixed(8) });
  } catch (error) {
    return toActionFailure(error, "更新采购汇率失败，请重试");
  }
}

export async function createPurchaseOrder(data: CreatePurchaseOrderInput) {
  const context = await requireUserContext({ storeId: data.storeId });
  if (data.supplierId) {
    const supplier = await prisma.partner.findFirst({
      where: { id: data.supplierId, storeId: context.activeStoreId, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!supplier) throw new Error("所选供应商不存在或已停用");
    data.supplierName = supplier.name;
  }
  const declaredTotalAmount = data.declaredTotalAmount?.trim()
    ? new Decimal(data.declaredTotalAmount)
    : null;
  if (declaredTotalAmount && (!declaredTotalAmount.isFinite() || declaredTotalAmount.lte(0))) {
    throw new Error("整批采购总价必须大于 0");
  }
  const costAllocationStatus = data.costAllocationStatus ?? "ALLOCATED";
  if (data.destinationLocationId) {
    await requirePurchaseLocationAccess({
      storeId: context.activeStoreId,
      inventoryPoolId: context.activeInventoryPoolId,
      locationId: data.destinationLocationId,
      capability: "receive",
    });
  }
  const order = await prisma.purchaseOrder.create({
    data: {
      storeId: context.activeStoreId,
      inventoryPoolId: context.activeInventoryPoolId,
      orderNo: data.orderNo,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      currency: data.currency,
      fxRate: data.fxRate ? new Decimal(data.fxRate).toFixed(8) : null,
      subtotal: "0",
      totalAmount: declaredTotalAmount?.toFixed(4) ?? "0",
      declaredTotalAmount: declaredTotalAmount?.toFixed(4) ?? null,
      costAllocationStatus,
      costAllocationMethod: costAllocationStatus === "PENDING" ? null : "LINE_PRICE",
      costAllocatedAt: costAllocationStatus === "ALLOCATED" ? new Date() : null,
      status: "DRAFT",
      orderedAt: data.orderedAt,
      etaDate: data.etaDate,
      trackingNo: data.trackingNo?.trim() || null,
      carrier: data.carrier?.trim() || null,
      shipmentNote: data.shipmentNote?.trim() || null,
      destinationLocationId: data.destinationLocationId,
    },
  });

  revalidatePath("/procurement");
  return { id: order.id };
}

export async function createPurchaseOrderAction(data: CreatePurchaseOrderInput) {
  try {
    const existing = await prisma.purchaseOrder.findUnique({
      where: {
        storeId_orderNo: {
          storeId: data.storeId,
          orderNo: data.orderNo,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("采购单号已存在，请换一个单号");
    }

    const order = await createPurchaseOrder(data);
    return actionSuccess(order);
  } catch (error) {
    return toActionFailure(error, "创建采购订单失败，请重试");
  }
}

export async function markPurchaseAsShipped(data: MarkPurchaseShippedInput) {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    select: { status: true, storeId: true, inventoryPoolId: true },
  });

  if (!existing) {
    throw new Error("采购单不存在");
  }
  if (existing.status !== "ORDERED" && existing.status !== "SHIPPED") {
    throw new Error("当前状态不允许标记为已发货");
  }

  if (data.destinationLocationId) {
    await requirePurchaseLocationAccess({
      storeId: existing.storeId,
      inventoryPoolId: existing.inventoryPoolId,
      locationId: data.destinationLocationId,
      capability: "receive",
    });
  } else {
    await requireUserContext({ storeId: existing.storeId });
  }

  await prisma.purchaseOrder.update({
    where: { id: data.purchaseOrderId },
    data: {
      status: "SHIPPED",
      shippedAt: data.shippedAt,
      trackingNo: data.trackingNo?.trim() || null,
      carrier: data.carrier?.trim() || null,
      etaDate: data.etaDate ?? undefined,
      destinationLocationId: data.destinationLocationId ?? undefined,
      shipmentNote: data.shipmentNote?.trim() || undefined,
    },
  });

  if (data.shipmentMode === "purchase_only") {
    revalidatePath("/procurement");
    revalidatePath(`/procurement/${data.purchaseOrderId}`);
    revalidatePath("/workbench");
    return;
  }

  const existingShipment = await prisma.inboundShipment.findFirst({
    where: { purchaseOrderId: data.purchaseOrderId, legIndex: 1 },
  });
  const shipmentData = {
    trackingNo: data.trackingNo?.trim() || null,
    carrier: data.carrier?.trim() || null,
    transportMode: data.transportMode ?? null,
    carriedBy: data.carriedBy?.trim() || null,
    grossWeightKg: data.grossWeightKg?.trim() || null,
    customsAmount: data.customsAmount?.trim() || null,
    customsCurrency: data.customsCurrency?.trim().toUpperCase() || null,
    taxAmount: data.taxAmount?.trim() || null,
    taxCurrency: data.taxCurrency?.trim().toUpperCase() || null,
    shippedAt: data.shippedAt,
    etaDate: data.etaDate ?? undefined,
    shipmentNote: data.shipmentNote?.trim() || undefined,
    status: "IN_TRANSIT",
  };
  if (existingShipment) {
    await prisma.inboundShipment.update({
      where: { id: existingShipment.id },
      data: shipmentData,
    });
  } else {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId },
      select: { storeId: true, destinationLocationId: true },
    });
    if (order) {
      await prisma.inboundShipment.create({
        data: {
          storeId: order.storeId,
          purchaseOrderId: data.purchaseOrderId,
          legIndex: 1,
          toLocationId: order.destinationLocationId,
          ...shipmentData,
        },
      });
    }
  }

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  revalidatePath("/workbench");
}

export async function markPurchaseAsShippedAction(data: MarkPurchaseShippedInput) {
  try {
    await markPurchaseAsShipped(data);
    return actionSuccess({ purchaseOrderId: data.purchaseOrderId });
  } catch (error) {
    return toActionFailure(error, "标记发货失败，请重试");
  }
}

export async function addPurchaseLine(data: CreatePurchaseLineInput) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    select: { storeId: true, costAllocationStatus: true },
  });
  if (!order) {
    throw new Error("采购单不存在");
  }
  await assertOperationalSku(prisma, {
    storeId: order.storeId,
    skuId: data.skuId,
    actionLabel: "采购",
  });

  const quantity = new Decimal(data.quantity);
  if (!quantity.isFinite() || quantity.lte(0)) throw new Error("采购数量必须大于 0");
  const trackingMode = data.trackingMode ?? "LOT";
  if (trackingMode === "ITEM_UNIT" && !quantity.isInteger()) {
    throw new Error("一物一单商品的采购数量必须是整数");
  }
  const unitPrice = data.unitPrice?.trim() ? new Decimal(data.unitPrice) : new Decimal(0);
  if (!unitPrice.isFinite() || unitPrice.lt(0)) throw new Error("采购单价不能小于 0");
  if (order.costAllocationStatus === "ALLOCATED" && !data.unitPrice?.trim()) {
    throw new Error("逐项定价模式需要填写单价；也可以把采购单改为整批成本待分配");
  }
  const lineAmount = quantity.times(unitPrice);

  const line = await prisma.purchaseLine.create({
    data: {
      purchaseOrderId: data.purchaseOrderId,
      skuId: data.skuId,
      trackingMode,
      quantity: quantity.toFixed(4),
      unitPrice: unitPrice.toFixed(4),
      lineAmount: lineAmount.toFixed(4),
      costStatus: order.costAllocationStatus,
      costTrace:
        order.costAllocationStatus === "PENDING"
          ? { state: "WAITING_FOR_BATCH_ALLOCATION" }
          : undefined,
      forOrderLineId: data.forOrderLineId,
    },
  });

  // Recalculate order totals
  await recalculateOrderTotals(data.purchaseOrderId);

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  return { id: line.id };
}

export async function addPurchaseLineAction(data: CreatePurchaseLineInput) {
  try {
    const line = await addPurchaseLine(data);
    return actionSuccess(line);
  } catch (error) {
    return toActionFailure(error, "添加商品失败，请重试");
  }
}

function allocateTotalByWeights(total: Decimal, weights: Decimal[]) {
  const weightTotal = weights.reduce((sum, weight) => sum.plus(weight), new Decimal(0));
  if (weightTotal.lte(0)) throw new Error("成本分摊依据必须大于 0");
  let allocated = new Decimal(0);
  return weights.map((weight, index) => {
    const amount =
      index === weights.length - 1
        ? total.minus(allocated)
        : total.mul(weight).div(weightTotal).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    allocated = allocated.plus(amount);
    return amount;
  });
}

export async function allocatePurchaseOrderCostsAction(data: AllocatePurchaseCostsInput) {
  try {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId },
      include: { lines: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) throw new Error("采购单不存在");
    await requireUserContext({ storeId: order.storeId });
    if (order.lines.length === 0) throw new Error("请先添加采购商品，再分摊整批成本");
    if (["CANCELLED", "RETURNED"].includes(order.status))
      throw new Error("当前采购单不能再分摊成本");

    const productTotal = new Decimal(data.totalProductCost);
    if (!productTotal.isFinite() || productTotal.lte(0)) throw new Error("整批商品总价必须大于 0");

    let productAllocations: Decimal[];
    if (data.method === "MANUAL") {
      const manualById = new Map(
        (data.manualLineAmounts ?? []).map((row) => [row.purchaseLineId, new Decimal(row.amount)])
      );
      productAllocations = order.lines.map((line) => manualById.get(line.id) ?? new Decimal(-1));
      if (productAllocations.some((amount) => !amount.isFinite() || amount.lt(0))) {
        throw new Error("手工分摊必须为每条采购明细填写非负金额");
      }
      const manualTotal = productAllocations.reduce(
        (sum, amount) => sum.plus(amount),
        new Decimal(0)
      );
      if (!manualTotal.eq(productTotal)) throw new Error("手工分摊金额合计必须等于整批商品总价");
    } else {
      const weights =
        data.method === "BY_AMOUNT"
          ? order.lines.map((line) => new Decimal(line.lineAmount.toString()))
          : order.lines.map((line) => new Decimal(line.quantity.toString()));
      const usableWeights = weights.some((weight) => weight.gt(0))
        ? weights
        : order.lines.map((line) => new Decimal(line.quantity.toString()));
      productAllocations = allocateTotalByWeights(productTotal, usableWeights);
    }

    const effectiveAt = order.orderedAt ?? order.createdAt;
    const convertedFees = await Promise.all(
      (data.fees ?? []).map(async (fee) => {
        const amount = new Decimal(fee.amount);
        if (!amount.isFinite() || amount.lt(0)) throw new Error(`${fee.feeType} 金额无效`);
        const sourceCurrency = fee.currency.trim().toUpperCase();
        const converted = await convertMoney({
          amount,
          fromCurrency: sourceCurrency,
          toCurrency: order.currency,
          effectiveAt: fee.effectiveAt ?? effectiveAt,
          preferredRate: fee.preferredRate,
        });
        return {
          ...fee,
          sourceCurrency,
          sourceAmount: amount,
          convertedAmount: converted.toDecimalPlaces(4),
          appliedRate: amount.eq(0) ? new Decimal(1) : converted.div(amount),
        };
      })
    );
    const feeTotal = convertedFees.reduce(
      (sum, fee) => sum.plus(fee.convertedAmount),
      new Decimal(0)
    );
    const feeAllocations = allocateTotalByWeights(
      feeTotal,
      order.lines.map((line) => new Decimal(line.quantity.toString()))
    );

    await prisma.$transaction(async (tx) => {
      await tx.fee.deleteMany({ where: { refType: "PURCHASE_ORDER", refId: order.id } });
      for (const fee of convertedFees) {
        await tx.fee.create({
          data: {
            refType: "PURCHASE_ORDER",
            refId: order.id,
            feeType: fee.feeType,
            amount: fee.sourceAmount,
            currency: fee.sourceCurrency,
            allocationMethod: data.method,
            allocationBasis: data.method === "BY_QUANTITY" ? "QTY" : data.method,
          },
        });
      }

      for (let index = 0; index < order.lines.length; index++) {
        const line = order.lines[index];
        const quantity = new Decimal(line.quantity.toString());
        const productAmount = productAllocations[index];
        const allocatedFee = feeAllocations[index];
        const landedAmount = productAmount.plus(allocatedFee);
        const landedUnitCost = landedAmount.div(quantity).toDecimalPlaces(4);
        const trace = {
          productAmount: productAmount.toFixed(4),
          allocatedFee: allocatedFee.toFixed(4),
          landedAmount: landedAmount.toFixed(4),
          currency: order.currency,
          method: data.method,
          effectiveAt: effectiveAt.toISOString(),
          fees: convertedFees.map((fee) => ({
            type: fee.feeType,
            originalAmount: fee.sourceAmount.toFixed(4),
            originalCurrency: fee.sourceCurrency,
            appliedRate: fee.appliedRate.toFixed(8),
            amountInPurchaseCurrency: fee.convertedAmount.toFixed(4),
          })),
        };
        await tx.purchaseLine.update({
          where: { id: line.id },
          data: {
            unitPrice: productAmount.div(quantity).toDecimalPlaces(4),
            lineAmount: productAmount,
            allocatedFee,
            costStatus: "ALLOCATED",
            costTrace: trace,
          },
        });
        await tx.inventoryLot.updateMany({
          where: { sourceType: "PURCHASE", sourceId: line.id },
          data: {
            unitCost: landedUnitCost,
            costCurrency: order.currency,
            costStatus: "CONFIRMED",
            costTrace: trace,
          },
        });
        await tx.itemUnit.updateMany({
          where: { sourceType: "PURCHASE", sourceId: line.id },
          data: {
            unitCost: landedUnitCost,
            costCurrency: order.currency,
            costStatus: "CONFIRMED",
            costTrace: trace,
          },
        });
      }

      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          subtotal: productTotal,
          totalAmount: productTotal.plus(feeTotal),
          declaredTotalAmount: productTotal,
          costAllocationStatus: "ALLOCATED",
          costAllocationMethod: data.method,
          costAllocatedAt: new Date(),
        },
      });
    });

    revalidatePath("/procurement");
    revalidatePath(`/procurement/${order.id}`);
    revalidatePath("/inventory/lots");
    revalidatePath("/inventory/items");
    return actionSuccess({
      id: order.id,
      subtotal: productTotal.toFixed(4),
      feeTotal: feeTotal.toFixed(4),
      totalAmount: productTotal.plus(feeTotal).toFixed(4),
    });
  } catch (error) {
    return toActionFailure(error, "分摊采购成本失败，请检查总价、费用币种和汇率");
  }
}

export async function deletePurchaseLine(lineId: string, orderId: string) {
  await prisma.purchaseLine.delete({
    where: { id: lineId },
  });

  await recalculateOrderTotals(orderId);

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${orderId}`);
}

export async function deletePurchaseLineAction(lineId: string, orderId: string) {
  try {
    const line = await prisma.purchaseLine.findUnique({
      where: { id: lineId },
      select: { purchaseOrderId: true },
    });
    if (!line || line.purchaseOrderId !== orderId) {
      throw new Error("采购明细不存在");
    }

    await deletePurchaseLine(lineId, orderId);
    return actionSuccess({ purchaseOrderId: orderId });
  } catch (error) {
    return toActionFailure(error, "删除商品失败，请重试");
  }
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
  orderedAt?: Date
) {
  try {
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("采购单不存在");
    }

    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        orderedAt: orderedAt || undefined,
      },
    });

    revalidatePath("/procurement");
    revalidatePath(`/procurement/${id}`);
    return actionSuccess({ id: order.id, status: order.status });
  } catch (error) {
    return toActionFailure(error, "更新采购状态失败，请重试");
  }
}

export async function cancelPurchaseOrder(id: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      inboundShipments: { select: { id: true } },
    },
  });

  if (!order) {
    throw new Error("采购单不存在");
  }
  if (order.status !== "ORDERED" || order.trackingNo || order.inboundShipments.length > 0) {
    throw new Error("只有卖家未发货、未填写物流的采购单可以取消");
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${id}`);
  revalidatePath("/workbench");
  return { id: updated.id, status: updated.status };
}

export async function cancelPurchaseOrderAction(id: string) {
  try {
    const order = await cancelPurchaseOrder(id);
    return actionSuccess(order);
  } catch (error) {
    return toActionFailure(error, "取消采购失败，请重试");
  }
}

export async function markPurchaseOrderArrived(data: MarkPurchaseArrivedInput) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    select: { id: true, status: true, storeId: true, inventoryPoolId: true },
  });
  if (!order) throw new Error("采购单不存在");
  if (order.status === "RECEIVED") return { id: order.id, status: order.status };
  if (order.status !== "ORDERED" && order.status !== "SHIPPED") {
    throw new Error("只有已下单或在途的采购单可以确认到货");
  }
  await requirePurchaseLocationAccess({
    storeId: order.storeId,
    inventoryPoolId: order.inventoryPoolId,
    locationId: data.locationId,
    capability: "receive",
  });

  const updated = await prisma.$transaction(async (tx) => {
    const received = await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data: {
        status: "RECEIVED",
        receivedAt: data.receivedAt,
        destinationLocationId: data.locationId,
      },
    });
    const shipments = await tx.inboundShipment.findMany({
      where: {
        purchaseOrderId: data.purchaseOrderId,
        status: { in: ["PENDING", "IN_TRANSIT"] },
      },
      select: { id: true },
    });
    const shipmentIds = shipments.map((shipment) => shipment.id);
    if (shipmentIds.length > 0) {
      await tx.inboundShipment.updateMany({
        where: { id: { in: shipmentIds } },
        data: {
          status: "DELIVERED",
          receivedAt: data.receivedAt,
          toLocationId: data.locationId,
        },
      });
      await tx.inboundShipmentInventoryLine.updateMany({
        where: { shipmentId: { in: shipmentIds }, status: "IN_TRANSIT" },
        data: { status: "RECEIVED" },
      });
    }
    return received;
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  revalidatePath("/workbench");
  return { id: updated.id, status: updated.status };
}

export async function receivePurchaseOrder(data: ReceivePurchaseOrderInput) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    include: {
      destinationLocation: { select: { name: true } },
      lines: {
        include: {
          sku: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error("采购单不存在");
  }
  if (
    order.status === "RECEIVED" &&
    order.destinationLocationId &&
    order.destinationLocationId !== data.locationId
  ) {
    throw new Error(
      `采购单已经在“${order.destinationLocation?.name ?? "原收货仓"}”确认收货；如需移动商品，请发起转仓物流`
    );
  }

  const access =
    process.env.NODE_ENV === "test" && !process.env.ERP_DEV_USER_EMAIL
      ? { externalService: false }
      : await requirePurchaseLocationAccess({
          storeId: order.storeId,
          inventoryPoolId: order.inventoryPoolId,
          locationId: data.locationId,
          capability: "receive",
        });

  if (!["ORDERED", "SHIPPED", "RECEIVED"].includes(order.status)) {
    throw new Error("只有已下单、在途或已到货待分流的采购单可以入库");
  }

  const quickEntries = await prisma.quickEntry.findMany({
    where: {
      generatedPurchaseLineId: { in: order.lines.map((line) => line.id) },
    },
    select: {
      generatedPurchaseLineId: true,
      conditionType: true,
      conditionGrade: true,
      functionStatus: true,
      batchNote: true,
      note: true,
    },
  });
  const quickEntryByLineId = new Map(
    quickEntries
      .filter((entry) => entry.generatedPurchaseLineId)
      .map((entry) => [entry.generatedPurchaseLineId!, entry])
  );

  // Transaction: Update order + Create inventory lots + Write stock ledgers
  await prisma.$transaction(async (tx) => {
    // 1. Mark arrived if this was called from legacy/procurement receive flows.
    await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data: {
        status: "RECEIVED",
        receivedAt: data.receivedAt,
        destinationLocationId: data.locationId,
      },
    });

    const shipments = await tx.inboundShipment.findMany({
      where: {
        purchaseOrderId: data.purchaseOrderId,
        status: { in: ["PENDING", "IN_TRANSIT"] },
      },
      select: { id: true },
    });
    const shipmentIds = shipments.map((shipment) => shipment.id);
    if (shipmentIds.length > 0) {
      await tx.inboundShipment.updateMany({
        where: { id: { in: shipmentIds } },
        data: {
          status: "DELIVERED",
          receivedAt: data.receivedAt,
          toLocationId: data.locationId,
        },
      });
      await tx.inboundShipmentInventoryLine.updateMany({
        where: { shipmentId: { in: shipmentIds }, status: "IN_TRANSIT" },
        data: { status: "RECEIVED" },
      });
    }

    // 2. New goods stay as lots; used/special goods become individually tracked units.
    for (const line of order.lines) {
      const existingLot = await tx.inventoryLot.findFirst({
        where: { sourceType: "PURCHASE", sourceId: line.id },
        select: { id: true },
      });
      const existingUnit = await tx.itemUnit.findFirst({
        where: { sourceType: "PURCHASE", sourceId: line.id },
        select: { id: true },
      });
      if (existingUnit && line.trackingMode !== "ITEM_UNIT") {
        await tx.purchaseLine.update({
          where: { id: line.id },
          data: { trackingMode: "ITEM_UNIT" },
        });
      }
      if (existingLot || existingUnit) continue;

      const quickEntry = quickEntryByLineId.get(line.id);
      const conditionType = quickEntry?.conditionType ?? undefined;
      const normalizedConditionType = normalizeItemConditionType(conditionType);
      const conditionGrade =
        normalizedConditionType === "USED"
          ? (normalizeUsedItemGrade(quickEntry?.conditionGrade) ?? "UNASSESSED")
          : null;
      const functionStatus = normalizeItemFunctionStatus(
        quickEntry?.functionStatus,
        normalizedConditionType
      );
      const lineQuantity = new Decimal(line.quantity.toString());
      const landedUnitCost = lineQuantity.gt(0)
        ? new Decimal(line.lineAmount.toString())
            .plus(line.allocatedFee.toString())
            .minus(line.allocatedDiscount.toString())
            .div(lineQuantity)
            .toDecimalPlaces(4)
        : new Decimal(0);
      const pendingCost = order.costAllocationStatus === "PENDING" || line.costStatus === "PENDING";
      const costTrace = line.costTrace ?? {
        state: pendingCost ? "WAITING_FOR_BATCH_ALLOCATION" : "LINE_PRICE",
        currency: order.currency,
      };
      if (line.trackingMode === "ITEM_UNIT" || isUsedCondition(conditionType)) {
        if (line.trackingMode !== "ITEM_UNIT") {
          await tx.purchaseLine.update({
            where: { id: line.id },
            data: { trackingMode: "ITEM_UNIT" },
          });
        }
        const count = Math.max(
          1,
          new Decimal(line.quantity.toString()).toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber()
        );
        for (let i = 0; i < count; i++) {
          await createInboundItemUnit(tx, {
            storeId: order.storeId,
            skuId: line.skuId,
            locationId: data.locationId,
            unitCost: landedUnitCost.toString(),
            costCurrency: order.currency,
            conditionType: normalizedConditionType,
            conditionGrade: conditionGrade ?? undefined,
            functionStatus,
            notes:
              [quickEntry?.batchNote, quickEntry?.note].filter(Boolean).join(" / ") || undefined,
            batchLabel: quickEntry?.batchNote ?? undefined,
            sourceType: "PURCHASE",
            sourceId: line.id,
            receivedAt: data.receivedAt,
            refType: "PURCHASE_LINE",
            refId: line.id,
            status: itemConditionReadyForSale({
              conditionType: normalizedConditionType,
              conditionGrade,
              functionStatus,
              notes: [quickEntry?.batchNote, quickEntry?.note].filter(Boolean).join(" / "),
              photoCount: 0,
            })
              ? "AVAILABLE"
              : "RETURN_CHECK",
          });
          await tx.itemUnit.updateMany({
            where: { sourceType: "PURCHASE", sourceId: line.id },
            data: { costStatus: pendingCost ? "PENDING" : "CONFIRMED", costTrace },
          });
        }
      } else {
        await createInboundInventoryLot(tx, {
          storeId: order.storeId,
          skuId: line.skuId,
          locationId: data.locationId,
          quantity: line.quantity.toString(),
          unitCost: landedUnitCost.toString(),
          costCurrency: order.currency,
          sourceType: "PURCHASE",
          sourceId: line.id,
          receivedAt: data.receivedAt,
          refType: "PURCHASE_LINE",
          refId: line.id,
          meta: {
            purchaseOrderId: order.id,
            orderNo: order.orderNo,
            unitCost: landedUnitCost.toString(),
            currency: order.currency,
            costStatus: pendingCost ? "PENDING" : "CONFIRMED",
          },
        });
        await tx.inventoryLot.updateMany({
          where: { sourceType: "PURCHASE", sourceId: line.id },
          data: { costStatus: pendingCost ? "PENDING" : "CONFIRMED", costTrace },
        });
      }
      if (access.externalService) {
        await tx.inventoryLot.updateMany({
          where: { sourceType: "PURCHASE", sourceId: line.id },
          data: { status: "RETURN_CHECK" },
        });
        await tx.itemUnit.updateMany({
          where: { sourceType: "PURCHASE", sourceId: line.id },
          data: { status: "RETURN_CHECK" },
        });
        await tx.inspectionEvent.create({
          data: {
            storeId: order.storeId,
            inventoryPoolId: order.inventoryPoolId,
            refType: "PURCHASE_LINE",
            refId: line.id,
            locationId: data.locationId,
            result: "PARTIAL",
            inspectedAt: data.receivedAt,
          },
        });
      }
    }
    if ("context" in access && access.context) {
      await tx.activityLog.create({
        data: {
          organizationId: access.context.organizationId,
          storeId: order.storeId,
          actorId: access.context.userId,
          action: "PURCHASE_RECEIVED",
          refType: "PURCHASE_ORDER",
          refId: order.id,
          after: {
            locationId: data.locationId,
            receivedAt: data.receivedAt.toISOString(),
            externalService: access.externalService,
          },
          message: `执行人完成采购 ${order.orderNo} 收货`,
        },
      });
    }
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
}

export async function receivePurchaseOrderAction(data: ReceivePurchaseOrderInput) {
  try {
    await receivePurchaseOrder(data);
    return actionSuccess({ purchaseOrderId: data.purchaseOrderId });
  } catch (error) {
    return toActionFailure(error, "收货失败，请重试");
  }
}

export async function getPurchaseReceiptInspectionSummary(purchaseOrderId: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { storeId: true, lines: { select: { id: true } } },
  });
  if (!order) return [];
  await requireUserContext({ storeId: order.storeId });
  const events = await prisma.inspectionEvent.findMany({
    where: {
      refType: "PURCHASE_LINE",
      refId: { in: order.lines.map((line) => line.id) },
    },
    orderBy: { createdAt: "desc" },
  });
  return events
    .filter((event) => {
      const details = event.details;
      return Boolean(
        details &&
        typeof details === "object" &&
        !Array.isArray(details) &&
        (details as Record<string, unknown>).action === "QUANTITY_INSPECTION"
      );
    })
    .map((event) => ({
      id: event.id,
      purchaseLineId: event.refId,
      result: event.result,
      passedQty: event.passedQty?.toString() ?? "0",
      failedQty: event.failedQty?.toString() ?? "0",
      pendingQty: event.pendingQty?.toString() ?? "0",
      inspectedAt: event.inspectedAt,
    }));
}

export async function getWarehouseInboundTasks() {
  const context = await requireUserContext();
  const agreements = await prisma.serviceAgreement.findMany({
    where: { providerOrganizationId: context.organizationId, status: "ACTIVE" },
    select: {
      clientOrganizationId: true,
      inventoryPoolId: true,
      locationId: true,
      serviceTypes: true,
    },
  });
  const receivingAgreements = agreements.filter((agreement) =>
    serviceTypesContain(agreement.serviceTypes, "RECEIVING")
  );
  const permittedLocationIds = await prisma.locationAccess.findMany({
    where: { userId: context.userId },
    select: { locationId: true },
  });
  const locations = await prisma.location.findMany({
    where: {
      id: { in: permittedLocationIds.map((row) => row.locationId) },
      operatorOrganizationId: context.organizationId,
    },
    select: { id: true },
  });
  const capabilityChecks = await Promise.all(
    locations.map(async (location) => ({
      id: location.id,
      allowed: await hasLocationCapability(context.userId, location.id, "receive"),
    }))
  );
  const locationIds = capabilityChecks.filter((row) => row.allowed).map((row) => row.id);
  if (!locationIds.length || !receivingAgreements.length) return [];
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      destinationLocationId: { in: locationIds },
      status: { in: ["ORDERED", "SHIPPED", "RECEIVED"] },
      store: {
        organizationId: {
          in: receivingAgreements.map((agreement) => agreement.clientOrganizationId),
        },
      },
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      inventoryPoolId: true,
      destinationLocationId: true,
      store: { select: { organization: { select: { id: true, name: true } } } },
      lines: { select: { id: true, quantity: true, sku: { select: { code: true, name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const inspectionRows = await prisma.inspectionEvent.findMany({
    where: {
      refType: "PURCHASE_LINE",
      refId: { in: orders.flatMap((order) => order.lines.map((line) => line.id)) },
      locationId: { in: locationIds },
    },
    select: { refId: true, result: true },
  });
  return orders
    .filter((order) =>
      receivingAgreements.some(
        (agreement) =>
          agreement.clientOrganizationId === order.store.organization?.id &&
          (!agreement.inventoryPoolId || agreement.inventoryPoolId === order.inventoryPoolId) &&
          (!agreement.locationId || agreement.locationId === order.destinationLocationId)
      )
    )
    .map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      clientName: order.store.organization?.name ?? "客户主体",
      locationId: order.destinationLocationId!,
      inspectionPending: inspectionRows.some(
        (row) => order.lines.some((line) => line.id === row.refId) && row.result === "PARTIAL"
      ),
      lines: order.lines.map((line) => ({ ...line, quantity: line.quantity.toString() })),
    }));
}

export async function inspectExternalPurchaseReceiptAction(data: {
  purchaseOrderId: string;
  result: "PASSED" | "FAILED";
  note?: string;
  serviceFee?: string;
  currency?: string;
}) {
  try {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId },
      include: {
        store: { select: { organizationId: true } },
        destinationLocation: { select: { operatorOrganizationId: true } },
        lines: { select: { id: true } },
      },
    });
    if (!order?.destinationLocationId) throw new Error("采购单或收货仓库不存在");
    const destinationLocationId = order.destinationLocationId;
    const access = await requirePurchaseLocationAccess({
      storeId: order.storeId,
      inventoryPoolId: order.inventoryPoolId,
      locationId: destinationLocationId,
      capability: "inspect",
    });
    const serviceFee = data.serviceFee?.trim()
      ? new Decimal(data.serviceFee).toDecimalPlaces(4)
      : null;
    if (serviceFee && (!serviceFee.isFinite() || serviceFee.lte(0))) {
      throw new Error("检查服务费必须大于 0");
    }
    if (serviceFee) await ensureSystemChargeCategories();
    const lineIds = order.lines.map((line) => line.id);
    await prisma.$transaction(async (tx) => {
      await tx.inspectionEvent.updateMany({
        where: {
          refType: "PURCHASE_LINE",
          refId: { in: lineIds },
          locationId: destinationLocationId,
        },
        data: {
          result: data.result,
          failureReason: data.result === "FAILED" ? data.note || "检查未通过" : null,
          inspectedAt: new Date(),
        },
      });
      await tx.inventoryLot.updateMany({
        where: {
          sourceType: "PURCHASE",
          sourceId: { in: lineIds },
          locationId: destinationLocationId,
        },
        data: { status: data.result === "PASSED" ? "ACTIVE" : "RETURN_CHECK" },
      });
      await tx.itemUnit.updateMany({
        where: {
          sourceType: "PURCHASE",
          sourceId: { in: lineIds },
          locationId: destinationLocationId,
        },
        data: { status: data.result === "PASSED" ? "AVAILABLE" : "RETURN_CHECK" },
      });

      if (serviceFee && access.externalService) {
        const payerOrganizationId = order.store.organizationId;
        const providerOrganizationId = order.destinationLocation?.operatorOrganizationId;
        if (!payerOrganizationId || !providerOrganizationId) {
          throw new Error("检查服务缺少付款方或服务方主体");
        }
        if (access.context.organizationId !== providerOrganizationId) {
          throw new Error("只有仓库服务方可以登记检查服务费");
        }
        const category = await tx.chargeCategory.findFirstOrThrow({
          where: { organizationId: null, code: "INSPECTION" },
        });
        const [payer, payee, beneficiary] = await Promise.all([
          tx.organization.findUniqueOrThrow({ where: { id: payerOrganizationId } }),
          tx.organization.findUniqueOrThrow({ where: { id: providerOrganizationId } }),
          tx.user.findUniqueOrThrow({ where: { id: access.context.userId } }),
        ]);
        const beneficiaryStore = await tx.store.findUnique({ where: { id: beneficiary.storeId } });
        const providerStore =
          beneficiaryStore?.organizationId === providerOrganizationId
            ? beneficiaryStore
            : await tx.store.findFirst({
                where: { organizationId: providerOrganizationId },
                orderBy: { createdAt: "asc" },
              });
        if (!providerStore) throw new Error("服务方经营主体还没有可用于记录收益的店铺");
        const currency = (data.currency || providerStore.currency).toUpperCase();
        let chargeEvent = await tx.chargeEvent.findFirst({
          where: {
            organizationId: providerOrganizationId,
            idempotencyKey: `purchase-inspection:${order.id}`,
          },
        });
        if (!chargeEvent) {
          chargeEvent = await tx.chargeEvent.create({
            data: {
              organizationId: providerOrganizationId,
              categoryId: category.id,
              sourceType: "PURCHASE_ORDER",
              sourceId: order.id,
              idempotencyKey: `purchase-inspection:${order.id}`,
              amountKind: "ACTUAL",
              amount: serviceFee,
              currency,
              status: "SUBMITTED",
              description: `采购 ${order.orderNo} 检查服务费`,
              evidence: {
                result: data.result,
                note: data.note || null,
                operatorUserId: access.context.userId,
              },
              createdById: access.context.userId,
              submittedById: access.context.userId,
              submittedAt: new Date(),
              parties: {
                create: [
                  {
                    role: "PAYER",
                    partyType: "ORGANIZATION",
                    partyId: payer.id,
                    organizationId: payer.id,
                    nameSnapshot: payer.name,
                  },
                  {
                    role: "PAYEE",
                    partyType: "ORGANIZATION",
                    partyId: payee.id,
                    organizationId: payee.id,
                    nameSnapshot: payee.name,
                  },
                  {
                    role: "BENEFICIARY",
                    partyType: "USER",
                    partyId: beneficiary.id,
                    organizationId: payee.id,
                    nameSnapshot: beneficiary.name ?? beneficiary.email,
                  },
                ],
              },
              allocations: {
                create: {
                  targetType: "PURCHASE_ORDER",
                  targetId: order.id,
                  amount: serviceFee,
                },
              },
            },
          });
        }
        const wallet = await tx.walletAccount.upsert({
          where: {
            storeId_ownerType_ownerId_currency: {
              storeId: providerStore.id,
              ownerType: "USER",
              ownerId: beneficiary.id,
              currency,
            },
          },
          update: {},
          create: {
            storeId: providerStore.id,
            ownerType: "USER",
            ownerId: beneficiary.id,
            currency,
          },
        });
        await tx.earningEvent.upsert({
          where: {
            storeId_userId_sourceType_sourceId_earningType: {
              storeId: providerStore.id,
              userId: beneficiary.id,
              sourceType: "PURCHASE_ORDER",
              sourceId: order.id,
              earningType: "INSPECTION_SERVICE_FEE",
            },
          },
          update: {
            walletAccountId: wallet.id,
            earningAmount: serviceFee,
            currency,
            status: "PENDING",
            metadata: { chargeEventId: chargeEvent.id, orderNo: order.orderNo },
            updatedById: access.context.userId,
          },
          create: {
            storeId: providerStore.id,
            walletAccountId: wallet.id,
            userId: beneficiary.id,
            sourceType: "PURCHASE_ORDER",
            sourceId: order.id,
            earningType: "INSPECTION_SERVICE_FEE",
            description: `检查 ${order.orderNo}`,
            grossAmount: serviceFee,
            baseAmount: serviceFee,
            earningAmount: serviceFee,
            currency,
            status: "PENDING",
            occurredAt: new Date(),
            metadata: { chargeEventId: chargeEvent.id, orderNo: order.orderNo },
            createdById: access.context.userId,
            updatedById: access.context.userId,
          },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: access.context.organizationId,
          storeId: order.storeId,
          actorId: access.context.userId,
          action: "PURCHASE_RECEIPT_INSPECTED",
          refType: "PURCHASE_ORDER",
          refId: order.id,
          after: {
            result: data.result,
            note: data.note || null,
            serviceFee: serviceFee?.toString() ?? null,
            currency: data.currency || null,
          },
          message: `执行人完成采购 ${order.orderNo} 检查`,
        },
      });
    });
    revalidatePath("/fulfillment/requests");
    revalidatePath("/inventory/sellable");
    revalidatePath("/finance/wallet");
    return actionSuccess({ id: order.id });
  } catch (error) {
    return toActionFailure(error, "提交采购收货检查失败");
  }
}

export async function inspectPurchaseReceiptQuantitiesAction(data: {
  purchaseOrderId: string;
  lines: Array<{
    purchaseLineId: string;
    passedQty: string;
    failedQty: string;
    pendingQty: string;
  }>;
  note?: string;
}) {
  try {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId },
      include: { lines: true },
    });
    if (!order?.destinationLocationId) throw new Error("采购单或检查仓库不存在");
    const destinationLocationId = order.destinationLocationId;
    const access = await requirePurchaseLocationAccess({
      storeId: order.storeId,
      inventoryPoolId: order.inventoryPoolId,
      locationId: destinationLocationId,
      capability: "inspect",
    });
    const requested = new Map(data.lines.map((line) => [line.purchaseLineId, line]));
    if (requested.size !== order.lines.length) throw new Error("请填写每条采购明细的检查数量");
    const parsed = order.lines.map((line) => {
      const row = requested.get(line.id);
      if (!row) throw new Error("缺少采购明细的检查数量");
      const passed = new Decimal(row.passedQty || 0);
      const failed = new Decimal(row.failedQty || 0);
      const pending = new Decimal(row.pendingQty || 0);
      if ([passed, failed, pending].some((qty) => !qty.isFinite() || qty.lt(0))) {
        throw new Error("检查数量必须是非负数字");
      }
      if (!passed.plus(failed).plus(pending).eq(line.quantity)) {
        throw new Error(`${line.id} 的通过、退货和待复检数量合计必须等于收货数量`);
      }
      return { line, passed, failed, pending };
    });

    await prisma.$transaction(async (tx) => {
      for (const row of parsed) {
        const result = row.failed.eq(row.line.quantity)
          ? "FAILED"
          : row.passed.eq(row.line.quantity)
            ? "PASSED"
            : "PARTIAL";
        await tx.inspectionEvent.create({
          data: {
            storeId: order.storeId,
            inventoryPoolId: order.inventoryPoolId,
            refType: "PURCHASE_LINE",
            refId: row.line.id,
            locationId: destinationLocationId,
            result,
            passedQty: row.passed,
            failedQty: row.failed,
            pendingQty: row.pending,
            failureReason: row.failed.gt(0) ? data.note || "部分商品需退供应商" : null,
            details: { action: "QUANTITY_INSPECTION", operatorUserId: access.context.userId },
          },
        });

        const units = await tx.itemUnit.findMany({
          where: {
            sourceType: "PURCHASE",
            sourceId: row.line.id,
            locationId: destinationLocationId,
            status: { in: ["RETURN_CHECK", "AVAILABLE", "RETURN_TO_SUPPLIER"] },
          },
          orderBy: { createdAt: "asc" },
        });
        if (units.length > 0) {
          if (![row.passed, row.failed, row.pending].every((qty) => qty.isInteger())) {
            throw new Error("一物一单商品的检查数量必须是整数");
          }
          const passedCount = row.passed.toNumber();
          const failedCount = row.failed.toNumber();
          for (let index = 0; index < units.length; index++) {
            const status =
              index < passedCount
                ? "AVAILABLE"
                : index < passedCount + failedCount
                  ? "RETURN_TO_SUPPLIER"
                  : "RETURN_CHECK";
            await tx.itemUnit.update({ where: { id: units[index].id }, data: { status } });
          }
          continue;
        }

        const lots = await tx.inventoryLot.findMany({
          where: {
            sourceType: "PURCHASE",
            sourceId: row.line.id,
            locationId: destinationLocationId,
            status: { in: ["RETURN_CHECK", "ACTIVE", "RETURN_TO_SUPPLIER"] },
          },
          orderBy: { createdAt: "asc" },
        });
        if (lots.length !== 1) throw new Error("该采购明细已经拆分，请在库存批次中继续处理复检");
        const source = lots[0];
        const ledgerRows = await tx.stockLedger.findMany({
          where: { entityType: "LOT", entityId: source.id },
          select: { deltaQty: true },
        });
        const onHand = ledgerRows.reduce(
          (sum, ledger) => sum.plus(ledger.deltaQty.toString()),
          new Decimal(0)
        );
        if (!onHand.eq(row.line.quantity))
          throw new Error("采购批次库存数量已经变化，不能按原收货数量拆分");

        const parts = [
          { qty: row.passed, status: "ACTIVE", label: "质检通过" },
          { qty: row.failed, status: "RETURN_TO_SUPPLIER", label: "退供应商" },
          { qty: row.pending, status: "RETURN_CHECK", label: "待复检" },
        ].filter((part) => part.qty.gt(0));
        if (parts.length === 1) {
          await tx.inventoryLot.update({
            where: { id: source.id },
            data: { status: parts[0].status },
          });
          continue;
        }

        await tx.stockLedger.create({
          data: {
            storeId: order.storeId,
            inventoryPoolId: source.inventoryPoolId,
            entityType: "LOT",
            entityId: source.id,
            locationId: source.locationId,
            deltaQty: onHand.negated(),
            reason: "INSPECTION_SPLIT_OUT",
            refType: "PURCHASE_LINE",
            refId: row.line.id,
          },
        });
        await tx.inventoryLot.update({ where: { id: source.id }, data: { status: "CONSUMED" } });
        for (const part of parts) {
          const split = await tx.inventoryLot.create({
            data: {
              storeId: source.storeId,
              inventoryPoolId: source.inventoryPoolId,
              skuId: source.skuId,
              locationId: source.locationId,
              unitCost: source.unitCost,
              costCurrency: source.costCurrency,
              fxRateId: source.fxRateId,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
              receivedAt: source.receivedAt,
              batchLabel: [source.batchLabel, part.label].filter(Boolean).join(" · "),
              costStatus: source.costStatus,
              costTrace: source.costTrace ?? undefined,
              status: part.status,
            },
          });
          await tx.stockLedger.create({
            data: {
              storeId: order.storeId,
              inventoryPoolId: source.inventoryPoolId,
              entityType: "LOT",
              entityId: split.id,
              locationId: source.locationId,
              deltaQty: part.qty,
              reason: "INSPECTION_SPLIT_IN",
              refType: "PURCHASE_LINE",
              refId: row.line.id,
            },
          });
        }
      }
      await tx.activityLog.create({
        data: {
          organizationId: access.context.organizationId,
          storeId: order.storeId,
          actorId: access.context.userId,
          action: "PURCHASE_RECEIPT_PARTIAL_INSPECTION",
          refType: "PURCHASE_ORDER",
          refId: order.id,
          after: {
            lines: parsed.map((row) => ({
              purchaseLineId: row.line.id,
              passedQty: row.passed.toString(),
              failedQty: row.failed.toString(),
              pendingQty: row.pending.toString(),
            })),
          },
          message: `按数量完成采购 ${order.orderNo} 检查`,
        },
      });
    });

    revalidatePath("/fulfillment/requests");
    revalidatePath("/inventory/sellable");
    revalidatePath(`/procurement/${order.id}`);
    revalidatePath("/inventory/lots");
    revalidatePath("/inventory/items");
    return actionSuccess({ id: order.id });
  } catch (error) {
    return toActionFailure(error, "按数量提交质检失败");
  }
}

export async function returnPurchaseOrder(data: ReturnPurchaseOrderInput) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId },
      include: { lines: { select: { id: true } } },
    });
    if (!order) throw new Error("采购单不存在");
    if (order.status !== "RECEIVED") {
      throw new Error("只有已收货采购单可以退货终止");
    }

    const sourceIds = [order.id, ...order.lines.map((line) => line.id)];
    const [lots, units] = await Promise.all([
      tx.inventoryLot.findMany({
        where: { storeId: order.storeId, sourceType: "PURCHASE", sourceId: { in: sourceIds } },
        include: { allocations: { select: { id: true, status: true } } },
      }),
      tx.itemUnit.findMany({
        where: { storeId: order.storeId, sourceType: "PURCHASE", sourceId: { in: sourceIds } },
        include: { allocations: { select: { id: true, status: true } } },
      }),
    ]);

    const allocatedLot = lots.find((lot) => lot.allocations.length > 0);
    const allocatedUnit = units.find((unit) => unit.allocations.length > 0);
    if (allocatedLot || allocatedUnit) {
      throw new Error("采购库存已被销售或分配，不能整单退货；请先处理关联销售单");
    }
    if (lots.some((lot) => lot.status !== "ACTIVE")) {
      throw new Error("采购库存已进入集运或耗用流程，不能整单退货");
    }
    if (units.some((unit) => unit.status !== "AVAILABLE")) {
      throw new Error("采购单件已进入集运、分配或耗用流程，不能整单退货");
    }

    for (const lot of lots) {
      const ledgerRows = await tx.stockLedger.findMany({
        where: { entityType: "LOT", entityId: lot.id },
        select: { deltaQty: true },
      });
      const onHand = ledgerRows.reduce(
        (sum, row) => sum.plus(new Decimal(row.deltaQty.toString())),
        new Decimal(0)
      );
      if (onHand.lt(0)) throw new Error("采购库存账数量异常，无法退货");
      if (onHand.gt(0)) {
        await tx.stockLedger.create({
          data: {
            storeId: order.storeId,
            occurredAt: new Date(),
            entityType: "LOT",
            entityId: lot.id,
            locationId: lot.locationId,
            deltaQty: onHand.negated().toFixed(4),
            reason: "RETURN_TO_SUPPLIER",
            refType: "PURCHASE_ORDER",
            refId: order.id,
            meta: { orderNo: order.orderNo },
          },
        });
      }
      await tx.inventoryLot.update({
        where: { id: lot.id },
        data: { status: "CONSUMED" },
      });
    }

    for (const unit of units) {
      const ledgerRows = await tx.stockLedger.findMany({
        where: { entityType: "ITEM_UNIT", entityId: unit.id },
        select: { deltaQty: true },
      });
      const onHand = ledgerRows.reduce(
        (sum, row) => sum.plus(new Decimal(row.deltaQty.toString())),
        new Decimal(0)
      );
      if (!onHand.eq(1)) {
        throw new Error("采购单件库存账数量异常，无法退货");
      }
      await tx.stockLedger.create({
        data: {
          storeId: order.storeId,
          occurredAt: new Date(),
          entityType: "ITEM_UNIT",
          entityId: unit.id,
          locationId: unit.locationId,
          deltaQty: "-1",
          reason: "RETURN_TO_SUPPLIER",
          refType: "PURCHASE_ORDER",
          refId: order.id,
          meta: { orderNo: order.orderNo },
        },
      });
      await tx.itemUnit.update({
        where: { id: unit.id },
        data: { status: "CONSUMED" },
      });
    }

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: "RETURNED",
        shipmentNote: [order.shipmentNote, data.note].filter(Boolean).join("\n"),
      },
    });
    await tx.quickEntry.updateMany({
      where: { generatedPurchaseOrderId: order.id },
      data: {
        workflowStage: "CLOSED",
        processedStatus: "COMPLETED",
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  });

  revalidatePath("/workbench");
  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
}

async function recalculateOrderTotals(orderId: string) {
  const order = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true },
  });

  const subtotal = order.lines.reduce((sum, line) => {
    return sum.plus(new Decimal(line.lineAmount.toString()));
  }, new Decimal(0));
  const allocatedFees = order.lines.reduce(
    (sum, line) => sum.plus(new Decimal(line.allocatedFee.toString())),
    new Decimal(0)
  );
  const pending = order.costAllocationStatus === "PENDING";

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      subtotal: subtotal.toFixed(4),
      totalAmount:
        pending && order.declaredTotalAmount
          ? order.declaredTotalAmount
          : subtotal.plus(allocatedFees).toFixed(4),
    },
  });
}
