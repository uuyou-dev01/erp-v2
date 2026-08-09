import { describe, expect, it } from "vitest";
import {
  itemConditionReadyForSale,
  normalizeItemConditionType,
  normalizeItemFunctionStatus,
  normalizeUsedItemGrade,
  validateItemCondition,
} from "@/lib/inventory/item-condition";

describe("item condition standard", () => {
  it("keeps new goods outside the used grading system", () => {
    expect(normalizeItemConditionType("全新")).toBe("NEW");
    expect(normalizeUsedItemGrade("全新")).toBeNull();
    expect(normalizeItemFunctionStatus(undefined, "NEW")).toBe("NORMAL");
  });

  it("maps legacy used labels into S/A/B/C/D or unassessed", () => {
    expect(normalizeUsedItemGrade("LIKE_NEW")).toBe("S");
    expect(normalizeUsedItemGrade("GOOD")).toBe("B");
    expect(normalizeUsedItemGrade("POOR")).toBe("D");
    expect(normalizeUsedItemGrade("中古")).toBe("UNASSESSED");
  });

  it("requires a function status and issue notes for risky units", () => {
    expect(
      validateItemCondition({
        conditionType: "USED",
        conditionGrade: "A",
        functionStatus: undefined,
      })
    ).toContain("功能状态");
    expect(
      validateItemCondition({
        conditionType: "USED",
        conditionGrade: "D",
        functionStatus: "ISSUE",
      })
    ).toContain("异常说明");
  });

  it("keeps unassessed, untested, or undocumented risky units out of sale", () => {
    expect(
      itemConditionReadyForSale({
        conditionType: "USED",
        conditionGrade: "UNASSESSED",
        functionStatus: "UNTESTED",
      })
    ).toBe(false);
    expect(
      itemConditionReadyForSale({
        conditionType: "USED",
        conditionGrade: "D",
        functionStatus: "ISSUE",
        notes: "功能异常，按配件出售",
        photoCount: 0,
      })
    ).toBe(false);
    expect(
      itemConditionReadyForSale({
        conditionType: "USED",
        conditionGrade: "D",
        functionStatus: "ISSUE",
        notes: "功能异常，按配件出售",
        photoCount: 2,
      })
    ).toBe(true);
  });
});
