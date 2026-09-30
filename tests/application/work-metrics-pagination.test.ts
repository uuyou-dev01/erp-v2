import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { aggregateWorkMetrics } from "@/lib/application/work-metrics";

describe("workload detail completeness", () => {
  it("keeps every record available to pagination and export beyond the old 200-row cutoff", () => {
    const facts = Array.from({ length: 251 }, (_, index) => ({
      id: `work-${index}`,
      userId: "worker",
      userName: "执行人",
      workTypeId: "ship",
      workCode: "SHIP_ORDER",
      workName: "发货",
      quantity: "2",
      unit: "件",
      occurredAt: new Date("2026-09-30T00:00:00Z"),
      settlementRate: "1.5",
      settlementCurrency: "CNY",
    }));
    const result = aggregateWorkMetrics(facts);
    expect(result.records).toHaveLength(251);
    expect(result.records.at(-1)?.id).toBe("work-250");
    expect(result.eventCount).toBe(251);
    expect(result.rows[0].values.ship.quantity).toBe("502");
    expect(result.settlement[0].amount).toBe("753");
  });
});
