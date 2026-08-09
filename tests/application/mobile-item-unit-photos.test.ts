import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  itemUnitPhotoUrls,
  MAX_ITEM_UNIT_PHOTOS,
  mergeItemUnitPhotoUrls,
} from "@/lib/mobile/item-unit-photos";

describe("mobile item-unit photos", () => {
  it("normalizes and de-duplicates stored photo URLs", () => {
    expect(itemUnitPhotoUrls([" /a.jpg ", "/a.jpg", null, "", "/b.jpg"])).toEqual([
      "/a.jpg",
      "/b.jpg",
    ]);
  });

  it("appends mobile uploads without duplicating existing photos", () => {
    expect(mergeItemUnitPhotoUrls(["/a.jpg"], ["/a.jpg", "/b.jpg"])).toEqual(["/a.jpg", "/b.jpg"]);
  });

  it("enforces the item photo limit", () => {
    const current = Array.from({ length: MAX_ITEM_UNIT_PHOTOS }, (_, index) => `/${index}.jpg`);
    expect(() => mergeItemUnitPhotoUrls(current, ["/extra.jpg"])).toThrow(
      `每个单件最多保留 ${MAX_ITEM_UNIT_PHOTOS} 张照片`
    );
  });

  it("binds only ready, unused assets owned by the current mobile user", () => {
    const source = readFileSync(join(process.cwd(), "lib/mobile/item-unit-photos.ts"), "utf8");
    expect(source).toContain('status: "READY"');
    expect(source).toContain("userId: input.context.userId");
    expect(source).toContain("captureId: null");
    expect(source).toContain("OR: [{ itemUnitId: null }, { itemUnitId: input.itemUnitId }]");
  });
});
