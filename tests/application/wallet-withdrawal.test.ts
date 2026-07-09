import { describe, expect, it } from "vitest";
import { buildWithdrawalHoldPlan } from "@/lib/application/wallet-withdrawal";

describe("wallet withdrawal planning", () => {
  it("creates a hold ledger plan when available balance covers the withdrawal", () => {
    const plan = buildWithdrawalHoldPlan({
      availableBalance: "500",
      amount: "120.50",
      currency: "CNY",
      requestedById: "user_1",
      paymentMethod: "ALIPAY",
      paymentAccount: "user@example.com",
      accountName: "张三",
    });

    expect(plan.amount).toBe("120.5");
    expect(plan.withdrawalData).toEqual(
      expect.objectContaining({
        amount: "120.5",
        currency: "CNY",
        status: "REQUESTED",
        requestedById: "user_1",
        paymentMethod: "ALIPAY",
      }),
    );
    expect(plan.holdLedgerData).toEqual(
      expect.objectContaining({
        entryType: "HOLD",
        amount: "120.5",
        currency: "CNY",
        status: "POSTED",
        sourceType: "WITHDRAWAL_REQUEST",
      }),
    );
  });

  it("rejects withdrawals that exceed available balance", () => {
    expect(() =>
      buildWithdrawalHoldPlan({
        availableBalance: "30",
        amount: "50",
        currency: "CNY",
        requestedById: "user_1",
      }),
    ).toThrow("可提现余额不足");
  });

  it("rejects zero, negative and invalid withdrawal amounts", () => {
    expect(() =>
      buildWithdrawalHoldPlan({
        availableBalance: "30",
        amount: "0",
        currency: "CNY",
        requestedById: "user_1",
      }),
    ).toThrow("提现金额必须大于 0");

    expect(() =>
      buildWithdrawalHoldPlan({
        availableBalance: "30",
        amount: "not-a-number",
        currency: "CNY",
        requestedById: "user_1",
      }),
    ).toThrow("提现金额必须是有效数字");
  });
});
