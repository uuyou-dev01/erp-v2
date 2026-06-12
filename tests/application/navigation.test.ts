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
      "运营中心",
      "业务单据",
      "库存与商品",
      "上架与平台",
      "报表",
    ]);
  });

  it("exposes collaboration and configuration entry points", () => {
    const hrefs = allNavigationItems.map((item) => item.href);

    expect(hrefs).toContain("/notifications");
    expect(hrefs).toContain("/reports/team");
    expect(hrefs).toContain("/settings/team");
    expect(hrefs).toContain("/settings/stores");
    expect(settingsNavigation.map((item) => item.href)).toEqual([
      "/settings/team",
      "/settings/stores",
      "/login",
    ]);
  });

  it("removes the old dashboard entry from sidebar and command shortcuts", () => {
    const navigationHrefs = allNavigationItems.map((item) => item.href);
    const commandHrefs = commandQuickActions.map((action) => action.href);

    expect(navigationHrefs).not.toContain("/dashboard");
    expect(commandHrefs).not.toContain("/dashboard");
  });
});
