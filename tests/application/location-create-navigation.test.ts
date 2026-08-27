import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  locationReturnPathWithCreatedId,
  safeLocationReturnPath,
} from "@/lib/application/location-create-navigation";

describe("location creation return navigation", () => {
  it("accepts only internal paths beginning with one forward slash", () => {
    expect(safeLocationReturnPath("/inventory/opening-stock/new?skuIds=sku-1#lines")).toBe(
      "/inventory/opening-stock/new?skuIds=sku-1#lines"
    );
    expect(safeLocationReturnPath("//evil.example/path")).toBeNull();
    expect(safeLocationReturnPath("/\\evil.example/path")).toBeNull();
    expect(safeLocationReturnPath("https://evil.example/path")).toBeNull();
    expect(safeLocationReturnPath("inventory/opening-stock/new")).toBeNull();
  });

  it("adds the created location id without losing query parameters or hashes", () => {
    expect(
      locationReturnPathWithCreatedId(
        "/inventory/opening-stock/new?skuIds=sku-1#lines",
        "location/new 1"
      )
    ).toBe("/inventory/opening-stock/new?skuIds=sku-1&createdLocationId=location%2Fnew+1#lines");
  });

  it("wires the opening-stock prerequisite CTA through the auto-open dialog", () => {
    const locationsPage = readFileSync(
      join(process.cwd(), "app/(dashboard)/inventory/locations/page.tsx"),
      "utf8"
    );
    const openingStockForm = readFileSync(
      join(process.cwd(), "components/inventory/opening-stock-form.tsx"),
      "utf8"
    );
    const dialog = readFileSync(
      join(process.cwd(), "components/inventory/location-create-dialog.tsx"),
      "utf8"
    );

    expect(locationsPage).toContain('defaultOpen={params.create === "1"}');
    expect(openingStockForm).toContain('create: "1"');
    expect(openingStockForm).toContain("returnTo,");
    expect(dialog.match(/aria-label="关闭新增仓库位置弹窗"/g)).toHaveLength(2);
  });
});
