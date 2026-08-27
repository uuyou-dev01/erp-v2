import { describe, expect, it } from "vitest";
import {
  commandQuickActions,
  operationsNavigation,
  settingsNavigation,
  type NavItem,
} from "@/config/navigation";
import { canUseQuickEntry, isNavigationHrefAllowed } from "@/lib/auth/permissions";

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.submenu ? flatten(item.submenu) : [])]);
}

const operationNavigationItems = operationsNavigation.flatMap((group) => flatten(group.items));
const allNavigationItems = [...operationNavigationItems, ...flatten(settingsNavigation)];

describe("navigation structure", () => {
  it("groups routes around the current operating model", () => {
    expect(operationsNavigation.map((group) => group.title)).toEqual([
      "工作台",
      "采购与仓配",
      "商品与库存",
      "上架与订单",
      "货盘与代卖",
      "收益与报表",
    ]);
  });

  it("keeps dense product and inventory routes under sidebar submenus", () => {
    const productGroup = operationsNavigation.find((group) => group.title === "商品与库存");
    expect(productGroup?.items.map((item) => item.name)).toEqual(["商品档案", "库存管理"]);

    const catalogItem = productGroup?.items.find((item) => item.name === "商品档案");
    expect(catalogItem?.submenu?.map((item) => item.name)).toEqual([
      "商品主档",
      "商品情报",
      "情报采集箱",
    ]);

    const inventoryItem = productGroup?.items.find((item) => item.name === "库存管理");
    expect(inventoryItem?.submenu?.map((item) => item.name)).toEqual([
      "库存看板",
      "单件库存",
      "库存批次",
      "期初库存",
      "库存调整",
    ]);
  });

  it("keeps low-frequency setup entries out of daily operations", () => {
    const operationNames = operationNavigationItems.map((item) => item.name);
    expect(operationNames).not.toContain("销售平台");
    expect(operationNames).not.toContain("仓库位置");
    expect(operationNames).not.toContain("团队成员");
    expect(operationNames).not.toContain("店铺管理");
    expect(operationNames).not.toContain("费用子账");
    expect(operationNames).not.toContain("平台账单");
    expect(operationNames).not.toContain("结算单");

    expect(settingsNavigation.map((item) => item.name)).toEqual([
      "个人设置",
      "企业设置",
      "系统设置",
    ]);
  });

  it("preserves existing route URLs for compatibility", () => {
    const hrefs = allNavigationItems.map((item) => item.href);

    expect(hrefs).toContain("/workbench");
    expect(hrefs).toContain("/notifications");
    expect(hrefs).toContain("/procurement");
    expect(hrefs).toContain("/logistics/consolidations");
    expect(hrefs).toContain("/fulfillment/requests");
    expect(hrefs).toContain("/inventory/sellable");
    expect(hrefs).toContain("/inventory/skus");
    expect(hrefs).toContain("/product-intelligence");
    expect(hrefs).toContain("/inventory/items");
    expect(hrefs).toContain("/inventory/lots");
    expect(hrefs).toContain("/inventory/stocktake");
    expect(hrefs).toContain("/listing");
    expect(hrefs).toContain("/sales");
    expect(hrefs).toContain("/marketplace");
    expect(hrefs).toContain("/marketplace/my-offers");
    expect(hrefs).toContain("/resale");
    expect(hrefs).toContain("/finance/settlements");
    expect(hrefs).toContain("/reports");
    expect(hrefs).toContain("/reports/workload");
    expect(hrefs).toContain("/reports/team-performance");
    expect(hrefs).toContain("/settings/personal");
    expect(hrefs).toContain("/settings/company");
    expect(hrefs).toContain("/settings/system");
  });

  it("removes the old dashboard entry from sidebar and command shortcuts", () => {
    const navigationHrefs = allNavigationItems.map((item) => item.href);
    const commandHrefs = commandQuickActions.map((action) => action.href);

    expect(navigationHrefs).not.toContain("/dashboard");
    expect(commandHrefs).not.toContain("/dashboard");
  });

  it("limits warehouse operators to fulfillment-related navigation", () => {
    expect(isNavigationHrefAllowed("FULFILLMENT", "/fulfillment/requests")).toBe(true);
    expect(isNavigationHrefAllowed("FULFILLMENT", "/logistics/consolidations")).toBe(true);
    expect(isNavigationHrefAllowed("FULFILLMENT", "/inventory/items")).toBe(true);
    expect(isNavigationHrefAllowed("FULFILLMENT", "/procurement")).toBe(false);
    expect(isNavigationHrefAllowed("FULFILLMENT", "/marketplace/my-offers")).toBe(false);
    expect(isNavigationHrefAllowed("FULFILLMENT", "/reports/workload")).toBe(true);
    expect(isNavigationHrefAllowed("FULFILLMENT", "/reports/team-performance")).toBe(false);
    expect(canUseQuickEntry("FULFILLMENT")).toBe(false);
  });

  it("keeps procurement and warehouse roles inside their operational boundaries", () => {
    expect(isNavigationHrefAllowed("PROCUREMENT", "/procurement")).toBe(true);
    expect(isNavigationHrefAllowed("PROCUREMENT", "/inventory/items")).toBe(true);
    expect(isNavigationHrefAllowed("PROCUREMENT", "/finance/settlements")).toBe(false);
    expect(canUseQuickEntry("PROCUREMENT")).toBe(true);

    expect(isNavigationHrefAllowed("WAREHOUSE", "/inventory/lots")).toBe(true);
    expect(isNavigationHrefAllowed("WAREHOUSE", "/fulfillment/requests")).toBe(true);
    expect(isNavigationHrefAllowed("WAREHOUSE", "/procurement")).toBe(false);
    expect(isNavigationHrefAllowed("WAREHOUSE", "/settings/team")).toBe(false);
  });
});
