import { describe, expect, it } from "vitest";
import { mergeShippingDraft, type ShippingDraft } from "@/lib/application/shipping-draft-sync";

const base: ShippingDraft = {
  trackingNo: "",
  shipper: "",
  shippingMethod: "",
  pickupCode: "",
  proofNote: "",
  imageUrls: ["old"],
};

describe("shipping preparation background sync", () => {
  it("shows another user's uploaded images and updated preparation fields", () => {
    const remote = { ...base, pickupCode: "1234", proofNote: "取件码", imageUrls: ["old", "new"] };
    expect(mergeShippingDraft(base, base, remote)).toEqual(remote);
  });

  it("preserves an in-progress tracking number and note while showing new images", () => {
    const draft = { ...base, trackingNo: "JP123", proofNote: "正在填写" };
    const remote = { ...base, proofNote: "对方备注", imageUrls: ["old", "new"] };
    expect(mergeShippingDraft(draft, base, remote)).toEqual({
      ...draft,
      imageUrls: ["old", "new"],
    });
  });

  it("removes remotely deleted images and retains new local uploads without duplicates", () => {
    const draft = { ...base, imageUrls: ["old", "local", "shared"] };
    const remote = { ...base, imageUrls: ["remote", "shared"] };
    expect(mergeShippingDraft(draft, base, remote).imageUrls).toEqual([
      "remote",
      "shared",
      "local",
    ]);
  });

  it("keeps local edits across successive refreshes", () => {
    const draft = { ...base, proofNote: "本地" };
    const first = { ...base, proofNote: "远端一" };
    const second = { ...base, proofNote: "远端二", pickupCode: "5678" };
    expect(mergeShippingDraft(mergeShippingDraft(draft, base, first), first, second)).toEqual({
      ...draft,
      pickupCode: "5678",
    });
  });
});
