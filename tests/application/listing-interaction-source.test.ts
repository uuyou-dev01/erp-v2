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
});
