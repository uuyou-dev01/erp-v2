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

  it("keeps the sales list action-first and exposes resale operations", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "app/(dashboard)/sales/page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("订单工作视图");
    expect(pageSource).toContain("待我处理");
    expect(pageSource).toContain("协作中");
    expect(pageSource).toContain("我方代卖");
    expect(pageSource).toContain("下一步");
    expect(pageSource).not.toContain("地区订单结构");
    expect(pageSource).not.toContain("平台订单结构");
    expect(pageSource).not.toContain("订单状态说明");
  });
});
