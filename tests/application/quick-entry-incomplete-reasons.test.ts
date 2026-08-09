import { describe, expect, it } from "vitest";
import {
  formatIncompleteReasons,
  formatQuickEntryExceptionMessage,
  parseIncompleteReasons,
  shouldCreateQuickEntryInventory,
  detectIncompleteFields,
} from "@/lib/quick-entry-utils";
import { submitFillLogistics } from "@/app/actions/workflow-actions";

describe("quick entry incomplete reasons", () => {
  it("turns stored reason codes into user-facing Chinese labels", () => {
    const reasons = parseIncompleteReasons(
      "待补全: missing_purchase_price, missing_location"
    );

    expect(reasons).toEqual(["missing_purchase_price", "missing_location"]);
    expect(formatIncompleteReasons(reasons)).toEqual(["购入单价", "仓库位置"]);
    expect(
      formatQuickEntryExceptionMessage(
        "待补全: missing_purchase_price, missing_location"
      )
    ).toBe("还需填写：购入单价、仓库位置");
  });

  it("keeps an unknown processing failure intact for diagnosis", () => {
    expect(formatQuickEntryExceptionMessage("采购单生成失败")).toBe(
      "采购单生成失败"
    );
  });

  it("does not treat a destination as proof that the purchase has arrived", () => {
    expect(
      shouldCreateQuickEntryInventory({
        currentLocationText: "上海A仓",
        inspectionResult: null,
      })
    ).toBe(false);
    expect(
      shouldCreateQuickEntryInventory({
        currentLocationText: "上海A仓",
        inspectionResult: "PASSED",
      })
    ).toBe(true);
  });

  it("only requires a location after arrival has explicitly passed inspection", () => {
    expect(
      detectIncompleteFields({
        purchasePrice: null,
        currentLocationText: null,
        inspectionResult: null,
      })
    ).toEqual(["missing_purchase_price"]);
    expect(
      detectIncompleteFields({
        purchasePrice: null,
        currentLocationText: null,
        inspectionResult: "PASSED",
      })
    ).toEqual(["missing_purchase_price", "missing_location"]);
  });

  it("does not let a purchase skip logistics details", async () => {
    await expect(
      submitFillLogistics("purchaseOrder", "unused-order-id", {
        destinationLocationId: "unused-location-id",
        purchaseTrackingNo: "",
      })
    ).rejects.toThrow("请填写采购物流单号");
  });
});
