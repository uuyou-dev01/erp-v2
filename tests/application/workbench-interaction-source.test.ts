import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workbenchInteractionFiles = [
  "components/workbench/action-drawer-forms/index.tsx",
  "components/workbench/bulk-action-toolbar.tsx",
  "components/workbench/next-action-workbench.tsx",
  "components/workbench/pending-action-panel.tsx",
  "components/workbench/quick-entry-workbench.tsx",
  "components/workbench/task-assignment-card.tsx",
];

describe("workbench interaction source hygiene", () => {
  it("does not use browser-native dialogs or console errors in high-frequency workbench actions", () => {
    for (const file of workbenchInteractionFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toMatch(/\balert\(/);
      expect(source, file).not.toMatch(/\bconfirm\(/);
      expect(source, file).not.toMatch(/\bconsole\.error\(/);
    }
  });

  it("keeps shared confirmation dialog buttons from submitting parent forms", () => {
    const source = readFileSync(
      join(process.cwd(), "components/shared/confirm-dialog.tsx"),
      "utf8",
    );

    expect(source).toMatch(/<Button[^>]*type="button"[^>]*onClick=\{onCancel\}/s);
    expect(source).toMatch(/<Button[^>]*type="button"[^>]*className=\{confirmClassName\}/s);
  });

  it("refreshes quick-entry updates through the router instead of a hard page reload", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/quick-entry-workbench.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/window\.location\.reload\(/);
    expect(source).toContain("useRouter");
    expect(source).toContain("router.refresh()");
  });

  it("shows structured drawer action failures before refreshing or closing the panel", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/pending-action-panel.tsx"),
      "utf8",
    );

    const runBody = source.slice(source.indexOf("const run = ("));
    expect(source).toContain("isActionFailure");
    expect(runBody).toMatch(/if \(isActionFailure\(result\)\) \{/);
    expect(runBody.indexOf("if (isActionFailure(result))")).toBeLessThan(
      runBody.indexOf("refresh();"),
    );
  });

  it("keeps workbench settlement fields aligned with values that are persisted", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/action-drawer-forms/index.tsx"),
      "utf8",
    );
    const settleForm = source.slice(
      source.indexOf("export function SettleOrderForm"),
      source.indexOf("export function ConfirmOrderButton"),
    );

    expect(settleForm).toContain("actualSalePrice");
    expect(settleForm).toContain("platformFee");
    expect(settleForm).toContain("shippingFee");
    expect(settleForm).not.toContain("actualReceived");
    expect(settleForm).not.toContain("fxRate");
  });
});
