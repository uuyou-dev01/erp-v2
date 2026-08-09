import { describe, expect, it } from "vitest";
import { inferCapturePlatform, normalizeCaptureUrl } from "@/lib/capture/service";

describe("capture source normalization", () => {
  it("removes fragments and tracking parameters while preserving identity parameters", () => {
    expect(normalizeCaptureUrl("https://example.com/item/1?utm_source=share&id=9#detail")).toBe(
      "https://example.com/item/1?id=9"
    );
  });

  it("recognizes common mobile purchase platforms", () => {
    expect(inferCapturePlatform("https://www.goofish.com/item?id=1")).toBe("闲鱼");
    expect(inferCapturePlatform("https://m.qiandao.com/item/1")).toBe("千岛");
    expect(inferCapturePlatform(undefined, "微信")).toBe("微信");
  });

  it("rejects malformed source URLs", () => {
    expect(() => normalizeCaptureUrl("not a link")).toThrow("来源链接格式不正确");
  });
});
