import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { createStoreMoneyConverter, FxRateUnavailableError } from "@/lib/fx";
import { isValidSalesStatus } from "@/lib/application/sales-metrics";
import {
  reportDay,
  reportProfit,
  sumReportMoney,
  type resolveReportRange,
} from "./operating-report-math";

export type ReportMoney = {
  original: string;
  currency: string;
  base: string | null;
  rate: string | null;
  basis: string;
  error: string | null;
};
export type ReportRow = {
  id: string;
  date: string;
  label: string;
  detail: string;
  status: string;
  href: string;
  money: ReportMoney;
  included: boolean;
  note: string;
};
export type ReportSale = ReportRow & {
  platformFee: string | null;
  shippingFee: string | null;
  cost: string | null;
  profit: string | null;
  provisional: boolean;
  costDetails: ReportMoney[];
  providerFeeEstimate: string | null;
};
export type ReportStock = ReportRow & { quantity: string; location: string };
export type ReportCharge = ReportRow & { direction: string; kind: string; category: string };
export type ReportSettlement = ReportRow & { direction: string; settlementNo: string };

type Range = ReturnType<typeof resolveReportRange>;

// Internal server query: the page resolves the authenticated store and organization.
// Do not expose arbitrary store/organization IDs as a public server action.
export async function getOperatingReport(storeId: string, organizationId: string, range: Range) {
  const converter = await createStoreMoneyConverter(storeId);
  const period = { gte: range.dateFrom, lte: range.dateTo };
  const [store, orders, purchases, lots, items, logistics, charges, settlements, listingCount] =
    await Promise.all([
      prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } }),
      prisma.customerOrder.findMany({
        where: { storeId, orderDate: period },
        orderBy: { orderDate: "desc" },
        select: {
          id: true,
          orderNumber: true,
          orderDate: true,
          orderStatus: true,
          currency: true,
          totalPaid: true,
          platformFee: true,
          shippingFee: true,
          shippingFeeStatus: true,
          shippingProviderFeeRate: true,
          platform: { select: { name: true } },
          lines: {
            select: {
              quantity: true,
              allocations: {
                select: {
                  quantity: true,
                  status: true,
                  costAmount: true,
                  costCurrency: true,
                  inventoryLot: {
                    select: { costCurrency: true, receivedAt: true, costStatus: true },
                  },
                  itemUnit: { select: { costCurrency: true, createdAt: true, costStatus: true } },
                },
              },
            },
          },
        },
      }),
      prisma.purchaseOrder.findMany({
        where: { storeId, OR: [{ orderedAt: period }, { orderedAt: null, createdAt: period }] },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNo: true,
          supplierName: true,
          currency: true,
          fxRate: true,
          totalAmount: true,
          status: true,
          orderedAt: true,
          createdAt: true,
        },
      }),
      prisma.inventoryLot.findMany({
        where: { storeId, status: "ACTIVE" },
        select: {
          id: true,
          unitCost: true,
          costCurrency: true,
          costStatus: true,
          receivedAt: true,
          batchLabel: true,
          sku: { select: { name: true, code: true } },
          location: { select: { name: true } },
        },
      }),
      prisma.itemUnit.findMany({
        where: { storeId, status: "AVAILABLE" },
        select: {
          id: true,
          unitCode: true,
          unitCost: true,
          costCurrency: true,
          costStatus: true,
          createdAt: true,
          sku: { select: { name: true, code: true } },
          location: { select: { name: true } },
        },
      }),
      prisma.logisticsCost.findMany({
        where: { storeId, occurredAt: period },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.chargeEvent.findMany({
        where: {
          occurredAt: period,
          status: { not: "VOID" },
          OR: [{ organizationId }, { parties: { some: { organizationId } } }],
        },
        include: {
          category: { select: { name: true } },
          parties: { select: { role: true, organizationId: true } },
        },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.settlement.findMany({
        where: { storeId, createdAt: period },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.listing.count({ where: { storeId, status: "ACTIVE" } }),
    ]);
  async function money(
    amount: Decimal.Value,
    currency: string,
    date: Date,
    options: {
      rate?: Decimal.Value | null;
      base?: Decimal.Value | null;
      baseCurrency?: string | null;
      excluded?: boolean;
      pendingCost?: boolean;
    } = {}
  ): Promise<ReportMoney> {
    const original = new Decimal(amount).toString();
    const blank = { original, currency, base: null, rate: null };
    if (options.excluded) return { ...blank, basis: "未纳入", error: null };
    if (options.pendingCost) return { ...blank, basis: "成本待确认", error: "采购成本尚未确认" };
    try {
      const snapshot = options.base != null && options.baseCurrency === converter.baseCurrency;
      const base = snapshot
        ? new Decimal(options.base!)
        : await converter.convertToBase(original, currency, {
            effectiveAt: date,
            preferredRate: options.rate,
          });
      return {
        original,
        currency,
        base: base.toFixed(2),
        rate: new Decimal(original).isZero() ? null : base.div(original).toFixed(8),
        basis: snapshot
          ? "单据本位币快照"
          : currency === converter.baseCurrency
            ? "本位币，无需换算"
            : options.rate
              ? "单据约定汇率"
              : `${reportDay(date)} 历史汇率`,
        error: null,
      };
    } catch (error) {
      if (!(error instanceof FxRateUnavailableError)) throw error;
      return { ...blank, basis: "汇率待补录", error: error.message };
    }
  }
  const sales: ReportSale[] = await Promise.all(
    orders.map(async (order) => {
      const included = isValidSalesStatus(order.orderStatus);
      const saleMoney = await money(order.totalPaid.toString(), order.currency, order.orderDate, {
        excluded: !included,
      });
      const platformFee = included
        ? (await money(order.platformFee.toString(), order.currency, order.orderDate)).base
        : null;
      const shippingFee = included
        ? (await money(order.shippingFee.toString(), order.currency, order.orderDate)).base
        : null;
      const providerFeeEstimate = included
        ? order.shippingProviderFeeRate
          ? (
              await money(
                new Decimal(order.totalPaid.toString()).mul(
                  order.shippingProviderFeeRate.toString()
                ),
                order.currency,
                order.orderDate
              )
            ).base
          : "0.00"
        : null;
      const costValues: Array<string | null> = [];
      const costDetails: ReportMoney[] = [];
      let missingCost = included && order.lines.length === 0;
      if (included)
        for (const line of order.lines) {
          const allocations = line.allocations.filter((a) =>
            ["PENDING", "ALLOCATED", "SHIPPED", "DELIVERED"].includes(a.status)
          );
          const allocatedQty = allocations.reduce(
            (sum, a) => sum.plus(a.quantity.toString()),
            new Decimal(0)
          );
          if (!allocatedQty.eq(line.quantity.toString())) missingCost = true;
          for (const a of allocations) {
            const source = a.inventoryLot ?? a.itemUnit;
            const currency = a.costCurrency ?? source?.costCurrency;
            if (!currency || source?.costStatus === "PENDING") {
              missingCost = true;
              continue;
            }
            const converted = await money(
              a.costAmount.toString(),
              currency,
              a.inventoryLot?.receivedAt ?? a.itemUnit?.createdAt ?? order.orderDate
            );
            costValues.push(converted.base);
            costDetails.push(converted);
          }
        }
      const cost = !included || missingCost ? null : sumReportMoney(costValues);
      const profit = included
        ? reportProfit(saleMoney.base, [platformFee, shippingFee, cost])
        : null;
      const provisional = included && order.shippingFeeStatus !== "ACTUAL";
      return {
        id: order.id,
        date: reportDay(order.orderDate),
        label: order.orderNumber,
        detail: order.platform?.name ?? "直销",
        status: order.orderStatus,
        href: `/sales/${order.id}`,
        money: saleMoney,
        included,
        platformFee,
        shippingFee,
        cost,
        profit,
        provisional,
        costDetails,
        providerFeeEstimate,
        note: !included
          ? "未成交、已取消及整单退货不计入销售"
          : missingCost
            ? "库存分配或成本未完整确认"
            : profit === null
              ? "汇率待补录，利润待核算"
              : provisional
                ? "邮费未确认为实际值，利润仅供参考"
                : "按已录入订单费用计算",
      };
    })
  );
  const procurement: ReportRow[] = await Promise.all(
    purchases.map(async (order) => {
      const included = !["DRAFT", "CANCELLED"].includes(order.status);
      const date = order.orderedAt ?? order.createdAt;
      return {
        id: order.id,
        label: order.orderNo,
        detail: order.supplierName ?? "未填写供应商",
        date: reportDay(date),
        status: order.status,
        href: `/procurement/${order.id}`,
        money: await money(order.totalAmount.toString(), order.currency, date, {
          rate: order.fxRate?.toString(),
          excluded: !included,
        }),
        included,
        note: included ? "按下单日统计，未下单记录使用创建日" : "草稿及取消采购不计入采购额",
      };
    })
  );
  const ledgers = lots.length
    ? await prisma.stockLedger.groupBy({
        by: ["entityId"],
        where: { storeId, entityType: "LOT", entityId: { in: lots.map((lot) => lot.id) } },
        _sum: { deltaQty: true },
      })
    : [];
  const quantities = new Map(
    ledgers.map((ledger) => [ledger.entityId, new Decimal(ledger._sum.deltaQty?.toString() ?? 0)])
  );
  const stock: ReportStock[] = await Promise.all([
    ...lots
      .filter((lot) => quantities.get(lot.id)?.gt(0))
      .map(async (lot) => ({
        id: lot.id,
        date: reportDay(lot.receivedAt),
        label: lot.sku.name,
        detail: lot.batchLabel ?? lot.sku.code,
        status: "ACTIVE",
        href: `/inventory/lots/${lot.id}`,
        included: true,
        quantity: quantities.get(lot.id)!.toString(),
        location: lot.location.name,
        money: await money(
          new Decimal(lot.unitCost.toString()).mul(quantities.get(lot.id)!),
          lot.costCurrency,
          lot.receivedAt,
          { pendingCost: lot.costStatus === "PENDING" }
        ),
        note: "当前在库数量 × 单位成本",
      })),
    ...items.map(async (item) => ({
      id: item.id,
      date: reportDay(item.createdAt),
      label: item.sku.name,
      detail: item.unitCode ?? item.sku.code,
      status: "AVAILABLE",
      href: `/inventory/items/${item.id}`,
      included: true,
      quantity: "1",
      location: item.location.name,
      money: await money(item.unitCost.toString(), item.costCurrency, item.createdAt, {
        pendingCost: item.costStatus === "PENDING",
      }),
      note: "当前可用单品的历史成本",
    })),
  ]);
  const expenseLabels: Record<string, string> = {
    PURCHASE_ORDER: "采购物流",
    INBOUND_SHIPMENT: "转仓物流",
    CONSOLIDATION_BATCH: "集运物流",
  };
  const expenseRoutes: Record<string, string> = {
    PURCHASE_ORDER: "/procurement",
    INBOUND_SHIPMENT: "/logistics/transfers",
    CONSOLIDATION_BATCH: "/logistics/consolidations",
  };
  const expenses: ReportRow[] = await Promise.all(
    logistics.map(async (cost) => ({
      id: cost.id,
      date: reportDay(cost.occurredAt),
      label: expenseLabels[cost.sourceType] ?? "物流支出",
      detail:
        cost.note ??
        { SHIPPING: "物流运费", TAX: "税费", CUSTOMS: "清关费", HANDLING: "操作费" }[
          cost.feeType
        ] ??
        "其他物流费用",
      status: "ACTUAL",
      href: `${expenseRoutes[cost.sourceType] ?? "/logistics/transfers"}/${cost.sourceId}`,
      included: true,
      money: await money(cost.amount.toString(), cost.currency, cost.occurredAt),
      note: "实际物流支出；单列展示，不重复扣减订单成本",
    }))
  );
  const chargeRows: ReportCharge[] = await Promise.all(
    charges.map(async (event) => {
      const payer = event.parties.some(
        (party) => party.organizationId === organizationId && party.role === "PAYER"
      );
      const payee = event.parties.some(
        (party) => party.organizationId === organizationId && party.role === "PAYEE"
      );
      const direction = payer && payee ? "内部往来" : payer ? "应付" : payee ? "应收" : "关联费用";
      const included =
        event.amountKind === "ACTUAL" &&
        ["CONFIRMED", "PARTIALLY_SETTLED", "SETTLED"].includes(event.status) &&
        payer !== payee;
      return {
        id: event.id,
        date: reportDay(event.occurredAt),
        label: event.description,
        detail: event.category.name,
        category: event.category.name,
        status: event.status,
        href: "/finance/charges",
        included,
        kind: event.amountKind,
        direction,
        money: await money(event.amount.toString(), event.currency, event.occurredAt, {
          base: event.baseAmount?.toString(),
          baseCurrency: event.baseCurrency,
          rate: event.baseCurrency === converter.baseCurrency ? event.fxRate?.toString() : null,
          excluded: !included,
        }),
        note: "当前主体全部费用；可能与订单/物流重叠，独立对账，不并入店铺利润",
      };
    })
  );
  const settlementRows: ReportSettlement[] = [];
  for (const settlement of settlements) {
    for (const line of settlement.lines) {
      const included = settlement.status !== "VOID" && line.direction !== "INFORMATIONAL";
      settlementRows.push({
        id: line.id,
        date: reportDay(settlement.createdAt),
        label: settlement.settlementNo,
        settlementNo: settlement.settlementNo,
        detail: line.description,
        status: settlement.status,
        direction: line.direction,
        href: `/finance/settlements/${settlement.id}`,
        included,
        money: await money(line.amount.toString(), line.currency, settlement.createdAt, {
          base: line.baseAmount?.toString(),
          baseCurrency: line.baseCurrency,
          rate: line.baseCurrency === converter.baseCurrency ? line.fxRate?.toString() : null,
          excluded: !included,
        }),
        note:
          line.direction === "INFORMATIONAL"
            ? "说明行，不计应收应付"
            : settlement.status === "DRAFT"
              ? "草稿待确认，不计正式待结算"
              : "按结算单创建期间统计",
      });
    }
  }
  const validSales = sales.filter((row) => row.included);
  const total = (rows: ReportRow[]) =>
    sumReportMoney(rows.filter((row) => row.included).map((row) => row.money.base));
  const monthly = [];
  for (
    let cursor = new Date(`${range.from.slice(0, 7)}-01T00:00:00Z`);
    cursor.toISOString().slice(0, 7) <= range.to.slice(0, 7);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  ) {
    const month = cursor.toISOString().slice(0, 7);
    const rows = validSales.filter((row) => row.date.startsWith(month));
    monthly.push({
      month,
      revenue: total(rows),
      cost: sumReportMoney(rows.map((row) => row.cost)),
      platformFee: sumReportMoney(rows.map((row) => row.platformFee)),
      shippingFee: sumReportMoney(rows.map((row) => row.shippingFee)),
      profit: sumReportMoney(rows.map((row) => row.profit)),
      orderCount: rows.length,
    });
  }
  const platforms = Array.from(new Set(validSales.map((row) => row.detail))).map((name) => {
    const rows = validSales.filter((row) => row.detail === name);
    return {
      name,
      revenue: total(rows),
      profit: sumReportMoney(rows.map((row) => row.profit)),
      orderCount: rows.length,
    };
  });
  const stockLocations = Array.from(new Set(stock.map((row) => row.location))).map((name) => {
    const rows = stock.filter((row) => row.location === name);
    return {
      name,
      value: total(rows),
      quantity: rows.reduce((sum, row) => sum.plus(row.quantity), new Decimal(0)).toString(),
      count: rows.length,
    };
  });
  const settlementTotal = (status: string, direction: string) =>
    total(settlementRows.filter((row) => row.status === status && row.direction === direction));
  return {
    storeName: store.name,
    baseCurrency: converter.baseCurrency,
    from: range.from,
    to: range.to,
    rangeError: range.error,
    generatedAt: new Date().toISOString(),
    sales,
    procurement,
    stock,
    expenses,
    charges: chargeRows,
    settlements: settlementRows,
    monthly,
    platforms,
    stockLocations,
    summary: {
      revenue: total(validSales),
      profit: sumReportMoney(validSales.map((row) => row.profit)),
      cost: sumReportMoney(validSales.map((row) => row.cost)),
      platformFee: sumReportMoney(validSales.map((row) => row.platformFee)),
      shippingFee: sumReportMoney(validSales.map((row) => row.shippingFee)),
      providerFeeEstimate: sumReportMoney(validSales.map((row) => row.providerFeeEstimate)),
      inventory: total(stock),
      purchase: total(procurement),
      logistics: total(expenses),
      orderCount: validSales.length,
      listingCount,
      provisionalCount: validSales.filter((row) => row.provisional).length,
      missingProfitCount: validSales.filter((row) => row.profit === null).length,
      chargePayable: total(chargeRows.filter((row) => row.direction === "应付")),
      chargeReceivable: total(chargeRows.filter((row) => row.direction === "应收")),
      pendingPayable: settlementTotal("CONFIRMED", "PAYABLE"),
      pendingReceivable: settlementTotal("CONFIRMED", "RECEIVABLE"),
      paidPayable: settlementTotal("PAID", "PAYABLE"),
      paidReceivable: settlementTotal("PAID", "RECEIVABLE"),
      draftSettlements: settlements.filter((row) => row.status === "DRAFT").length,
      settlementCount: settlements.length,
    },
  };
}
export type OperatingReport = Awaited<ReturnType<typeof getOperatingReport>>;
