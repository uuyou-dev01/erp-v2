import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_RESOLUTION,
  shouldSkipNotification,
  taskNotificationResolution,
} from "@/lib/application/notifications";

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

  it("keeps read state independent while deriving terminal task outcomes", () => {
    expect(
      taskNotificationResolution({
        notificationType: "TASK_ASSIGNED",
        recipientId: "assignee",
        assignedToId: "assignee",
        status: "ASSIGNED",
      })
    ).toBeNull();
    expect(
      taskNotificationResolution({
        notificationType: "TASK_ASSIGNED",
        recipientId: "assignee",
        assignedToId: "assignee",
        status: "IN_PROGRESS",
      })
    ).toEqual({
      resolutionCode: NOTIFICATION_RESOLUTION.TASK_STARTED,
      resolvedById: "assignee",
    });
    expect(
      taskNotificationResolution({
        notificationType: "TASK_ASSIGNED",
        recipientId: "assignee",
        assignedToId: "someone-else",
        status: "ASSIGNED",
      })
    ).toEqual({
      resolutionCode: NOTIFICATION_RESOLUTION.TASK_REASSIGNED,
      resolvedById: null,
    });
  });
});
