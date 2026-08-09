"use server";

import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { ensureSystemChargeCategories } from "@/lib/application/multi-party-foundation";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { hasLocationCapability } from "@/lib/auth/scope-access";

const CASE_TYPES = new Set(["RETURN", "REFUND_ONLY", "EXCHANGE", "RESHIP", "REFUSED", "CANCEL_AFTER_SHIP"]);
const RESOLUTIONS = new Set(["RESTOCK", "QUARANTINE", "DOWNGRADE", "SCRAP", "RETURN_TO_SUPPLIER", "REPLACE"]);

function parsePositive(value: string, label: string) {
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.lte(0)) throw new Error(`${label}必须大于 0`);
  return decimal.toDecimalPlaces(4);
}

function nextCaseNo() {
  return `AS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function revalidateAfterSales(orderId?: string) {
  revalidatePath("/sales/after-sales");
  revalidatePath("/workbench");
  revalidatePath("/inventory/sellable");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  if (orderId) revalidatePath(`/sales/${orderId}`);
}

async function findVisibleCase(id: string, userId: string, organizationId: string) {
  return prisma.afterSalesCase.findFirst({
    where: {
      id,
      OR: [
        { organizationId },
        {
          targetLocationId: {
            not: null,
          },
          AND: {
            targetLocationId: {
              in: (
                await prisma.locationAccess.findMany({
                  where: { userId },
                  select: { locationId: true },
                })
              ).map((row) => row.locationId),
            },
          },
        },
      ],
    },
    include: {
      customerOrder: {
        include: {
          store: true,
          lines: { include: { allocations: true, sku: true } },
        },
      },
      lines: { include: { orderLine: true, receipts: true } },
      shipments: true,
      inspections: true,
    },
  });
}

export async function getAfterSalesData() {
  const context = await requireUserContext();
  const locationIds = await prisma.locationAccess.findMany({
    where: { userId: context.userId },
    select: { locationId: true },
  });
  const [cases, orders, locations] = await Promise.all([prisma.afterSalesCase.findMany({
    where: {
      OR: [
        { organizationId: context.organizationId },
        { targetLocationId: { in: locationIds.map((row) => row.locationId) } },
      ],
    },
    include: {
      organization: { select: { id: true, name: true } },
      customerOrder: { select: { id: true, orderNumber: true, externalOrderNo: true } },
      lines: { include: { orderLine: { include: { sku: true } }, receipts: true } },
      shipments: true,
    },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
  }), prisma.customerOrder.findMany({
    where: {
      store: { organizationId: context.organizationId },
      orderStatus: { in: ["CONFIRMED", "SHIPPED", "DELIVERED", "RETURNED"] },
    },
    select: {
      id: true,
      orderNumber: true,
      externalOrderNo: true,
      currency: true,
      lines: { select: { id: true, quantity: true, sku: { select: { name: true, code: true } } } },
    },
    orderBy: { orderDate: "desc" },
    take: 100,
  }), prisma.location.findMany({
    where: {
      OR: [
        { operatorOrganizationId: context.organizationId },
        { accesses: { some: { userId: context.userId } } },
      ],
    },
    select: { id: true, name: true, operatorOrganizationId: true },
    orderBy: { name: "asc" },
  })]);
  return {
    currentOrganizationId: context.organizationId,
    orders: orders.map((order) => ({
      ...order,
      lines: order.lines.map((line) => ({ ...line, quantity: line.quantity.toString() })),
    })),
    locations,
    cases: cases.map((item) => ({
      ...item,
      refundAmount: item.refundAmount?.toString() ?? null,
      lines: item.lines.map((line) => ({
        ...line,
        quantity: line.quantity.toString(),
        receipts: line.receipts.map((receipt) => ({ ...receipt, quantity: receipt.quantity.toString() })),
      })),
    })),
  };
}

export async function createAfterSalesCaseAction(data: {
  customerOrderId: string;
  type: string;
  reason: string;
  responsibility?: string;
  refundAmount?: string;
  refundCurrency?: string;
  targetLocationId?: string;
  lines: Array<{ orderLineId: string; quantity: string }>;
  idempotencyKey?: string;
}) {
  try {
    const context = await requireUserContext();
    if (!CASE_TYPES.has(data.type)) throw new Error("售后类型无效");
    if (!data.reason.trim()) throw new Error("请填写售后原因");
    if (data.idempotencyKey) {
      const existing = await prisma.afterSalesCase.findFirst({
        where: {
          organizationId: context.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
        select: { id: true },
      });
      if (existing) return actionSuccess({ id: existing.id });
    }
    const order = await prisma.customerOrder.findUnique({
      where: { id: data.customerOrderId },
      include: {
        store: true,
        lines: {
          include: {
            afterSalesLines: { include: { afterSalesCase: true } },
          },
        },
      },
    });
    if (!order || order.store.organizationId !== context.organizationId) {
      throw new Error("订单不存在或不属于当前经营主体");
    }
    if (!["CONFIRMED", "SHIPPED", "DELIVERED", "RETURNED"].includes(order.orderStatus)) {
      throw new Error("当前订单状态不能创建售后");
    }
    if (data.lines.length === 0 && data.type !== "REFUND_ONLY") throw new Error("请选择售后商品");
    const normalizedLines = data.lines.map((input) => {
      const line = order.lines.find((row) => row.id === input.orderLineId);
      if (!line) throw new Error("售后商品不属于该订单");
      const quantity = parsePositive(input.quantity, "售后数量");
      const previous = line.afterSalesLines
        .filter((row) => row.afterSalesCase.status !== "REJECTED")
        .reduce((sum, row) => sum.plus(row.quantity), new Decimal(0));
      if (previous.plus(quantity).gt(line.quantity)) throw new Error("累计售后数量超过订单数量");
      return { orderLineId: line.id, quantity };
    });
    const refundAmount = data.refundAmount ? parsePositive(data.refundAmount, "退款金额") : null;
    const targetLocation = data.targetLocationId
      ? await prisma.location.findUnique({ where: { id: data.targetLocationId } })
      : null;
    if (data.targetLocationId && !targetLocation) throw new Error("退货仓库不存在");
    if (
      targetLocation &&
      targetLocation.operatorOrganizationId !== context.organizationId
    ) {
      const agreement = await prisma.serviceAgreement.findFirst({
        where: {
          clientOrganizationId: context.organizationId,
          providerOrganizationId: targetLocation.operatorOrganizationId ?? "",
          OR: [{ locationId: targetLocation.id }, { locationId: null }],
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!agreement) throw new Error("该外部仓库没有有效的退件服务协议");
    }

    const created = await prisma.afterSalesCase.create({
      data: {
        organizationId: context.organizationId,
        customerOrderId: order.id,
        caseNo: nextCaseNo(),
        idempotencyKey: data.idempotencyKey || null,
        type: data.type,
        reason: data.reason.trim(),
        responsibility: data.responsibility || null,
        refundAmount,
        refundCurrency: refundAmount ? data.refundCurrency || order.currency : null,
        targetLocationId: data.targetLocationId || null,
        requestedById: context.userId,
        lines: { create: normalizedLines },
      },
    });
    revalidateAfterSales(order.id);
    return actionSuccess({ id: created.id });
  } catch (error) {
    return toActionFailure(error, "创建售后单失败");
  }
}

export async function authorizeAfterSalesCaseAction(id: string, data?: {
  carrier?: string;
  trackingNo?: string;
}) {
  try {
    const context = await requireUserContext();
    const item = await findVisibleCase(id, context.userId, context.organizationId);
    if (!item || item.organizationId !== context.organizationId) throw new Error("售后单不存在或无权审批");
    if (item.status !== "REQUESTED") throw new Error("只有待申请售后单可以审批");
    await prisma.$transaction(async (tx) => {
      await tx.afterSalesCase.update({
        where: { id },
        data: { status: data?.trackingNo ? "IN_TRANSIT" : "AUTHORIZED", authorizedById: context.userId, authorizedAt: new Date() },
      });
      if (data?.trackingNo || data?.carrier) {
        await tx.afterSalesShipment.create({
          data: {
            afterSalesCaseId: id,
            carrier: data.carrier || null,
            trackingNo: data.trackingNo || null,
            toLocationId: item.targetLocationId,
            status: data.trackingNo ? "IN_TRANSIT" : "PENDING",
            shippedAt: data.trackingNo ? new Date() : null,
          },
        });
      }
    });
    revalidateAfterSales(item.customerOrderId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "审批售后单失败");
  }
}

export async function receiveAfterSalesReturnAction(id: string) {
  try {
    const context = await requireUserContext();
    const item = await findVisibleCase(id, context.userId, context.organizationId);
    if (!item) throw new Error("售后单不存在或无权访问");
    if (!["AUTHORIZED", "IN_TRANSIT"].includes(item.status)) throw new Error("售后单当前不能登记收货");
    if (!item.targetLocationId) throw new Error("售后单缺少退货仓库");
    const targetLocationId = item.targetLocationId;
    const canReceive = await hasLocationCapability(
      context.userId,
      targetLocationId,
      "receive",
    );
    if (!canReceive) throw new Error("无权在该仓库登记退货收货");

    await prisma.$transaction(async (tx) => {
      for (const caseLine of item.lines) {
        let remaining = new Decimal(caseLine.quantity.toString());
        const sourceLine = item.customerOrder.lines.find((line) => line.id === caseLine.orderLineId);
        if (!sourceLine) continue;
        for (const allocation of sourceLine.allocations) {
          if (remaining.lte(0)) break;
          const alreadyReceived = caseLine.receipts.some((receipt) => receipt.orderAllocationId === allocation.id);
          if (alreadyReceived) continue;
          const quantity = Decimal.min(remaining, new Decimal(allocation.quantity.toString()));
          if (allocation.itemUnitId) {
            const unit = await tx.itemUnit.findUnique({ where: { id: allocation.itemUnitId } });
            if (!unit) continue;
            await tx.stockLedger.create({
              data: {
                storeId: unit.storeId,
                inventoryPoolId: unit.inventoryPoolId,
                entityType: "ITEM_UNIT",
                entityId: unit.id,
                locationId: targetLocationId,
                deltaQty: quantity,
                reason: "RETURN_IN",
                refType: "AFTER_SALES_CASE",
                refId: item.id,
              },
            });
            await tx.itemUnit.update({
              where: { id: unit.id },
              data: { locationId: targetLocationId, status: "RETURN_CHECK" },
            });
            await tx.afterSalesReceipt.create({
              data: {
                afterSalesLineId: caseLine.id,
                orderAllocationId: allocation.id,
                itemUnitId: unit.id,
                quantity,
              },
            });
          } else if (allocation.lotId) {
            const lot = await tx.inventoryLot.findUnique({ where: { id: allocation.lotId } });
            if (!lot) continue;
            const returnedLot = await tx.inventoryLot.create({
              data: {
                storeId: lot.storeId,
                inventoryPoolId: lot.inventoryPoolId,
                skuId: lot.skuId,
                locationId: targetLocationId,
                unitCost: lot.unitCost,
                costCurrency: lot.costCurrency,
                fxRateId: lot.fxRateId,
                sourceType: "AFTER_SALES",
                sourceId: item.id,
                receivedAt: new Date(),
                batchLabel: `退货 ${item.caseNo}`,
                status: "RETURN_CHECK",
              },
            });
            await tx.stockLedger.create({
              data: {
                storeId: lot.storeId,
                inventoryPoolId: lot.inventoryPoolId,
                entityType: "LOT",
                entityId: returnedLot.id,
                locationId: targetLocationId,
                deltaQty: quantity,
                reason: "RETURN_IN",
                refType: "AFTER_SALES_CASE",
                refId: item.id,
              },
            });
            await tx.afterSalesReceipt.create({
              data: {
                afterSalesLineId: caseLine.id,
                orderAllocationId: allocation.id,
                returnedLotId: returnedLot.id,
                quantity,
              },
            });
          }
          await tx.orderAllocation.update({
            where: { id: allocation.id },
            data: {
              status: quantity.eq(allocation.quantity)
                ? "RETURNED"
                : "PARTIALLY_RETURNED",
            },
          });
          remaining = remaining.minus(quantity);
        }
        if (remaining.gt(0)) throw new Error("售后数量无法对应到原库存分配");
      }
      await tx.afterSalesCase.update({
        where: { id: item.id },
        data: { status: "INSPECTING", receivedAt: new Date() },
      });
      await tx.afterSalesShipment.updateMany({
        where: { afterSalesCaseId: item.id, direction: "RETURN", status: { not: "RECEIVED" } },
        data: { status: "RECEIVED", receivedAt: new Date() },
      });
      await tx.inspectionEvent.create({
        data: {
          storeId: item.customerOrder.storeId,
          inventoryPoolId: item.customerOrder.lines[0]?.allocations[0]
            ? (await tx.inventoryPool.findFirst({ where: { legacyStoreId: item.customerOrder.storeId }, select: { id: true } }))?.id
            : null,
          afterSalesCaseId: item.id,
          refType: "AFTER_SALES_CASE",
          refId: item.id,
          locationId: targetLocationId,
          result: "PARTIAL",
        },
      });
    });
    revalidateAfterSales(item.customerOrderId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "登记退货收货失败");
  }
}

export async function resolveAfterSalesCaseAction(id: string, data: {
  resolution: string;
  note?: string;
}) {
  try {
    const context = await requireUserContext();
    const item = await findVisibleCase(id, context.userId, context.organizationId);
    if (!item) throw new Error("售后单不存在或无权访问");
    if (item.status !== "INSPECTING" && item.type !== "REFUND_ONLY") throw new Error("退货收货后才能完成检查");
    if (!RESOLUTIONS.has(data.resolution)) throw new Error("售后处理结果无效");
    if (
      item.targetLocationId &&
      !(await hasLocationCapability(context.userId, item.targetLocationId, "inspect"))
    ) {
      throw new Error("无权在该仓库提交退件检查结果");
    }

    await ensureSystemChargeCategories();
    await prisma.$transaction(async (tx) => {
      for (const line of item.lines) {
        await tx.afterSalesLine.update({
          where: { id: line.id },
          data: { resolution: data.resolution, conditionNote: data.note || null },
        });
        for (const receipt of line.receipts) {
          const receiptStatus =
            data.resolution === "RESTOCK"
              ? "RESTOCKED"
              : data.resolution === "SCRAP"
                ? "SCRAPPED"
                : data.resolution === "RETURN_TO_SUPPLIER"
                  ? "RETURNED_TO_SUPPLIER"
                  : data.resolution === "DOWNGRADE"
                    ? "DOWNGRADED"
                    : "QUARANTINED";
          if (receipt.itemUnitId) {
            await tx.itemUnit.update({
              where: { id: receipt.itemUnitId },
              data: { status: data.resolution === "RESTOCK" ? "AVAILABLE" : data.resolution === "SCRAP" ? "CONSUMED" : "RETURN_CHECK" },
            });
            if (data.resolution === "SCRAP") {
              const unit = await tx.itemUnit.findUniqueOrThrow({ where: { id: receipt.itemUnitId } });
              await tx.stockLedger.create({
                data: {
                  storeId: unit.storeId,
                  inventoryPoolId: unit.inventoryPoolId,
                  entityType: "ITEM_UNIT",
                  entityId: unit.id,
                  locationId: unit.locationId,
                  deltaQty: new Decimal(receipt.quantity.toString()).negated(),
                  reason: "ADJUST",
                  refType: "AFTER_SALES_CASE",
                  refId: item.id,
                  meta: { resolution: "SCRAP" },
                },
              });
            }
          }
          if (receipt.returnedLotId) {
            const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: receipt.returnedLotId } });
            await tx.inventoryLot.update({
              where: { id: lot.id },
              data: { status: data.resolution === "RESTOCK" ? "ACTIVE" : "RETURN_CHECK" },
            });
            if (["SCRAP", "RETURN_TO_SUPPLIER"].includes(data.resolution)) {
              await tx.stockLedger.create({
                data: {
                  storeId: lot.storeId,
                  inventoryPoolId: lot.inventoryPoolId,
                  entityType: "LOT",
                  entityId: lot.id,
                  locationId: lot.locationId,
                  deltaQty: new Decimal(receipt.quantity.toString()).negated(),
                  reason: data.resolution === "SCRAP" ? "ADJUST" : "RETURN_OUT",
                  refType: "AFTER_SALES_CASE",
                  refId: item.id,
                },
              });
            }
          }
          await tx.afterSalesReceipt.update({ where: { id: receipt.id }, data: { status: receiptStatus } });
        }
      }

      if (item.refundAmount?.gt(0)) {
        const category = await tx.chargeCategory.findFirstOrThrow({
          where: { organizationId: null, code: "AFTER_SALES" },
        });
        const existingRefund = await tx.chargeEvent.findFirst({
          where: { organizationId: item.organizationId, idempotencyKey: `after-sales-refund:${item.id}` },
        });
        if (!existingRefund) {
          await tx.chargeEvent.create({
            data: {
              organizationId: item.organizationId,
              categoryId: category.id,
              sourceType: "AFTER_SALES_CASE",
              sourceId: item.id,
              idempotencyKey: `after-sales-refund:${item.id}`,
              amountKind: "ACTUAL",
              amount: item.refundAmount,
              currency: item.refundCurrency || item.customerOrder.currency,
              status: "CONFIRMED",
              description: `售后退款 ${item.caseNo}`,
              createdById: context.userId,
              submittedById: context.userId,
              submittedAt: new Date(),
              confirmedById: context.userId,
              confirmedAt: new Date(),
              parties: {
                create: [
                  {
                    role: "PAYER",
                    partyType: "ORGANIZATION",
                    partyId: item.organizationId,
                    organizationId: item.organizationId,
                    nameSnapshot: "销售主体",
                  },
                  {
                    role: "PAYEE",
                    partyType: "CUSTOMER",
                    partyId: item.customerOrderId,
                    nameSnapshot: item.customerOrder.customerName,
                  },
                ],
              },
              allocations: {
                create: { targetType: "AFTER_SALES_CASE", targetId: item.id, amount: item.refundAmount },
              },
            },
          });
        }
      }
      await tx.afterSalesCase.update({
        where: { id: item.id },
        data: { status: "RESOLVED", resolvedById: context.userId, resolvedAt: new Date() },
      });
      await tx.inspectionEvent.updateMany({
        where: { afterSalesCaseId: item.id },
        data: { result: data.resolution === "RESTOCK" ? "PASSED" : "FAILED", failureReason: data.note || null },
      });
    });
    revalidateAfterSales(item.customerOrderId);
    revalidatePath("/finance/charges");
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "完成售后检查失败");
  }
}
