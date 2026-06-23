import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inventoryInteractionFiles = [
  "components/inventory/sku-form.tsx",
  "components/inventory/stocktake-grid.tsx",
  "components/inventory/lot-split-form.tsx",
];

describe("inventory interaction source hygiene", () => {
  it("does not use browser-native dialogs or console errors in high-frequency inventory actions", () => {
    for (const file of inventoryInteractionFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toMatch(/\balert\(/);
      expect(source, file).not.toMatch(/\bconfirm\(/);
      expect(source, file).not.toMatch(/\bwindow\.confirm\(/);
      expect(source, file).not.toMatch(/\bconsole\.error\(/);
    }
  });

  it("uses structured action results for stocktake submissions", () => {
    const stocktakeActionSource = readFileSync(
      join(process.cwd(), "app/actions/stocktake.ts"),
      "utf8"
    );
    const stocktakeGridSource = readFileSync(
      join(process.cwd(), "components/inventory/stocktake-grid.tsx"),
      "utf8"
    );

    expect(stocktakeActionSource).toMatch(/export async function submitSkuLocationStocktakeAdjustmentsAction/);
    expect(stocktakeGridSource).toMatch(/submitSkuLocationStocktakeAdjustmentsAction/);
    expect(stocktakeGridSource).not.toMatch(/submitSkuLocationStocktakeAdjustments,\n/);
    expect(stocktakeGridSource).not.toMatch(/new Decimal\(draft\./);
  });

  it("uses structured action results for lot split submissions", () => {
    const actionSource = readFileSync(
      join(process.cwd(), "app/actions/inventory-lots.ts"),
      "utf8"
    );
    const splitFormSource = readFileSync(
      join(process.cwd(), "components/inventory/lot-split-form.tsx"),
      "utf8"
    );

    expect(actionSource).toMatch(/export async function convertLotToItemUnitAction/);
    expect(actionSource).toContain("return actionSuccess");
    expect(actionSource).toContain("return toActionFailure");

    expect(splitFormSource).toMatch(/convertLotToItemUnitAction/);
    expect(splitFormSource).not.toMatch(/await convertLotToItemUnit\(/);
    expect(splitFormSource).toContain('role="alert"');
  });
});
