import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  authorize: vi.fn(),
  identity: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    inventoryLot: { findUnique: vi.fn() },
    stockLedger: { findMany: vi.fn(), create: vi.fn() },
    orderAllocation: { aggregate: vi.fn() },
    fulfillmentInventoryAllocation: { aggregate: vi.fn() },
    inventorySplit: { create: vi.fn() },
    inventorySplitLine: { create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn(mock.tx) },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/user-context", () => ({ requireUserContext: mock.authorize }));
vi.mock("@/lib/application/item-unit-identity", () => ({
  createItemUnitWithIdentity: mock.identity,
}));
import { convertLotToItemUnit } from "@/app/actions/inventory-lots";
const input = { lotId: "lot", storeId: "store", quantity: 2, conditionGrade: "GOOD" };
beforeEach(() => {
  vi.clearAllMocks();
  mock.authorize.mockResolvedValue({ activeStoreId: "store" });
  mock.tx.inventoryLot.findUnique.mockResolvedValue({
    skuId: "sku",
    storeId: "store",
    status: "ACTIVE",
    locationId: "jp",
    unitCost: "80",
    costCurrency: "CNY",
    costStatus: "PENDING",
  });
  mock.tx.stockLedger.findMany.mockResolvedValue([{ deltaQty: "5" }]);
  mock.tx.orderAllocation.aggregate.mockResolvedValue({ _sum: { quantity: "1" } });
  mock.tx.fulfillmentInventoryAllocation.aggregate.mockResolvedValue({ _sum: { quantity: "1" } });
  mock.tx.inventorySplit.create.mockResolvedValue({ id: "split" });
  mock.identity.mockImplementation(async (_tx, { data }) => ({
    id: `unit-${mock.identity.mock.calls.length}`,
    ...data,
  }));
});
describe("lot to individually tracked stock", () => {
  it("creates one identity and one unit ledger entry for every consumed piece", async () => {
    const result = await convertLotToItemUnit(input);
    expect(mock.authorize).toHaveBeenCalledWith({ storeId: "store" });
    expect(result.itemUnits).toHaveLength(2);
    expect(new Set(result.itemUnits.map((item) => item.id)).size).toBe(2);
    expect(
      result.itemUnits.every(
        (item) =>
          item.locationId === "jp" &&
          item.unitCost.toString() === "80" &&
          item.costStatus === "PENDING"
      )
    ).toBe(true);
    expect(
      mock.tx.inventorySplitLine.create.mock.calls.map(([call]) => call.data.quantity)
    ).toEqual(["1", "1"]);
    expect(mock.tx.stockLedger.create.mock.calls.map(([call]) => call.data.deltaQty)).toEqual([
      "1",
      "1",
      "-2.0000",
    ]);
  });
  it("rejects fractions and reservations before creating any split", async () => {
    await expect(convertLotToItemUnit({ ...input, quantity: 1.5 })).rejects.toThrow("正整数");
    await expect(convertLotToItemUnit({ ...input, quantity: 4 })).rejects.toThrow("可用数量不足");
    expect(mock.tx.inventorySplit.create).not.toHaveBeenCalled();
  });
  it("does not bypass tenant authorization", async () => {
    mock.authorize.mockRejectedValueOnce(new Error("没有访问权限"));
    await expect(convertLotToItemUnit(input)).rejects.toThrow("没有访问权限");
    expect(mock.tx.inventorySplit.create).not.toHaveBeenCalled();
  });
});
