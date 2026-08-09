import { describe, expect, it } from "vitest";
import { deriveItemUnitOperationalState } from "@/lib/application/item-unit-operational-state";

describe("item unit operational state", () => {
  it("does not label an untested purchase item as a customer return", () => {
    const state = deriveItemUnitOperationalState({
      status: "RETURN_CHECK",
      sourceType: "PURCHASE",
      conditionType: "USED",
      conditionGrade: "A",
      functionStatus: "UNTESTED",
      locationName: "上海家庭仓",
      locationSellable: true,
      photoCount: 0,
    });

    expect(state.statusLabel).toBe("待功能检查");
    expect(state.workflowReason).toBe("FUNCTION_TEST");
    expect(state.physicalLabel).toBe("在上海家庭仓");
    expect(state.availabilityLabel).toBe("暂停销售");
  });

  it("uses customer return wording only when an after-sales receipt exists", () => {
    const state = deriveItemUnitOperationalState({
      status: "RETURN_CHECK",
      sourceType: "PURCHASE",
      conditionType: "USED",
      conditionGrade: "A",
      functionStatus: "NORMAL",
      hasAfterSalesReceipt: true,
      locationName: "日本家庭仓",
    });

    expect(state.statusLabel).toBe("售后退货待检");
    expect(state.workflowReason).toBe("CUSTOMER_RETURN_QC");
  });

  it("keeps physical, availability, and quality states independent", () => {
    const state = deriveItemUnitOperationalState({
      status: "AVAILABLE",
      conditionType: "USED",
      conditionGrade: "B",
      functionStatus: "NORMAL",
      locationName: "上海集运仓",
      locationSellable: false,
    });

    expect(state.physicalState).toBe("ON_HAND");
    expect(state.physicalLabel).toBe("在上海集运仓");
    expect(state.availabilityState).toBe("HOLD");
    expect(state.statusLabel).toBe("在库不可售");
  });

  it("surfaces failed inspection as an exception instead of a generic recheck", () => {
    const state = deriveItemUnitOperationalState({
      status: "RETURN_CHECK",
      conditionType: "USED",
      conditionGrade: "B",
      functionStatus: "NORMAL",
      latestInspectionResult: "FAILED",
      latestInspectionFailureReason: "拉链损坏",
    });

    expect(state.statusLabel).toBe("检查不通过");
    expect(state.workflowReason).toBe("INSPECTION_FAILED");
    expect(state.explanation).toBe("拉链损坏");
  });
});
