import { describe, expect, it } from "vitest";
import { matchesNotificationView, notificationBody } from "@/lib/notification-presentation";

describe("notification presentation", () => {
  it("keeps reading status independent from business resolution", () => {
    const resolvedUnread = { readAt: null, resolvedAt: "2026-09-21" };
    const readPending = { readAt: "2026-09-21", resolvedAt: null };
    expect(matchesNotificationView(resolvedUnread, "unread")).toBe(true);
    expect(matchesNotificationView(resolvedUnread, "pending")).toBe(false);
    expect(matchesNotificationView(readPending, "read")).toBe(true);
    expect(matchesNotificationView(readPending, "pending")).toBe(true);
    expect(matchesNotificationView(readPending, "unread")).toBe(false);
  });

  it("removes a duplicate order title and preserves useful event details", () => {
    const order = { orderNumber: "ORDER-12", externalOrderNo: null };
    expect(notificationBody({ ...order, body: "发货订单 ORDER-12" })).toBe("");
    expect(notificationBody({ ...order, body: "ORDER-12：张三确认发出。" })).toBe("张三确认发出。");
    expect(notificationBody({ ...order, body: "ORDER-123：张三确认发出。" })).toBe(
      "ORDER-123：张三确认发出。"
    );
    expect(
      notificationBody({ ...order, externalOrderNo: "EXTERNAL-12", body: "发货订单 ORDER-12" })
    ).toBe("发货订单 ORDER-12");
    expect(notificationBody({ ...order, body: null })).toBe("");
    expect(
      notificationBody({ orderNumber: null, externalOrderNo: null, body: "发货订单 ORDER-12" })
    ).toBe("发货订单 ORDER-12");
  });
});
