import { describe, expect, it } from "vitest";
import type { WorkItem } from "@/lib/application/next-actions";
import { groupWorkbenchItems } from "@/lib/application/workbench-logistics-groups";

function workItem(
  id: string,
  queue: WorkItem["queue"],
  metadata: WorkItem["metadata"] = {}
): WorkItem {
  return {
    id,
    entityType: "purchaseOrder",
    entityId: id,
    queue,
    title: `采购单 ${id}`,
    currentStatus: "TEST",
    currentStatusLabel: "待处理",
    primaryAction: "viewDetails",
    primaryActionLabel: "查看",
    priority: "normal",
    waitingSince: "2026-07-29T00:00:00.000Z",
    metadata,
  };
}

describe("groupWorkbenchItems", () => {
  it("groups pending arrival tasks that share a tracking number", () => {
    const entries = groupWorkbenchItems([
      workItem("po-1", "pendingArrival", { trackingNo: "SF123", totalQty: 2 }),
      workItem("po-2", "pendingArrival", { trackingNo: "sf123", totalQty: 3 }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "group",
      queue: "pendingArrival",
      title: "物流单号 · SF123",
      actionLabel: "批量确认收货",
      totalQuantity: 5,
    });
    if (entries[0].kind === "group") {
      expect(entries[0].items.map((item) => item.id)).toEqual(["po-1", "po-2"]);
    }
  });

  it("groups pending disposition tasks by their inbound tracking number", () => {
    const entries = groupWorkbenchItems([
      workItem("po-1", "pendingDisposition", { trackingNo: "YT888" }),
      workItem("po-2", "pendingDisposition", { trackingNo: "YT888" }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "group",
      queue: "pendingDisposition",
      actionLabel: "批量分流",
    });
  });

  it("groups consolidation tasks by batch even before an outbound tracking number exists", () => {
    const entries = groupWorkbenchItems([
      workItem("po-1", "inTransit", {
        consolidationBatchId: "batch-1",
        consolidationBatchLabel: "东京仓 → 上海仓",
      }),
      workItem("po-2", "inTransit", {
        consolidationBatchId: "batch-1",
        consolidationBatchLabel: "东京仓 → 上海仓",
      }),
    ]);

    expect(entries[0]).toMatchObject({
      kind: "group",
      title: "集运批次 · 东京仓 → 上海仓",
      description: "2 个任务 · 共用同一集运批次",
    });
  });

  it("does not merge different queues or tasks without a shared logistics identity", () => {
    const entries = groupWorkbenchItems([
      workItem("po-1", "pendingArrival", { trackingNo: "SF123" }),
      workItem("po-2", "pendingDisposition", { trackingNo: "SF123" }),
      workItem("po-3", "missingLogistics"),
    ]);

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.kind === "item")).toBe(true);
  });
});
