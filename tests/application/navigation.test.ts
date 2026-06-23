import { describe, expect, it } from "vitest";
import {
  commandQuickActions,
  operationsNavigation,
  settingsNavigation,
  type NavItem,
} from "@/config/navigation";

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.submenu ? flatten(item.submenu) : [])]);
}

const operationNavigationItems = operationsNavigation.flatMap((group) => flatten(group.items));
const allNavigationItems = [...operationNavigationItems, ...settingsNavigation];

describe("navigation structure", () => {
  it("groups routes around the current operating model", () => {
    expect(operationsNavigation.map((group) => group.title)).toEqual([
      "工作台",
      "采购与补货",
      "集运与仓配",
      "库存与商品",
      "上架与订单",
      "经营分析",
    ]);
  });

  it("keeps low-frequency setup entries out of daily operations", () => {
    const operationNames = operationNavigationItems.map((item) => item.name);
    expect(operationNames).not.toContain("销售平台");
    expect(operationNames).not.toContain("仓库位置");
    expect(operationNames).not.toContain("团队成员");
    expect(operationNames).not.toContain("店铺管理");

    expect(settingsNavigation.map((item) => item.name)).toEqual([
      "销售平台",
      "仓库位置",
      "团队成员",
      "店铺管理",
      "切换操作人",
    ]);
  });

  it("preserves existing route URLs for compatibility", () => {
    const hrefs = allNavigationItems.map((item) => item.href);

    expect(hrefs).toContain("/workbench");
    expect(hrefs).toContain("/notifications");
    expect(hrefs).toContain("/procurement");
    expect(hrefs).toContain("/logistics/consolidations");
    expect(hrefs).toContain("/inventory/sellable");
    expect(hrefs).toContain("/inventory/skus");
    expect(hrefs).toContain("/inventory/items");
    expect(hrefs).toContain("/inventory/lots");
    expect(hrefs).toContain("/inventory/stocktake");
    expect(hrefs).toContain("/listing");
    expect(hrefs).toContain("/sales");
    expect(hrefs).toContain("/reports");
    expect(hrefs).toContain("/reports/team");
    expect(hrefs).toContain("/listing/platforms");
    expect(hrefs).toContain("/inventory/locations");
    expect(hrefs).toContain("/settings/team");
    expect(hrefs).toContain("/settings/stores");
  });

  it("removes the old dashboard entry from sidebar and command shortcuts", () => {
    const navigationHrefs = allNavigationItems.map((item) => item.href);
    const commandHrefs = commandQuickActions.map((action) => action.href);

    expect(navigationHrefs).not.toContain("/dashboard");
    expect(commandHrefs).not.toContain("/dashboard");
  });
});
