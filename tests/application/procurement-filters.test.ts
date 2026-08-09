import { describe, expect, it } from "vitest";
import {
  normalizeProcurementPeriod,
  PROCUREMENT_PERIOD_OPTIONS,
  resolveProcurementDateRange,
} from "@/lib/application/procurement-filters";

describe("procurement date filters", () => {
  const now = new Date(2026, 6, 29, 15, 30);

  it("defaults unknown and missing periods to all time", () => {
    expect(normalizeProcurementPeriod()).toBe("all");
    expect(normalizeProcurementPeriod("nextMonth")).toBe("all");
    expect(resolveProcurementDateRange("all", undefined, undefined, now)).toEqual({
      start: null,
      end: null,
      label: "全部时间",
    });
  });

  it("offers useful historical shortcuts without a future-month option", () => {
    expect(PROCUREMENT_PERIOD_OPTIONS.map((option) => option.value)).toEqual([
      "all",
      "thisMonth",
      "last3Months",
      "thisYear",
      "custom",
    ]);
  });

  it("uses today as the exclusive upper boundary for common ranges", () => {
    const thisMonth = resolveProcurementDateRange("thisMonth", undefined, undefined, now);
    const last3Months = resolveProcurementDateRange("last3Months", undefined, undefined, now);
    const thisYear = resolveProcurementDateRange("thisYear", undefined, undefined, now);

    expect(thisMonth.start).toEqual(new Date(2026, 6, 1));
    expect(thisMonth.end).toEqual(new Date(2026, 6, 30));
    expect(last3Months.start).toEqual(new Date(2026, 4, 1));
    expect(last3Months.end).toEqual(new Date(2026, 6, 30));
    expect(thisYear.start).toEqual(new Date(2026, 0, 1));
    expect(thisYear.end).toEqual(new Date(2026, 6, 30));
  });

  it("includes the selected custom end date", () => {
    const range = resolveProcurementDateRange("custom", "2026-07-01", "2026-07-29", now);

    expect(range.start).toEqual(new Date(2026, 6, 1));
    expect(range.end).toEqual(new Date(2026, 6, 30));
    expect(range.label).toBe("2026-07-01 至 2026-07-29");
  });
});
