import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  find: vi.fn(),
  org: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/auth/user-context", () => ({ requireUserContext: mocks.context }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chargeEvent: { findFirst: mocks.find },
    organization: { findUniqueOrThrow: mocks.org },
  },
}));
vi.mock("@/app/actions/charges", () => ({ createChargeEventAction: mocks.create }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { saveMobileExpense } from "@/app/actions/mobile-expenses";
const input = {
  categoryId: "c1",
  amount: "15",
  currency: "JPY",
  description: "包材",
  payee: "店铺",
  key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ organizationId: "o1", userId: "u1", activeStoreId: "s1" });
  mocks.find.mockResolvedValue(null);
  mocks.org.mockResolvedValue({ name: "我方" });
  mocks.create.mockResolvedValue({ success: true, id: "e1" });
});
describe("mobile expense recording", () => {
  it("uses authenticated organization and records a draft rather than claiming payment", async () => {
    await saveMobileExpense(input);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "MOBILE_EXPENSE",
        submit: false,
        amount: "15",
        parties: expect.arrayContaining([
          expect.objectContaining({ organizationId: "o1", role: "PAYER" }),
        ]),
      })
    );
  });
  it("returns existing record on retry without creating a second expense", async () => {
    mocks.find.mockResolvedValue({ id: "old" });
    expect(await saveMobileExpense(input)).toMatchObject({ success: true, id: "old" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1", idempotencyKey: `mobile-expense:o1:u1:${input.key}` },
      })
    );
  });
  it("rejects incomplete records and unauthenticated requests", async () => {
    expect(await saveMobileExpense({ ...input, payee: " " })).toMatchObject({ success: false });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.context.mockRejectedValue(new Error("请先登录"));
    expect(await saveMobileExpense(input)).toMatchObject({ success: false });
  });
});
