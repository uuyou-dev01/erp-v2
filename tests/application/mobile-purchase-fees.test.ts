import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  lock: vi.fn(),
  remove: vi.fn(),
  context: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findUnique: mocks.find },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ purchaseOrder: { updateMany: mocks.lock }, fee: { deleteMany: mocks.remove } }),
  },
}));
vi.mock("@/lib/auth/user-context", () => ({ requireUserContext: mocks.context }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { allocatePurchaseOrderCostsAction } from "@/app/actions/purchase-orders";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ activeStoreId: "store" });
  mocks.find.mockResolvedValue({
    id: "order",
    storeId: "store",
    status: "ORDERED",
    currency: "JPY",
    createdAt: new Date(),
    lines: [{ id: "line", quantity: new Decimal(1), lineAmount: new Decimal(100) }],
  });
  mocks.lock.mockResolvedValue({ count: 0 });
});
describe("mobile purchase fee concurrency", () => {
  it("rejects a stale order without deleting existing fees", async () => {
    const result = await allocatePurchaseOrderCostsAction({
      purchaseOrderId: "order",
      expectedUpdatedAt: "2026-09-21T00:00:00Z",
      totalProductCost: "100",
      method: "MANUAL",
      manualLineAmounts: [{ purchaseLineId: "line", amount: "100" }],
      fees: [],
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("订单已被更新"),
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects invalid version timestamps without writing", async () => {
    const result = await allocatePurchaseOrderCostsAction({
      purchaseOrderId: "order",
      expectedUpdatedAt: "invalid",
      totalProductCost: "100",
      method: "BY_QUANTITY",
      fees: [],
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("订单版本无效"),
    });
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
