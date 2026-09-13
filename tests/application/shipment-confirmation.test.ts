import { describe, expect, it } from "vitest";
import { buildShipmentConfirmation } from "@/lib/application/shipment-confirmation";
import { parseShippingProof, shippingProofToJson } from "@/lib/application/shipping-proof";
const actor = { id: "owner-id", name: "货主" };
describe("shipment confirmation provenance", () => {
  it("records the authenticated actor for a self shipment", () => {
    expect(buildShipmentConfirmation({ mode: "SELF", actualShipper: "fake" }, actor)).toMatchObject(
      { actualShipper: "货主", confirmedById: "owner-id", basis: "SELF" }
    );
  });
  it("keeps a reported shipper separate from the recording actor through later proof updates", () => {
    const confirmation = buildShipmentConfirmation(
      { mode: "ON_BEHALF", actualShipper: "仓库 刘", basis: "WECHAT" },
      actor
    );
    expect(
      parseShippingProof(
        shippingProofToJson({ dispatchConfirmation: confirmation, proofNote: "QR" })
      ).dispatchConfirmation
    ).toMatchObject({
      actualShipper: "仓库 刘",
      confirmedByName: "货主",
      mode: "ON_BEHALF",
      basis: "WECHAT",
    });
  });
  it("requires both the real shipper and the source for delegated confirmation", () => {
    expect(() => buildShipmentConfirmation({ mode: "ON_BEHALF", basis: "WECHAT" }, actor)).toThrow(
      "实际发货人"
    );
    expect(() =>
      buildShipmentConfirmation({ mode: "ON_BEHALF", actualShipper: "刘" }, actor)
    ).toThrow("依据");
    expect(() =>
      buildShipmentConfirmation({ mode: "ON_BEHALF", actualShipper: "刘", basis: "OTHER" }, actor)
    ).toThrow("如何得知");
  });
});
