import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("warehouse opening stock workflow", () => {
  it("sends a newly created warehouse to its guided inventory setup", () => {
    const form = source("components/inventory/location-form.tsx");

    expect(form).toContain("/inventory/locations/${locationId}?created=1");
  });

  it("keeps opening and existing-stock count actions on warehouse details", () => {
    const page = source("app/(dashboard)/inventory/locations/[id]/page.tsx");

    expect(page).toContain("录入已有库存");
    expect(page).toContain("盘点现有库存");
    expect(page).toContain("locationId: location.id");
  });

  it("records opening quantities, costs and distinct batch labels", () => {
    const form = source("components/inventory/opening-stock-form.tsx");
    const action = source("app/actions/opening-stock.ts");

    expect(form).toContain("单位成本");
    expect(form).toContain("批次号");
    expect(form).toContain("fixedLocationId");
    expect(action).toContain("batchLabel");
    expect(action).toContain('ledgerReason: "OPENING_BALANCE"');
    expect(action).toContain("String(index + 1).padStart(2");
  });
});
