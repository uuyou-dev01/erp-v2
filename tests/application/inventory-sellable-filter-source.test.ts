import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("inventory sellable filter boundaries", () => {
  it("does not expose or apply sales-platform filters on the inventory board", () => {
    const page = source("app/(dashboard)/inventory/sellable/page.tsx");
    const toolbar = source("components/inventory/inventory-sellable-toolbar.tsx");

    expect(toolbar).not.toContain("ListingPlatformMark");
    expect(toolbar).not.toContain("activePlatformId");
    expect(toolbar).not.toContain("全部平台");
    expect(toolbar).not.toContain(">销售平台<");
    expect(page).not.toContain("function hasPlatform");
    expect(page).not.toContain("hasPlatform(product");
    expect(page).not.toContain("record.platformName");
    expect(page).not.toContain("record.platformCode");
  });

  it("drops legacy platformId parameters from links and toolbar interactions", () => {
    const page = source("app/(dashboard)/inventory/sellable/page.tsx");
    const toolbar = source("components/inventory/inventory-sellable-toolbar.tsx");

    expect(page).toContain('const LEGACY_SELLABLE_PARAMS = new Set(["platformId"])');
    expect(toolbar).toContain('params.delete("platformId")');
  });
});
