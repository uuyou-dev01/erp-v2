"use server";

import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

type StringableDecimal = { toString(): string };

export type SerializedFulfillmentRequest = {
  id: string;
  storeId: string;
  supplyOfferId: string;
  resaleListingId: string | null;
  reservationId: string | null;
  customerOrderId: string | null;
  requestNo: string;
  quantity: string;
  status: string;
  recipientName: string;
  recipientPhone: string | null;
  shippingAddress: string;
  shippingCountry: string | null;
  carrier: string | null;
  trackingNo: string | null;
  shippingFee: string | null;
  shippingCurrency: string | null;
  requestedAt: Date;
  acceptedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  supplyOffer: {
    id: string;
    title: string;
    availableQty: StringableDecimal;
    reservedQty: StringableDecimal;
    ownerPartner: { id: string; name: string } | null;
  };
  resaleListing: {
    id: string;
    title: string;
    platform: { id: string; name: string; code: string };
  } | null;
};

type RawFulfillmentRequest = Omit<
  SerializedFulfillmentRequest,
  "quantity" | "shippingFee"
> & {
  quantity: StringableDecimal;
  shippingFee: StringableDecimal | null;
};

function parseDecimal(value: string | undefined, label: string, options: { required?: boolean; min?: Decimal.Value } = {}) {
  if (!value || value.trim() === "") {
    if (options.required) throw new Error(`${label}不能为空`);
    return null;
  }
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) throw new Error(`${label}必须是有效数字`);
  if (options.min !== undefined && decimal.lte(options.min)) throw new Error(`${label}必须大于 ${options.min}`);
  return decimal;
}

function revalidateFulfillmentSurfaces(id?: string, resaleListingId?: string, offerId?: string) {
  revalidatePath("/fulfillment/requests");
  revalidatePath("/workbench");
  if (id) revalidatePath(`/fulfillment/requests/${id}`);
  if (resaleListingId) revalidatePath(`/resale/${resaleListingId}`);
  if (offerId) revalidatePath(`/marketplace/${offerId}`);
}

const fulfillmentInclude = {
  supplyOffer: {
    include: {
      ownerPartner: true,
    },
  },
  resaleListing: {
    include: {
      platform: true,
    },
  },
} as const;

function serializeFulfillmentRequest(request: RawFulfillmentRequest): SerializedFulfillmentRequest {
  return {
    ...request,
    quantity: request.quantity.toString(),
    shippingFee: request.shippingFee?.toString() ?? null,
  };
}

function nextRequestNo() {
  return `FF-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function nextResaleOrderNo() {
  return `RS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function getFulfillmentRequests(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const requests = await prisma.fulfillmentRequest.findMany({
    where: { storeId: context.activeStoreId },
    include: fulfillmentInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return requests.map(serializeFulfillmentRequest);
}

export async function getFulfillmentRequestById(id: string, storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const request = await prisma.fulfillmentRequest.findFirst({
    where: { id, storeId: context.activeStoreId },
    include: fulfillmentInclude,
  });
  return request ? serializeFulfillmentRequest(request) : null;
}

export async function createFulfillmentRequestAction(data: {
  storeId?: string;
  resaleListingId: string;
  customerOrderId?: string;
  quantity: string;
  recipientName: string;
  recipientPhone?: string;
  shippingAddress: string;
  shippingCountry?: string;
  note?: string;
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const resaleListing = await prisma.resaleListing.findFirst({
      where: { id: data.resaleListingId, storeId: context.activeStoreId },
      include: { supplyOffer: true },
    });
    if (!resaleListing) throw new Error("代卖上架不存在或无权访问");
    if (resaleListing.status !== "ACTIVE") throw new Error("只有代卖中的记录可以创建履约请求");

    const quantity = parseDecimal(data.quantity, "履约数量", { required: true, min: 0 })!;
    const remainingOfferQty = resaleListing.supplyOffer.availableQty.minus(resaleListing.supplyOffer.reservedQty);
    if (quantity.gt(remainingOfferQty)) throw new Error("货盘可供数量不足，不能创建履约请求");
    const remainingListingQty = resaleListing.quantityPlanned.minus(resaleListing.quantitySold);
    if (quantity.gt(remainingListingQty)) throw new Error("代卖计划数量不足，不能创建履约请求");
    const recipientName = data.recipientName.trim();
    if (!recipientName) throw new Error("收件人不能为空");
    const shippingAddress = data.shippingAddress.trim();
    if (!shippingAddress) throw new Error("收件地址不能为空");

    const request = await prisma.$transaction(async (tx) => {
      const reservation = await tx.supplyReservation.create({
        data: {
          storeId: context.activeStoreId,
          supplyOfferId: resaleListing.supplyOfferId,
          resaleListingId: resaleListing.id,
          quantity,
          createdById: context.userId,
          note: data.note || null,
        },
      });

      await tx.supplyOffer.update({
        where: { id: resaleListing.supplyOfferId },
        data: { reservedQty: { increment: quantity } },
      });

      await tx.resaleListing.update({
        where: { id: resaleListing.id },
        data: { quantitySold: { increment: quantity }, updatedById: context.userId },
      });

      return tx.fulfillmentRequest.create({
        data: {
          storeId: context.activeStoreId,
          supplyOfferId: resaleListing.supplyOfferId,
          resaleListingId: resaleListing.id,
          customerOrderId: data.customerOrderId || null,
          reservationId: reservation.id,
          requestNo: nextRequestNo(),
          quantity,
          recipientName,
          recipientPhone: data.recipientPhone || null,
          shippingAddress,
          shippingCountry: data.shippingCountry || null,
          shippingCurrency: resaleListing.currency,
          note: data.note || null,
          createdById: context.userId,
          updatedById: context.userId,
        },
      });
    });

    revalidateFulfillmentSurfaces(request.id, resaleListing.id, resaleListing.supplyOfferId);
    return actionSuccess({ id: request.id });
  } catch (error) {
    return toActionFailure(error, "创建履约请求失败，请重试");
  }
}

export async function createResaleOrderFulfillmentAction(data: {
  storeId?: string;
  resaleListingId: string;
  quantity: string;
  externalOrderNo?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCountry?: string;
  orderDate?: Date;
  note?: string;
}) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const resaleListing = await prisma.resaleListing.findFirst({
      where: { id: data.resaleListingId, storeId: context.activeStoreId },
      include: {
        supplyOffer: true,
        platform: true,
      },
    });
    if (!resaleListing) throw new Error("代卖上架不存在或无权访问");
    if (resaleListing.status !== "ACTIVE") throw new Error("只有代卖中的记录可以登记售出");

    const quantity = parseDecimal(data.quantity, "售出数量", { required: true, min: 0 })!;
    const remainingOfferQty = resaleListing.supplyOffer.availableQty.minus(resaleListing.supplyOffer.reservedQty);
    if (quantity.gt(remainingOfferQty)) throw new Error("货盘可供数量不足，不能登记售出");
    const remainingListingQty = resaleListing.quantityPlanned.minus(resaleListing.quantitySold);
    if (quantity.gt(remainingListingQty)) throw new Error("代卖计划数量不足，不能登记售出");

    const customerName = data.customerName.trim();
    if (!customerName) throw new Error("客户姓名不能为空");
    const shippingAddress = data.shippingAddress.trim();
    if (!shippingAddress) throw new Error("收件地址不能为空");

    const orderDate = data.orderDate ?? new Date();
    const saleAmount = new Decimal(resaleListing.targetPrice.toString()).mul(quantity);
    const platformFee = resaleListing.platformFeeRate
      ? saleAmount.mul(new Decimal(resaleListing.platformFeeRate.toString()))
      : new Decimal(0);
    const netRevenue = saleAmount.minus(platformFee);
    const orderNumber = nextResaleOrderNo();

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.customerOrder.create({
        data: {
          storeId: context.activeStoreId,
          resaleListingId: resaleListing.id,
          platformId: resaleListing.platformId,
          orderNumber,
          externalOrderNo: data.externalOrderNo || null,
          customerName,
          customerEmail: data.customerEmail || null,
          customerPhone: data.customerPhone || null,
          shippingAddress,
          orderDate,
          currency: resaleListing.currency,
          subtotal: saleAmount,
          totalPaid: saleAmount,
          platformFee,
          shippingFee: "0",
          netRevenue,
          orderStatus: "CONFIRMED",
          confirmedAt: orderDate,
          countryFlow: data.shippingCountry || null,
        },
      });

      const reservation = await tx.supplyReservation.create({
        data: {
          storeId: context.activeStoreId,
          supplyOfferId: resaleListing.supplyOfferId,
          resaleListingId: resaleListing.id,
          quantity,
          createdById: context.userId,
          note: data.note || null,
        },
      });

      await tx.supplyOffer.update({
        where: { id: resaleListing.supplyOfferId },
        data: { reservedQty: { increment: quantity } },
      });

      await tx.resaleListing.update({
        where: { id: resaleListing.id },
        data: { quantitySold: { increment: quantity }, updatedById: context.userId },
      });

      const request = await tx.fulfillmentRequest.create({
        data: {
          storeId: context.activeStoreId,
          supplyOfferId: resaleListing.supplyOfferId,
          resaleListingId: resaleListing.id,
          customerOrderId: order.id,
          reservationId: reservation.id,
          requestNo: nextRequestNo(),
          quantity,
          recipientName: customerName,
          recipientPhone: data.customerPhone || null,
          shippingAddress,
          shippingCountry: data.shippingCountry || null,
          shippingCurrency: resaleListing.currency,
          note: data.note || null,
          createdById: context.userId,
          updatedById: context.userId,
        },
      });

      return { order, request };
    });

    revalidateFulfillmentSurfaces(result.request.id, resaleListing.id, resaleListing.supplyOfferId);
    revalidatePath("/sales");
    revalidatePath(`/sales/${result.order.id}`);
    return actionSuccess({ orderId: result.order.id, fulfillmentRequestId: result.request.id });
  } catch (error) {
    return toActionFailure(error, "登记代卖售出失败，请重试");
  }
}

export async function updateFulfillmentRequestStatusAction(
  id: string,
  nextStatus: "ACCEPTED" | "REJECTED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "EXCEPTION",
  data: {
    carrier?: string;
    trackingNo?: string;
    shippingFee?: string;
    shippingCurrency?: string;
    note?: string;
  } = {},
) {
  try {
    const existing = await prisma.fulfillmentRequest.findUnique({
      where: { id },
      include: {
        reservation: true,
        resaleListing: true,
      },
    });
    if (!existing) throw new Error("履约请求不存在");
    const context = await requireUserContext({ storeId: existing.storeId });
    if (existing.storeId !== context.activeStoreId) throw new Error("无权操作该履约请求");
    if (["DELIVERED", "CANCELLED", "REJECTED"].includes(existing.status)) {
      throw new Error("当前状态不能继续流转");
    }
    if (nextStatus === "SHIPPED" && !data.trackingNo?.trim()) {
      throw new Error("标记发货需要填写物流单号");
    }

    const shippingFee = parseDecimal(data.shippingFee, "运费", { min: 0 });
    const request = await prisma.$transaction(async (tx) => {
      if ((nextStatus === "REJECTED" || nextStatus === "CANCELLED") && existing.reservation?.status === "ACTIVE") {
        await tx.supplyReservation.update({
          where: { id: existing.reservation.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        await tx.supplyOffer.update({
          where: { id: existing.supplyOfferId },
          data: { reservedQty: { decrement: existing.quantity } },
        });
        if (existing.resaleListingId) {
          await tx.resaleListing.update({
            where: { id: existing.resaleListingId },
            data: { quantitySold: { decrement: existing.quantity } },
          });
        }
      }

      if (nextStatus === "SHIPPED" && existing.reservation?.status === "ACTIVE") {
        await tx.supplyReservation.update({
          where: { id: existing.reservation.id },
          data: { status: "CONSUMED", consumedAt: new Date() },
        });
        await tx.supplyOffer.update({
          where: { id: existing.supplyOfferId },
          data: {
            reservedQty: { decrement: existing.quantity },
            availableQty: { decrement: existing.quantity },
          },
        });
      }

      if (existing.customerOrderId && nextStatus === "SHIPPED") {
        await tx.customerOrder.update({
          where: { id: existing.customerOrderId },
          data: {
            orderStatus: "SHIPPED",
            shippedAt: new Date(),
            trackingNo: data.trackingNo || existing.trackingNo,
          },
        });
      }

      if (existing.customerOrderId && nextStatus === "DELIVERED") {
        await tx.customerOrder.update({
          where: { id: existing.customerOrderId },
          data: {
            orderStatus: "DELIVERED",
          },
        });
      }

      if (existing.customerOrderId && (nextStatus === "REJECTED" || nextStatus === "CANCELLED")) {
        await tx.customerOrder.update({
          where: { id: existing.customerOrderId },
          data: {
            orderStatus: "CANCELLED",
          },
        });
      }

      return tx.fulfillmentRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          acceptedAt: nextStatus === "ACCEPTED" ? new Date() : existing.acceptedAt,
          shippedAt: nextStatus === "SHIPPED" ? new Date() : existing.shippedAt,
          deliveredAt: nextStatus === "DELIVERED" ? new Date() : existing.deliveredAt,
          cancelledAt: nextStatus === "CANCELLED" ? new Date() : existing.cancelledAt,
          carrier: data.carrier || existing.carrier,
          trackingNo: data.trackingNo || existing.trackingNo,
          shippingFee: shippingFee ?? existing.shippingFee,
          shippingCurrency: data.shippingCurrency || existing.shippingCurrency,
          note: data.note || existing.note,
          updatedById: context.userId,
        },
      });
    });

    revalidateFulfillmentSurfaces(request.id, request.resaleListingId ?? undefined, request.supplyOfferId);
    return actionSuccess({ id: request.id, status: request.status });
  } catch (error) {
    return toActionFailure(error, "更新履约状态失败，请重试");
  }
}
