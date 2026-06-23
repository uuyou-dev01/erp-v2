import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next config", () => {
  it("allows Playwright dev origin used by the local smoke suite", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });
});
