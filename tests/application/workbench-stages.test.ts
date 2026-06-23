import { describe, expect, it } from "vitest";
import {
  WORKFLOW_STAGES,
  emptyQueueCounts,
  getVisibleWorkflowStages,
  type WorkQueue,
} from "@/lib/application/next-actions";
import {
  listingPendingItemToWorkItem,
  mergePendingListingWorkItems,
} from "@/lib/application/workbench-pending-listing";

describe("workbench workflow stages", () => {
  it("covers every work queue in the top status strip", () => {
    const countKeys = Object.keys(emptyQueueCounts()).filter(
      (key) => key !== "total"
    ) as WorkQueue[];
    const stageKeys = WORKFLOW_STAGES.map((stage) => stage.key);

    expect(stageKeys).toEqual(expect.arrayContaining(countKeys));
  });

  it("does not truncate visible status cards when many queues have work", () => {
    const counts = emptyQueueCounts();
    for (const key of Object.keys(counts)) {
      if (key !== "total") counts[key as WorkQueue] = 1;
    }
    counts.total = Object.keys(counts).filter((key) => key !== "total").length;

    expect(getVisibleWorkflowStages(counts).map((stage) => stage.key)).toHaveLength(counts.total);
  });

  it("does not show a selected queue in the top strip when it has no work", () => {
    const counts = emptyQueueCounts();
    counts.missingLogistics = 1;
    counts.total = 1;

    expect(getVisibleWorkflowStages(counts, "pendingArrival").map((stage) => stage.key)).toEqual([
      "missingLogistics",
    ]);
  });

  it("uses listing pending items as pending listing work items", () => {
    const pendingItem = {
      id: "sku_test",
      type: "SKU" as const,
      skuId: "sku_1",
      skuCode: "SKU-1",
      skuName: "Test SKU",
      imageUrl: null,
      waitingSince: "2026-06-01T00:00:00.000Z",
      sellableQty: 3,
      inTransitQty: 0,
      sellableLocations: [],
      inTransitLocations: [],
      activePlatforms: [],
      availablePlatforms: [{ id: "platform_1", name: "Mercari", code: "MERCARI" }],
      suggestedPrice: null,
      suggestedCurrency: null,
    };

    const workItem = listingPendingItemToWorkItem(pendingItem);

    expect(workItem.queue).toBe("pendingListing");
    expect(workItem.currentStatusLabel).toBe("待上架检查");
    expect(workItem.title).toContain("SKU-1");
  });

  it("replaces stale pending listing work items with listing pending results", () => {
    const existing = {
      id: "old-pending",
      entityType: "inventoryLot" as const,
      entityId: "lot_1",
      queue: "pendingListing" as const,
      title: "Old",
      currentStatus: "ACTIVE",
      currentStatusLabel: "待上架检查",
      primaryAction: "createListing" as const,
      primaryActionLabel: "添加上架记录",
      priority: "normal" as const,
      waitingSince: "2026-05-01T00:00:00.000Z",
    };
    const pendingItem = {
      id: "sku_test",
      type: "SKU" as const,
      skuId: "sku_1",
      skuCode: "SKU-1",
      skuName: "Test SKU",
      imageUrl: null,
      waitingSince: "2026-06-01T00:00:00.000Z",
      sellableQty: 3,
      inTransitQty: 0,
      sellableLocations: [],
      inTransitLocations: [],
      activePlatforms: [],
      availablePlatforms: [{ id: "platform_1", name: "Mercari", code: "MERCARI" }],
      suggestedPrice: null,
      suggestedCurrency: null,
    };

    const merged = mergePendingListingWorkItems([existing], [pendingItem], undefined, 20);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("pending-listing-sku_test");
  });
});
