import { describe, it, expect } from "vitest";
import { salesDateFilter } from "@/lib/application/sales-date-filter";
import { averageOrderValue } from "@/lib/application/operating-report-math";
const now = new Date("2026-09-20T10:00:00+08:00");
describe("sales calendar filters", () => {
  it("starts the week on Monday in reporting timezone", () => {
    const filter = salesDateFilter({ period: "week" }, now);
    expect(filter.monday).toBe("2026-09-14");
    expect(filter.matches(new Date("2026-09-13T16:00:00Z"))).toBe(true);
    expect(filter.matches(new Date("2026-09-13T15:59:59Z"))).toBe(false);
    expect(filter.matches(new Date("2026-09-20T16:00:00Z"))).toBe(false);
  });
  it("combines a selected month and weekday, including leap day", () => {
    const filter = salesDateFilter(
      { period: "selectedMonth", month: "2024-02", weekday: "4" },
      now
    );
    expect(filter.to).toBe("2024-02-29");
    expect(filter.matches(new Date("2024-02-29T12:00:00+08:00"))).toBe(true);
    expect(filter.matches(new Date("2024-02-28T12:00:00+08:00"))).toBe(false);
  });
  it("rejects invalid and reversed ranges and includes the whole last day", () => {
    for (const [from, to] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-09-20", "2026-09-01"],
    ]) {
      const filter = salesDateFilter({ period: "custom", from, to }, now);
      expect(filter.error).not.toBe("");
      expect(filter.matches(now)).toBe(false);
    }
    expect(
      salesDateFilter({ period: "custom", from: "2026-09-20", to: "2026-09-20" }, now).matches(
        new Date("2026-09-20T23:59:59.999+08:00")
      )
    ).toBe(true);
  });
});
describe("average order value", () => {
  it("uses total order revenue with monetary rounding", () =>
    expect(averageOrderValue("8120.26", 33)).toBe("246.07"));
  it("handles no orders and missing currency valuation", () => {
    expect(averageOrderValue("0", 0)).toBe("0.00");
    expect(averageOrderValue(null, 3)).toBeNull();
  });
});
