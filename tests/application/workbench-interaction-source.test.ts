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
      "utf8"
    );

    expect(source).toMatch(/<Button[^>]*type="button"[^>]*onClick=\{onCancel\}/s);
    expect(source).toMatch(/<Button[^>]*type="button"[^>]*className=\{confirmClassName\}/s);
  });

  it("refreshes quick-entry updates through the router instead of a hard page reload", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/quick-entry-workbench.tsx"),
      "utf8"
    );

    expect(source).not.toMatch(/window\.location\.reload\(/);
    expect(source).toContain("useRouter");
    expect(source).toContain("router.refresh()");
  });

  it("supports tri-state selection for every task in the current filtered queue", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/next-action-workbench.tsx"),
      "utf8"
    );

    expect(source).toContain("selectedVisibleCount");
    expect(source).toContain("partlyVisibleChecked");
    expect(source).toContain("node.indeterminate = partlyVisibleChecked");
    expect(source).toContain("选择当前筛选结果内全部任务");
    expect(source).toContain("filteredItems.map((item) => item.id)");
  });

  it("removes successfully saved quick-entry rows so they cannot be submitted twice", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/quick-entry-workbench.tsx"),
      "utf8"
    );

    expect(source).toContain('row.result !== "success"');
    expect(source).toContain("if (item.success) return [];");
    expect(source).toContain("removeRow(row.localId)");
    expect(source).toContain("setSaveSummary({ success: result.success, failed: result.failed })");
    expect(source).toContain('title={saveSummary?.failed ? "部分保存成功" : "保存成功"}');
  });

  it("keeps business dates editable and visually separates them from the audit timestamp", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/quick-entry-workbench.tsx"),
      "utf8"
    );

    expect(source).toContain('type="date"');
    expect(source).toContain("采购日期");
    expect(source).toContain("售出日期");
    expect(source).toContain("localDateInputValue()");
    expect(source).toContain("录入于");
    expect(source).toContain("node.indeterminate = partlySelected");
    expect(source).toContain('className="h-8 text-xs"');
  });

  it("limits variant suggestions to the selected catalog series", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/quick-entry-workbench.tsx"),
      "utf8"
    );
    const variantSuggestionBody = source.slice(
      source.indexOf("const variantSuggestionsFor"),
      source.indexOf("const catalogOutcomeFor")
    );

    expect(variantSuggestionBody).toContain("if (!product) return []");
    expect(variantSuggestionBody).toContain("variant.parentSkuId === product.id");
    expect(variantSuggestionBody).not.toContain("...suggestions.variant");
  });

  it("shows structured drawer action failures before refreshing or closing the panel", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/pending-action-panel.tsx"),
      "utf8"
    );

    const runBody = source.slice(source.indexOf("const run = ("));
    expect(source).toContain("isActionFailure");
    expect(runBody).toMatch(/if \(isActionFailure\(result\)\) \{/);
    expect(runBody.indexOf("if (isActionFailure(result))")).toBeLessThan(
      runBody.indexOf("refresh();")
    );
  });

  it("keeps workbench settlement fields aligned with values that are persisted", () => {
    const source = readFileSync(
      join(process.cwd(), "components/workbench/action-drawer-forms/index.tsx"),
      "utf8"
    );
    const settleForm = source.slice(
      source.indexOf("export function SettleOrderForm"),
      source.indexOf("export function ConfirmOrderButton")
    );

    expect(settleForm).toContain("actualSalePrice");
    expect(settleForm).toContain("platformFee");
    expect(settleForm).toContain("shippingFee");
    expect(settleForm).not.toContain("actualReceived");
    expect(settleForm).toContain("fxRate");
    expect(settleForm).toContain("settlementBaseCurrency");
  });

  it("persists purchase and transfer postage from workbench forms", () => {
    const forms = readFileSync(
      join(process.cwd(), "components/workbench/action-drawer-forms/index.tsx"),
      "utf8"
    );
    const actions = readFileSync(join(process.cwd(), "app/actions/workflow-actions.ts"), "utf8");

    expect(forms).toContain('id="purchase-shipping-cost"');
    expect(forms).toContain("transferForm.shippingCost");
    expect(actions).toContain("saveLogisticsShippingCost");
    expect(actions).toContain("LOGISTICS_COST_SOURCE_TYPES.purchase");
  });
});
