import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("warehouse collaboration workbench integration", () => {
  it("renders the member experience inside the warehouse workbench scope", () => {
    const workbench = source("app/(dashboard)/workbench/page.tsx");
    const standalone = source("app/collaboration/tasks/page.tsx");

    expect(workbench).toContain('pageParams.scope === "warehouse"');
    expect(workbench).toContain("getWarehouseCollaborationTaskInbox()");
    expect(workbench).toContain('mode="workbench"');
    expect(standalone).toContain('redirect("/workbench?scope=warehouse")');
    expect(standalone).toContain("getCollaborationShippingTasks()");
  });

  it("shows the four warehouse queues and resilient result states", () => {
    const component = source("components/collaboration/shipping-task-list.tsx");

    for (const label of ["待领取", "处理中", "我发起", "已完成"]) {
      expect(component).toContain(`label: "${label}"`);
    }
    expect(component).toContain("OUTCOME_MESSAGES");
    expect(component).toContain('already_claimed: "任务已被领取或状态已经变化，列表已刷新。"');
    expect(component).toContain('selected.status === "CANCELLED"');
    expect(component).toContain("visibleTasks.length === 0");
  });

  it("exposes explicit queue, handoff and withdrawal action contracts", () => {
    const actions = source("app/actions/collaboration-tasks.ts");
    const component = source("components/collaboration/shipping-task-list.tsx");

    for (const action of [
      "claimCollaborationShippingTaskAction",
      "declineCollaborationShippingTaskAction",
      "returnCollaborationShippingTaskAction",
      "transferCollaborationShippingTaskAction",
      "withdrawCollaborationShippingTaskAction",
    ]) {
      expect(actions).toContain(`export async function ${action}`);
      expect(component).toContain(action);
    }
    expect(actions).toContain("requestShipOrderHandoff");
    expect(actions).toContain("acceptShipOrderHandoff");
    expect(actions).toContain("withdrawShipOrderTask");
    expect(component).toContain("对方接受前仍由当前执行人负责");
  });

  it("keeps warehouse and inventory links returnable to the selected task drawer", () => {
    const component = source("components/collaboration/shipping-task-list.tsx");

    expect(component).toContain("来源仓库");
    expect(component).toContain("库存明细");
    expect(component).toContain("/inventory/locations/${selected.location.id}?returnTo=");
    expect(component).toContain("/inventory/stocktake?locationId=");
    expect(component).toContain("/workbench?scope=warehouse&task=${selected.id}");
    expect(component).toContain('aria-label="关闭仓库任务详情"');
  });
});
