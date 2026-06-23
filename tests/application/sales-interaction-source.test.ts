import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const salesInteractionFiles = [
  "components/sales/confirm-order-button.tsx",
  "components/sales/settle-order-dialog.tsx",
];

describe("sales interaction source hygiene", () => {
  it("does not use browser-native dialogs or console errors in high-frequency sales actions", () => {
    for (const file of salesInteractionFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toMatch(/\balert\(/);
      expect(source, file).not.toMatch(/\bconfirm\(/);
      expect(source, file).not.toMatch(/\bwindow\.confirm\(/);
      expect(source, file).not.toMatch(/\bconsole\.error\(/);
    }
  });

  it("keeps sales detail rendering read-only instead of writing computed profit into net revenue", () => {
    const source = readFileSync(
      join(process.cwd(), "app/(dashboard)/sales/[id]/page.tsx"),
      "utf8"
    );

    expect(source).not.toContain("updateOrderNetRevenue");
    expect(source).not.toMatch(/await\s+\w*updateOrderNetRevenue/);
    expect(source).toContain("profitSummary.netRevenue");
    expect(source).toContain("profitSummary.grossProfit");
  });

  it("lets sales detail settlement submit the actual sale price", () => {
    const dialogSource = readFileSync(
      join(process.cwd(), "components/sales/settle-order-dialog.tsx"),
      "utf8"
    );
    const pageSource = readFileSync(
      join(process.cwd(), "app/(dashboard)/sales/[id]/page.tsx"),
      "utf8"
    );

    expect(dialogSource).toContain("defaultSalePrice");
    expect(dialogSource).toContain("actualSalePrice");
    expect(dialogSource).toMatch(/actualSalePrice:\s*form\.actualSalePrice \|\| undefined/);
    expect(pageSource).toContain("defaultSalePrice={order.totalPaid.toString()}");
  });
});
