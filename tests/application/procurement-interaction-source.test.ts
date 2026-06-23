import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const procurementInteractionFiles = [
  "components/procurement/quick-receive-button.tsx",
];

describe("procurement interaction source hygiene", () => {
  it("does not use browser-native dialogs or console errors in high-frequency procurement actions", () => {
    for (const file of procurementInteractionFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toMatch(/\balert\(/);
      expect(source, file).not.toMatch(/\bconfirm\(/);
      expect(source, file).not.toMatch(/\bwindow\.confirm\(/);
      expect(source, file).not.toMatch(/\bconsole\.error\(/);
    }
  });

  it("uses a structured purchase-line delete action instead of a dead API form", () => {
    const detailPageSource = readFileSync(
      join(process.cwd(), "app/(dashboard)/procurement/[id]/page.tsx"),
      "utf8"
    );
    const actionSource = readFileSync(
      join(process.cwd(), "app/actions/purchase-orders.ts"),
      "utf8"
    );
    const buttonSource = readFileSync(
      join(process.cwd(), "components/procurement/delete-purchase-line-button.tsx"),
      "utf8"
    );

    expect(detailPageSource).not.toContain("/api/purchase-lines");
    expect(detailPageSource).toContain("<DeletePurchaseLineButton");

    expect(actionSource).toContain("export async function deletePurchaseLineAction");
    expect(actionSource).toContain("return actionSuccess");
    expect(actionSource).toContain("return toActionFailure");

    expect(buttonSource).toContain("deletePurchaseLineAction");
    expect(buttonSource).toContain("const [error");
    expect(buttonSource).toContain("ConfirmDialog");
  });
});
