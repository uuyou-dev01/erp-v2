import { describe, expect, it } from "vitest";
import {
  returnPathWithCreatedId,
  safeInternalReturnPath,
} from "@/lib/application/return-navigation";

describe("internal return navigation", () => {
  it("accepts internal paths and rejects external or ambiguous targets", () => {
    expect(safeInternalReturnPath("/setup?step=platform#current")).toBe(
      "/setup?step=platform#current"
    );
    expect(safeInternalReturnPath("//evil.example/setup")).toBeNull();
    expect(safeInternalReturnPath("https://evil.example/setup")).toBeNull();
    expect(safeInternalReturnPath("/\\evil.example/setup")).toBeNull();
    expect(safeInternalReturnPath("setup")).toBeNull();
  });

  it("adds a created object id without losing query parameters or hashes", () => {
    expect(
      returnPathWithCreatedId("/setup?step=platform#current", "createdPlatformId", "p/1")
    ).toBe("/setup?step=platform&createdPlatformId=p%2F1#current");
  });
});
