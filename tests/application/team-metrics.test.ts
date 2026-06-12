import { describe, expect, it } from "vitest";
import { aggregateTeamMetrics } from "@/lib/application/team-metrics";
import { TASK_TYPE } from "@/lib/application/tasks";

describe("team metrics aggregation", () => {
  it("counts listing work, shipped orders, shipped units, settlement work and late tasks by completed user", () => {
    const dueAt = new Date("2026-06-01T00:00:00.000Z");
    const completedAt = new Date("2026-06-02T00:00:00.000Z");

    const result = aggregateTeamMetrics({
      userNameById: new Map([
        ["user_listing", "上架员"],
        ["user_shipper", "发货员"],
      ]),
      platformNameById: new Map([["platform_jp", "Mercari"]]),
      facts: [
        {
          taskId: "task_listing",
          refId: "listing_1",
          taskType: TASK_TYPE.LISTING_CREATE,
          completedById: "user_listing",
          completedAt,
        },
        {
          taskId: "task_ship_1",
          refId: "order_1",
          taskType: TASK_TYPE.SHIP_ORDER,
          completedById: "user_shipper",
          completedAt,
          dueAt,
          orderQuantity: "2",
          platformId: "platform_jp",
          countryFlow: "JP",
        },
        {
          taskId: "task_ship_2",
          refId: "order_2",
          taskType: TASK_TYPE.SHIP_ORDER,
          completedById: "user_shipper",
          completedAt,
          orderQuantity: "3",
          platformId: "platform_jp",
          countryFlow: "JP",
        },
        {
          taskId: "task_settle",
          refId: "order_1",
          taskType: TASK_TYPE.SETTLE_ORDER,
          completedById: "user_shipper",
          completedAt,
        },
      ],
    });

    expect(result.summary.listingTasks).toBe(1);
    expect(result.summary.shippedOrders).toBe(2);
    expect(result.summary.shippedUnits).toBe("5");
    expect(result.summary.settlementTasks).toBe(1);
    expect(result.summary.overdueTasks).toBe(1);

    expect(result.rows).toEqual([
      expect.objectContaining({
        userId: "user_shipper",
        shippedOrders: 2,
        shippedUnits: "5",
        settlementTasks: 1,
        overdueTasks: 1,
      }),
      expect.objectContaining({
        userId: "user_listing",
        listingTasks: 1,
      }),
    ]);
    expect(result.platformBreakdown).toEqual([
      {
        platformId: "platform_jp",
        platformName: "Mercari",
        shippedTasks: 2,
        shippedUnits: "5",
      },
    ]);
    expect(result.countryBreakdown).toEqual([
      { countryFlow: "JP", shippedTasks: 2, shippedUnits: "5" },
    ]);
  });
});
