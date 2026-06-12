import { describe, expect, it } from "vitest";
import {
  normalizeStoreCode,
  normalizeStoreCurrency,
} from "@/lib/application/store-settings";

describe("store settings helpers", () => {
  it("normalizes store codes for multi-store operations", () => {
    expect(normalizeStoreCode(" jp mercari ")).toBe("JP_MERCARI");
    expect(normalizeStoreCode("store-02")).toBe("STORE-02");
  });

  it("rejects invalid store codes", () => {
    expect(() => normalizeStoreCode("x")).toThrow("店铺代码");
    expect(() => normalizeStoreCode("日本店")).toThrow("店铺代码");
  });

  it("normalizes default currency", () => {
    expect(normalizeStoreCurrency("jpy")).toBe("JPY");
    expect(normalizeStoreCurrency("")).toBe("CNY");
  });
});
