import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const relationshipSurfaces = [
  "app/(auth)/invite/warehouse/[token]/page.tsx",
  "app/(dashboard)/settings/warehouse-collaboration/page.tsx",
  "app/account/page.tsx",
  "app/collaboration/page.tsx",
  "app/collaboration/tasks/loading.tsx",
  "app/collaboration/tasks/page.tsx",
  "components/auth/location-fulfiller-invitation-panel.tsx",
  "components/collaboration/personal-workspace-shell.tsx",
  "components/collaboration/relationship-overview.tsx",
  "components/inventory/location-fulfiller-manager.tsx",
];

describe("generic external task collaboration language", () => {
  it("does not define a long-term collaboration relationship as shipping labor", () => {
    const combined = relationshipSurfaces.map(source).join("\n");

    for (const shippingOnlyLabel of [
      "只需要帮忙发货",
      "仓库负责人",
      "发货操作员",
      "我的发货任务",
      ">发货任务<",
    ]) {
      expect(combined).not.toContain(shippingOnlyLabel);
    }
  });

  it("uses generic roles and keeps a concrete task-type cue", () => {
    const foundation = source("lib/application/relationship-foundation.ts");
    const invitation = source("app/(auth)/invite/warehouse/[token]/page.tsx");
    const overview = source("app/collaboration/page.tsx");
    const tasks = source("app/collaboration/tasks/page.tsx");

    expect(foundation).toContain('MANAGER: "任务负责人"');
    expect(foundation).toContain('OPERATOR: "任务协作者"');
    expect(invitation).toContain('title="参与合作方任务"');
    expect(overview).toContain("只参与任务协作");
    expect(tasks).toContain("我的任务");
    expect(tasks).toContain("订单发货");
  });
});
