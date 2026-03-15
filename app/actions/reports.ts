"use server";

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

export async function getBusinessOverview(storeId: string) {
  // 获取库存统计
  const inventoryLots = await prisma.inventoryLot.findMany({
    where: { storeId, status: "ACTIVE" },
    select: { unitCost: true },
  });

  const itemUnits = await prisma.itemUnit.findMany({
    where: { storeId, status: "AVAILABLE" },
    select: { unitCost: true },
  });

  const totalInventoryValue = [
    ...inventoryLots.map((lot) => new Decimal(lot.unitCost.toString())),
    ...itemUnits.map((item) => new Decimal(item.unitCost.toString())),
  ].reduce((sum, cost) => sum.plus(cost), new Decimal(0));

  // 获取采购统计
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { storeId },
    select: { totalAmount: true, status: true },
  });

  const totalPurchaseAmount = purchaseOrders.reduce(
    (sum, order) => sum.plus(new Decimal(order.totalAmount.toString())),
    new Decimal(0)
  );

  const receivedOrders = purchaseOrders.filter((o) => o.status === "RECEIVED").length;

  // 获取销售统计
  const customerOrders = await prisma.customerOrder.findMany({
    where: { storeId },
    select: { totalPaid: true, orderStatus: true },
  });

  const totalSalesAmount = customerOrders.reduce(
    (sum, order) => sum.plus(new Decimal(order.totalPaid.toString())),
    new Decimal(0)
  );

  const confirmedOrders = customerOrders.filter(
    (o) => o.orderStatus === "CONFIRMED" || o.orderStatus === "SHIPPED" || o.orderStatus === "DELIVERED"
  ).length;

  // 获取上架统计
  const listings = await prisma.listing.findMany({
    where: { storeId },
    select: { status: true },
  });

  const activeListings = listings.filter((l) => l.status === "ACTIVE").length;

  return {
    inventory: {
      totalValue: totalInventoryValue.toFixed(2),
      lotCount: inventoryLots.length,
      itemCount: itemUnits.length,
    },
    procurement: {
      totalAmount: totalPurchaseAmount.toFixed(2),
      orderCount: purchaseOrders.length,
      receivedCount: receivedOrders,
    },
    sales: {
      totalAmount: totalSalesAmount.toFixed(2),
      orderCount: customerOrders.length,
      confirmedCount: confirmedOrders,
    },
    listing: {
      activeCount: activeListings,
      totalCount: listings.length,
    },
  };
}

export async function getInventoryReport(storeId: string) {
  const lots = await prisma.inventoryLot.findMany({
    where: { storeId },
    include: {
      sku: true,
      location: true,
    },
  });

  const items = await prisma.itemUnit.findMany({
    where: { storeId },
    include: {
      sku: true,
      location: true,
    },
  });

  // 按位置统计
  const byLocation = new Map<string, { name: string; value: number }>();
  
  lots.forEach((lot) => {
    const key = lot.location.code;
    const current = byLocation.get(key) || { name: lot.location.name, value: 0 };
    current.value += parseFloat(lot.unitCost.toString());
    byLocation.set(key, current);
  });

  items.forEach((item) => {
    const key = item.location.code;
    const current = byLocation.get(key) || { name: item.location.name, value: 0 };
    current.value += parseFloat(item.unitCost.toString());
    byLocation.set(key, current);
  });

  // 按状态统计
  const byStatus = {
    active: lots.filter((l) => l.status === "ACTIVE").length,
    consumed: lots.filter((l) => l.status === "CONSUMED").length,
    available: items.filter((i) => i.status === "AVAILABLE").length,
    allocated: items.filter((i) => i.status === "ALLOCATED").length,
  };

  return {
    byLocation: Array.from(byLocation.values()),
    byStatus,
    totalLots: lots.length,
    totalItems: items.length,
  };
}

export async function getSalesReport(storeId: string) {
  const orders = await prisma.customerOrder.findMany({
    where: { storeId },
    orderBy: { createdAt: "asc" },
  });

  // 按月统计
  const byMonth = new Map<string, number>();
  orders.forEach((order) => {
    const month = order.createdAt.toISOString().slice(0, 7); // YYYY-MM
    const current = byMonth.get(month) || 0;
    byMonth.set(month, current + parseFloat(order.totalPaid.toString()));
  });

  // 按状态统计
  const byStatus = {
    draft: orders.filter((o) => o.orderStatus === "DRAFT").length,
    confirmed: orders.filter((o) => o.orderStatus === "CONFIRMED").length,
    shipped: orders.filter((o) => o.orderStatus === "SHIPPED").length,
    delivered: orders.filter((o) => o.orderStatus === "DELIVERED").length,
  };

  return {
    byMonth: Array.from(byMonth.entries()).map(([month, amount]) => ({
      month,
      amount,
    })),
    byStatus,
    totalOrders: orders.length,
    totalAmount: orders.reduce(
      (sum, o) => sum + parseFloat(o.totalPaid.toString()),
      0
    ),
  };
}
