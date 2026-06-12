import { describe, expect, it } from "vitest";
import { TASK_STATUS, TASK_TYPE } from "@/lib/application/tasks";

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
  });
});
