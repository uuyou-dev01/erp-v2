import { describe, expect, it } from "vitest";
import { isWithinQuietHours, nextQuietEnd, notificationDeliveryTime } from "@/lib/mobile/notification-outbox";

describe("mobile notification delivery policy", () => {
  it("supports quiet hours that cross midnight", () => {
    expect(isWithinQuietHours(new Date(2026, 7, 1, 23, 30), "22:00", "08:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 7, 1, 7, 30), "22:00", "08:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 7, 1, 12, 0), "22:00", "08:00")).toBe(false);
  });

  it("moves delivery to the end of quiet time", () => {
    const result = nextQuietEnd(new Date(2026, 7, 1, 23, 30), "22:00", "08:00");
    expect(result.getDate()).toBe(2);
    expect(result.getHours()).toBe(8);
  });

  it("schedules hourly and daily digests", () => {
    const now = new Date(2026, 7, 1, 14, 24, 30);
    const hourly = notificationDeliveryTime({ now, digestMode: "HOURLY" });
    const daily = notificationDeliveryTime({ now, digestMode: "DAILY" });
    expect([hourly.getHours(), hourly.getMinutes()]).toEqual([15, 0]);
    expect([daily.getDate(), daily.getHours()]).toEqual([2, 9]);
  });
});
