import { describe, expect, it } from "vitest";
import { presaleDateExpired, validatePresale } from "@/lib/application/presale";

const now = new Date("2026-10-06T17:00:00Z"); // October 7 in Shanghai.
const input = { isPresale: true, buyerNoticeConfirmed: true, expectedShipDate: "2026-10-07" };

describe("presale promises", () => {
  it("requires a real date and an explicit buyer notice", () => {
    expect(() => validatePresale({ ...input, buyerNoticeConfirmed: false }, "SKU", now)).toThrow(
      "告知买家"
    );
    for (const date of ["", "invalid", "2026-02-30", "2026-10-06"]) {
      expect(() => validatePresale({ ...input, expectedShipDate: date }, "SKU", now)).toThrow();
    }
    expect(validatePresale(input, "SKU", now)?.toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });
  it("excludes unique items and leaves regular listings unchanged", () => {
    expect(() => validatePresale(input, "ITEM_UNIT", now)).toThrow("中古单件");
    expect(validatePresale({}, "SKU", now)).toBeNull();
  });
  it("expires promises by the Shanghai calendar day", () => {
    expect(presaleDateExpired(new Date("2026-10-06"), now)).toBe(true);
    expect(presaleDateExpired(new Date("2026-10-07"), now)).toBe(false);
    expect(presaleDateExpired(null, now)).toBe(true);
  });
});
