import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { normalizeLogisticsCostInput } from "@/lib/application/logistics-cost";

describe("logistics cost input", () => {
  it("uses the source store currency and normalizes the amount", () => {
    expect(normalizeLogisticsCostInput({ amount: " 12.34567 " }, "cny")).toEqual({
      amount: new Decimal("12.3457"),
      currency: "CNY",
    });
  });

  it("treats an empty optional amount as no cost", () => {
    expect(normalizeLogisticsCostInput({ amount: "" }, "CNY")).toBeNull();
  });

  it("rejects negative amounts and invalid currencies", () => {
    expect(() => normalizeLogisticsCostInput({ amount: "-1" }, "CNY")).toThrow("邮费必须");
    expect(() =>
      normalizeLogisticsCostInput({ amount: "1", currency: "RMB" }, "CNY")
    ).not.toThrow();
    expect(() =>
      normalizeLogisticsCostInput({ amount: "1", currency: "CN" }, "CNY")
    ).toThrow("3 位币种代码");
  });
});
