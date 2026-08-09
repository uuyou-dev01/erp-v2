import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const listingInteractionFiles = [
  "components/listing/listing-ops-card.tsx",
  "components/listing/listing-record-compact-row.tsx",
  "components/listing/quick-sell-button.tsx",
];

describe("listing interaction source hygiene", () => {
  it("does not use browser-native dialogs or console errors in listing actions", () => {
    for (const file of listingInteractionFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toMatch(/\balert\(/);
      expect(source, file).not.toMatch(/\bconfirm\(/);
      expect(source, file).not.toMatch(/\bconsole\.error\(/);
    }
  });

  it("links sellable item rows to the individual item detail and preserves the board return path", () => {
    const itemListSource = readFileSync(
      join(process.cwd(), "components/listing/sellable-item-units-list.tsx"),
      "utf8"
    );
    const coverageCardSource = readFileSync(
      join(process.cwd(), "components/listing/listing-coverage-card.tsx"),
      "utf8"
    );

    expect(itemListSource).toContain("`/inventory/items/${unit.id}${");
    expect(itemListSource).toContain("encodeURIComponent(returnTo)");
    expect(itemListSource).toContain("查看单件详情");
    expect(coverageCardSource).toContain("returnTo={currentHref}");
  });
});
