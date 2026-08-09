import { describe, expect, it } from "vitest";
import { detectImageMime } from "@/lib/capture/image-import";

describe("capture image import", () => {
  it("accepts supported image signatures instead of trusting the response header", () => {
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png"
    );
    expect(detectImageMime(Buffer.from("RIFF0000WEBP", "ascii"))).toBe("image/webp");
    expect(detectImageMime(Buffer.from("GIF89a", "ascii"))).toBe("image/gif");
  });

  it("rejects HTML or unknown bytes disguised as an image", () => {
    expect(detectImageMime(Buffer.from("<html>not an image</html>"))).toBeNull();
  });
});
