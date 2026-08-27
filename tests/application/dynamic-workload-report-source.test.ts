import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("dynamic workload report", () => {
  it("loads work records independently from legacy fixed task metrics", () => {
    const action = source("app/actions/team-reports.ts");
    const dashboard = source("components/reports/workload-dashboard.tsx");

    expect(action).toContain("getMyWorkMetrics");
    expect(action).toContain("getWorkMetrics");
    expect(dashboard).toContain("workload.types.map");
    expect(dashboard).toContain("工作记录");
    expect(dashboard).toContain("人员汇总");
    expect(dashboard).toContain("对账预览");
  });

  it("separates internal performance from cross-organization workload", () => {
    expect(source("app/(dashboard)/reports/workload/page.tsx")).toContain("工作量中心");
    expect(source("app/(dashboard)/reports/team-performance/page.tsx")).toContain(
      "只统计本企业内部成员"
    );
    expect(source("app/(dashboard)/reports/team/page.tsx")).toContain(
      "redirect(`/reports/workload"
    );
  });

  it("keeps completed collaboration history and supports cross-warehouse reuse", () => {
    expect(source("lib/application/collaboration-shipping-tasks.ts")).toContain('"DONE"');
    expect(source("components/collaboration/shipping-task-list.tsx")).toContain("已完成");
    expect(source("app/actions/location-fulfillers.ts")).toContain(
      "addExistingLocationFulfillerAction"
    );
    expect(source("components/inventory/location-fulfiller-manager.tsx")).toContain(
      "无需重新发邀请"
    );
  });

  it("records generic task completion plus explicit receiving and shipping quantities", () => {
    expect(source("lib/application/tasks.ts")).toContain("workFromTaskMetadata");
    expect(source("app/actions/purchase-orders.ts")).toContain('code: "RECEIVE_PURCHASE"');
    expect(source("app/actions/customer-orders.ts")).toContain('code: "SHIP_ORDER"');
  });
});
