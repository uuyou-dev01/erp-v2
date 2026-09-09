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
      "今日工作",
      "商品与采购",
      "库存与仓配",
      "销售与履约",
      "货盘协作",
      "财务与分析",
    ]);
  });

  it("groups product, inventory, and fulfillment entries by business workflow", () => {
    const productGroup = operationsNavigation.find((group) => group.title === "商品与采购");
    expect(productGroup?.items.map((item) => item.name)).toEqual(["商品资料", "采购订单"]);

    const inventoryGroup = operationsNavigation.find((group) => group.title === "库存与仓配");
    expect(inventoryGroup?.items.map((item) => item.name)).toEqual([
      "库存看板",
      "库存明细",
      "期初库存",
      "盘点调整",
      "转运包裹",
      "集运批次",
      "仓库与位置",
    ]);

    const fulfillmentGroup = operationsNavigation.find((group) => group.title === "销售与履约");
    expect(fulfillmentGroup?.items.map((item) => item.name)).toEqual([
      "上架运营",
      "销售订单",
      "售后处理",
      "代发履约",
    ]);
  });

  it("keeps administrative setup out of daily operations while exposing warehouse locations", () => {
    const operationNames = operationNavigationItems.map((item) => item.name);
    expect(operationNames).not.toContain("销售平台");
    expect(operationNames).toContain("仓库与位置");
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
    const hrefs = allNavigationItems.flatMap((item) => [item.href, ...(item.matches ?? [])]);

    expect(hrefs).toContain("/workbench");
    expect(hrefs).toContain("/notifications");
    expect(hrefs).toContain("/procurement");
    expect(hrefs).toContain("/logistics/consolidations");
    expect(hrefs).toContain("/fulfillment/requests");
    expect(hrefs).toContain("/inventory/sellable");
    expect(hrefs).toContain("/inventory/skus");
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

  it("keeps market collection outside the core sidebar", () => {
    const navigationHrefs = allNavigationItems.map((item) => item.href);
    const marketCaptureAction = commandQuickActions.find(
      (action) => action.id === "qa-market-captures"
    );

    expect(navigationHrefs).not.toContain("/product-intelligence");
    expect(navigationHrefs).not.toContain("/product-intelligence/captures");
    expect(marketCaptureAction).toMatchObject({
      title: "待整理采集",
      href: "/product-intelligence/captures",
    });
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
