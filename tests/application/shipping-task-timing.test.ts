import { describe, expect, it } from "vitest";
import { getShippingTaskTiming } from "../../lib/application/shipping-task-timing";

const now = new Date("2026-09-09T12:00:00.000Z");

describe("getShippingTaskTiming", () => {
  it("counts forward from the task start instead of showing a countdown", () => {
    const timing = getShippingTaskTiming({
      createdAt: "2026-09-09T08:00:00.000Z",
      dueAt: "2026-09-09T18:00:00.000Z",
      status: "ASSIGNED",
      now,
    });

    expect(timing.isSuggestedTarget).toBe(false);
    expect(timing.scheduleLabel).toContain("发起");
    expect(timing.urgencyLabel).toBe("已进行 4 小时");
    expect(timing.tone).toBe("normal");
  });

  it("turns red after an unfinished task has run for 20 hours", () => {
    const timing = getShippingTaskTiming({
      createdAt: "2026-09-08T16:00:00.000Z",
      status: "ASSIGNED",
      now,
    });

    expect(timing.isSuggestedTarget).toBe(false);
    expect(timing.urgencyLabel).toBe("已进行 20 小时");
    expect(timing.tone).toBe("overdue");
  });

  it("keeps completed tasks green and reports their actual duration", () => {
    const timing = getShippingTaskTiming({
      createdAt: "2026-09-07T08:00:00.000Z",
      completedAt: "2026-09-08T12:00:00.000Z",
      status: "DONE",
      now,
    });

    expect(timing.urgencyLabel).toBe("共用时 1 天 4 小时");
    expect(timing.tone).toBe("completed");
  });
});
