import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SKU sales lifecycle chart labels", () => {
  it("separates real sales from listing activity and handles empty sales", () => {
    const source = readFileSync(
      join(process.cwd(), "components/inventory/sku-sales-lifecycle-chart.tsx"),
      "utf8"
    );

    expect(source).toContain("销售动销");
    expect(source).toContain("上架活动");
    expect(source).toContain("暂无销售记录");
    expect(source).toContain("不代表商品售出");
    expect(source).toContain('dataKey === "listedCount"');
    expect(source).toContain('return [`${formatNumber(value)} 条`, "新增上架"]');
  });
});
