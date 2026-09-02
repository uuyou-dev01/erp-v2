import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(join(process.cwd(), "components/layout/sidebar.tsx"), "utf8");

describe("sidebar navigation source", () => {
  it("keeps static inventory routes before appended sellable market views", () => {
    const dynamicInventoryBranch = sidebarSource.slice(
      sidebarSource.indexOf('const dynamicSubmenu = item.href === "/inventory/sellable"'),
      sidebarSource.indexOf("if (item.submenu && !collapsed)")
    );

    expect(dynamicInventoryBranch).toContain("item.submenu?.map");
    expect(dynamicInventoryBranch).toContain("marketViews.map");
    expect(dynamicInventoryBranch).toContain("可售市场视图");
    expect(dynamicInventoryBranch.indexOf("item.submenu?.map")).toBeLessThan(
      dynamicInventoryBranch.indexOf("marketViews.map")
    );
    expect(dynamicInventoryBranch).toContain(
      "dynamicSubmenu.filter((sub) => sub.href !== item.href)"
    );
  });

  it("opens the real inventory parent by default", () => {
    expect(sidebarSource).toContain('useState<string[]>(["库存看板"])');
  });

  it("makes submenu parents navigable independently from their disclosure buttons", () => {
    expect(sidebarSource.match(/href=\{item\.href\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sidebarSource).toContain('aria-label={`${isExpanded ? "收起" : "展开"}${item.name}`}');
    expect(sidebarSource).toContain("aria-expanded={isExpanded}");
  });

  it("keeps settings out of the scrollable operations list and guarantees vertical scrolling", () => {
    expect(sidebarSource).not.toContain("visibleSettingsNavigation");
    expect(sidebarSource).toContain("min-h-0 flex-1 space-y-4 overflow-y-auto");
  });

  it("labels sidebar collapse and mobile close controls", () => {
    expect(sidebarSource).toContain('aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}');
    expect(sidebarSource).toContain('aria-label="关闭侧边栏"');
  });
});
