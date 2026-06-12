import { describe, expect, it } from "vitest";
import { shouldSkipNotification } from "@/lib/application/notifications";

describe("notification rules", () => {
  it("skips self notifications for completed tasks", () => {
    expect(
      shouldSkipNotification({
        recipientId: "user_1",
        actorId: "user_1",
        type: "TASK_DONE",
      })
    ).toBe(true);
  });

  it("does not skip assignment notifications to the actor", () => {
    expect(
      shouldSkipNotification({
        recipientId: "user_1",
        actorId: "user_1",
        type: "TASK_ASSIGNED",
      })
    ).toBe(false);
  });

  it("does not skip completed task notifications to the delegator", () => {
    expect(
      shouldSkipNotification({
        recipientId: "user_1",
        actorId: "user_2",
        type: "TASK_DONE",
      })
    ).toBe(false);
  });
});
