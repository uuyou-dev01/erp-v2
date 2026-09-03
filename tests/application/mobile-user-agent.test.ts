import { describe, expect, it } from "vitest";
import { isMobileUserAgent } from "@/lib/mobile/user-agent";

describe("mobile user-agent detection", () => {
  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  ])("recognizes a phone or tablet browser", (userAgent) => {
    expect(isMobileUserAgent(userAgent)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
    "curl/8.7.1",
    "",
  ])("keeps desktop and unknown clients on the desktop entry", (userAgent) => {
    expect(isMobileUserAgent(userAgent)).toBe(false);
  });
});
