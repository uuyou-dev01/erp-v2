import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_TASK_STATUSES,
  TASK_STATUS,
  TASK_TYPE,
} from "@/lib/application/tasks";

describe("task constants", () => {
  it("uses ASSIGNED for delegated tasks", () => {
    expect(TASK_STATUS.ASSIGNED).toBe("ASSIGNED");
  });

  it("uses DONE for completed tasks", () => {
    expect(TASK_STATUS.DONE).toBe("DONE");
  });

  it("contains the shipment and listing task types needed by the workbench", () => {
    expect(TASK_TYPE.SHIP_ORDER).toBe("SHIP_ORDER");
    expect(TASK_TYPE.LISTING_CREATE).toBe("LISTING_CREATE");
    expect(TASK_TYPE.SETTLE_ORDER).toBe("SETTLE_ORDER");
  });

  it("treats open assigned in-progress and overdue tasks as incomplete", () => {
    expect(INCOMPLETE_TASK_STATUSES).toEqual([
      TASK_STATUS.OPEN,
      TASK_STATUS.ASSIGNED,
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.OVERDUE,
    ]);
  });
});
