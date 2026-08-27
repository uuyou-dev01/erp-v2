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

  it("keeps quick sale compact, uses guided choices, and explains warehouse notification", () => {
    const source = readFileSync(
      join(process.cwd(), "components/listing/quick-sell-button.tsx"),
      "utf8"
    );

    expect(source).toContain("成交与费用");
    expect(source).toContain("发货安排");
    expect(source).toContain("客户与平台订单");
    expect(source).toContain("手续费计算方式");
    expect(source).toContain("更多客户信息（选填）");
    expect(source).toContain("确认登记并创建发货任务");
    expect(source).toContain("并通知所选仓库中具备发货权限的账号");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('role="alert"');
  });

  it("groups listing platforms by market before offering platform filters", () => {
    const toolbarSource = readFileSync(
      join(process.cwd(), "components/listing/listing-ops-toolbar.tsx"),
      "utf8"
    );
    const pageSource = readFileSync(
      join(process.cwd(), "app/(dashboard)/listing/page.tsx"),
      "utf8"
    );

    expect(toolbarSource).toContain("全部地区");
    expect(toolbarSource).toContain("visiblePlatformGroups");
    expect(toolbarSource).toContain("inferMarketFromPlatform");
    expect(toolbarSource).toContain("筛选平台：");
    expect(pageSource).toContain("activeMarket");
    expect(pageSource).toContain("country: platform.country");
  });
});
