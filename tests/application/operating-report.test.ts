import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";

const db = vi.hoisted(() => ({
  store: { findUniqueOrThrow: vi.fn() },
  customerOrder: { findMany: vi.fn() },
  purchaseOrder: { findMany: vi.fn() },
  inventoryLot: { findMany: vi.fn() },
  itemUnit: { findMany: vi.fn() },
  logisticsCost: { findMany: vi.fn() },
  chargeEvent: { findMany: vi.fn() },
  settlement: { findMany: vi.fn() },
  listing: { count: vi.fn() },
  stockLedger: { groupBy: vi.fn() },
  fxRate: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { getOperatingReport } from "@/lib/application/operating-report";
import {
  reportCsv,
  reportDay,
  reportMoney,
  reportProfit,
  resolveReportRange,
  sumReportMoney,
} from "@/lib/application/operating-report-math";
const day = new Date("2026-09-10T03:00:00Z");
const range = () => resolveReportRange({ range: "custom", from: "2026-09-01", to: "2026-09-14" });
const order = (extra = {}) => ({
  id: "order-1",
  orderNumber: "SO-001",
  orderDate: day,
  orderStatus: "CONFIRMED",
  currency: "JPY",
  totalPaid: "10000",
  platformFee: "1000",
  shippingFee: "500",
  shippingFeeStatus: "ACTUAL",
  platform: { name: "Mercari" },
  lines: [
    {
      quantity: "1",
      unitPrice: "10000",
      lineAmount: "10000",
      sku: { name: "复古相机", code: "CAM-01" },
      allocations: [
        {
          quantity: "1",
          status: "ALLOCATED",
          costAmount: "200",
          costCurrency: "CNY",
          inventoryLot: {
            costCurrency: "CNY",
            receivedAt: new Date("2026-08-10T03:00:00Z"),
            costStatus: "CONFIRMED",
          },
          itemUnit: null,
        },
      ],
    },
  ],
  ...extra,
});
const settlementLine = (extra = {}) => ({
  id: "line-1",
  description: "供货货款",
  amount: "10000",
  currency: "JPY",
  direction: "PAYABLE",
  baseCurrency: "CNY",
  baseAmount: "480",
  fxRate: "0.048",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of [
    db.customerOrder,
    db.purchaseOrder,
    db.inventoryLot,
    db.itemUnit,
    db.logisticsCost,
    db.chargeEvent,
    db.settlement,
  ])
    model.findMany.mockResolvedValue([]);
  db.store.findUniqueOrThrow.mockResolvedValue({ name: "测试店铺" });
  db.listing.count.mockResolvedValue(0);
  db.stockLedger.groupBy.mockResolvedValue([]);
  db.fxRate.findFirst.mockImplementation(async ({ where }) => {
    const rate =
      where.toCurrency === "CNY"
        ? { JPY: "0.05", USD: "7" }[where.fromCurrency as "JPY" | "USD"]
        : null;
    return rate ? { rate: new Decimal(rate), effectiveDate: where.effectiveDate.lte } : null;
  });
});

describe("operating report financial boundaries", () => {
  it("converts revenue and fees in order currency, but cost in inventory currency; totals reconcile", async () => {
    db.customerOrder.findMany.mockResolvedValue([
      order(),
      order({
        id: "order-2",
        orderNumber: "SO-002",
        currency: "USD",
        totalPaid: "100",
        platformFee: "10",
        shippingFee: "5",
      }),
    ]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.sales[0]).toMatchObject({
      money: { original: "10000", currency: "JPY", base: "500.00", rate: "0.05000000" },
      cost: "200.00",
      profit: "225.00",
      occurredAt: day.toISOString(),
      items: [
        {
          name: "复古相机",
          code: "CAM-01",
          quantity: "1",
          unitPrice: "10000",
          lineAmount: "10000",
        },
      ],
    });
    expect(result.summary).toMatchObject({
      revenue: "1200.00",
      cost: "400.00",
      platformFee: "120.00",
      shippingFee: "60.00",
      profit: "620.00",
    });
    expect(result.monthly[0].revenue).toBe(result.summary.revenue);
    expect(sumReportMoney(result.sales.map((row) => row.profit))).toBe(result.summary.profit);
    expect(result.platforms[0].revenue).toBe(result.summary.revenue);
  });
  it("keeps agent fee estimates separate from contribution profit", async () => {
    db.customerOrder.findMany.mockResolvedValue([order({ shippingProviderFeeRate: "0.02" })]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.sales[0].providerFeeEstimate).toBe("10.00");
    expect(result.summary.providerFeeEstimate).toBe("10.00");
    expect(result.summary.profit).toBe("225.00");
  });
  it("preserves original amounts and makes missing FX totals unknown, never 1:1 or zero", async () => {
    db.customerOrder.findMany.mockResolvedValue([order({ currency: "XXX" })]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.sales[0].money).toMatchObject({ original: "10000", currency: "XXX", base: null });
    expect(result.sales[0].money.error).toContain("缺少");
    expect(result.summary.revenue).toBeNull();
    expect(result.summary.profit).toBeNull();
  });
  it("does not turn missing allocations or pending costs into profit", async () => {
    db.customerOrder.findMany.mockResolvedValue([order({ lines: [] })]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.summary.revenue).toBe("500.00");
    expect(result.summary.profit).toBeNull();
    expect(result.summary.missingProfitCount).toBe(1);
  });
  it("keeps estimates visibly provisional and excludes cancelled/returned sales before FX lookup", async () => {
    db.customerOrder.findMany.mockResolvedValue([
      order({ shippingFeeStatus: "ESTIMATED" }),
      order({ id: "cancelled", orderStatus: "CANCELLED", currency: "XXX" }),
      order({ id: "returned", orderStatus: "RETURNED", currency: "XXX" }),
    ]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.summary).toMatchObject({ revenue: "500.00", orderCount: 1, provisionalCount: 1 });
    expect(result.sales[1].money.error).toBeNull();
  });
  it("uses procurement agreed FX and excludes drafts/cancellations", async () => {
    const purchase = {
      id: "po-1",
      orderNo: "PO-001",
      currency: "JPY",
      fxRate: "0.048",
      totalAmount: "10000",
      orderedAt: day,
      createdAt: day,
      status: "ORDERED",
    };
    db.purchaseOrder.findMany.mockResolvedValue([
      purchase,
      { ...purchase, id: "draft", status: "DRAFT" },
      { ...purchase, id: "cancelled", status: "CANCELLED" },
    ]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.summary.purchase).toBe("480.00");
    expect(result.procurement[0].money.basis).toBe("单据约定汇率");
    expect(db.purchaseOrder.findMany.mock.calls[0][0].where.OR[0].orderedAt).toEqual({
      gte: range().dateFrom,
      lte: range().dateTo,
    });
  });
  it("uses current on-hand inventory independent of selected month, at quantity times unit cost", async () => {
    db.inventoryLot.findMany.mockResolvedValue([
      {
        id: "lot-1",
        unitCost: "1000",
        costCurrency: "JPY",
        costStatus: "CONFIRMED",
        receivedAt: new Date("2026-01-10T03:00:00Z"),
        sku: { name: "商品", code: "SKU1" },
        location: { name: "东京" },
      },
    ]);
    db.stockLedger.groupBy.mockResolvedValue([{ entityId: "lot-1", _sum: { deltaQty: "3" } }]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.stock[0].quantity).toBe("3");
    expect(result.summary.inventory).toBe("150.00");
    expect(result.stockLocations[0].value).toBe(result.summary.inventory);
    expect(db.inventoryLot.findMany.mock.calls[0][0].where).toEqual({
      storeId: "store-1",
      status: "ACTIVE",
    });
  });
  it("honors stored zero and nonzero settlement snapshots; draft and informational lines never inflate confirmed balances", async () => {
    db.settlement.findMany.mockResolvedValue([
      {
        id: "st-1",
        settlementNo: "ST1",
        status: "CONFIRMED",
        createdAt: day,
        lines: [
          settlementLine(),
          settlementLine({ id: "receive", direction: "RECEIVABLE", baseAmount: "200" }),
          settlementLine({ id: "zero", baseAmount: "0" }),
          settlementLine({ id: "info", direction: "INFORMATIONAL", baseAmount: "10000" }),
        ],
      },
      {
        id: "st-2",
        settlementNo: "ST2",
        status: "DRAFT",
        createdAt: day,
        lines: [settlementLine({ id: "draft", baseAmount: "9999" })],
      },
      {
        id: "st-3",
        settlementNo: "ST3",
        status: "VOID",
        createdAt: day,
        lines: [settlementLine({ id: "void", baseAmount: "9999" })],
      },
    ]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.summary).toMatchObject({
      pendingPayable: "480.00",
      pendingReceivable: "200.00",
      draftSettlements: 1,
    });
    expect(result.settlements[2].money.base).toBe("0.00");
    expect(result.settlements[0].money.basis).toBe("单据本位币快照");
  });
  it("keeps organization charges separate, ignores unconfirmed estimates and neutralizes internal roles", async () => {
    const event = {
      id: "charge-1",
      description: "仓储费",
      amount: "10000",
      currency: "JPY",
      baseAmount: "490",
      baseCurrency: "CNY",
      status: "CONFIRMED",
      amountKind: "ACTUAL",
      occurredAt: day,
      category: { name: "仓储费" },
      parties: [{ role: "PAYER", organizationId: "org-1" }],
    };
    db.chargeEvent.findMany.mockResolvedValue([
      event,
      { ...event, id: "estimate", amountKind: "ESTIMATE" },
      { ...event, id: "unconfirmed", status: "DRAFT" },
      {
        ...event,
        id: "internal",
        parties: [...event.parties, { role: "PAYEE", organizationId: "org-1" }],
      },
    ]);
    const result = await getOperatingReport("store-1", "org-1", range());
    expect(result.summary.chargePayable).toBe("490.00");
    expect(result.summary.profit).toBe("0.00");
    expect(result.charges[3].included).toBe(false);
  });
});

describe("report period and export", () => {
  it("uses Shanghai midnight boundaries and consistent monthly keys across UTC dates", () => {
    expect(range().dateFrom.toISOString()).toBe("2026-08-31T16:00:00.000Z");
    expect(range().dateTo.toISOString()).toBe("2026-09-14T15:59:59.999Z");
    expect(reportDay(new Date("2026-08-31T16:30:00Z"))).toBe("2026-09-01");
    expect(
      resolveReportRange({ range: "lastMonth" }, new Date("2026-01-15T00:00:00Z"))
    ).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("rejects reversed, impossible and unbounded custom ranges", () => {
    for (const params of [
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2026-09-14", to: "2026-09-01" },
      { from: "2020-01-01", to: "2026-09-14" },
    ])
      expect(resolveReportRange({ range: "custom", ...params }).error).toBeTruthy();
  });
  it("sums decimal cents and propagates unknown values", () => {
    expect(sumReportMoney(["0.10", "0.20"])).toBe("0.30");
    expect(sumReportMoney(["10", null])).toBeNull();
    expect(reportProfit("100", [null])).toBeNull();
    expect(reportMoney("100", "JPY")).toBe("JPY 100.00");
    expect(reportMoney(null)).toBe("待核算");
  });
  it("quotes commas, newlines and formulas safely while retaining negative money", () => {
    const csv = reportCsv([["=1+1", "含,逗号", '含"引号', "-123.45", null]]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"含,逗号"');
    expect(csv).toContain('"含""引号"');
    expect(csv).toContain('"-123.45"');
    expect(csv).toContain("待核算");
  });
});
