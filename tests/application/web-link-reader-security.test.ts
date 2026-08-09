import { describe, expect, it } from "vitest";
import { assertPublicWebUrl, extractFirstWebUrl } from "@/lib/capture/web-link-reader";
import { extractWebLinkBatchInputs, mapWithConcurrency } from "@/lib/capture/web-link-batch";

describe("web link reader URL safety", () => {
  it("extracts a URL from platform share text", () => {
    expect(
      extractFirstWebUrl(
        "【闲鱼】https://m.tb.cn/h.8gqBrdE?tk=n50rgzPeCuc HU591 「商品标题」 点击链接直接打开"
      )
    ).toBe("https://m.tb.cn/h.8gqBrdE?tk=n50rgzPeCuc");
    expect(() => extractFirstWebUrl("只有文字，没有链接")).toThrow(
      "请粘贴商品链接或包含链接的分享文案"
    );
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.0.46:3000/",
    "http://[::1]/",
    "http://localhost/internal",
  ])("rejects private target %s", async (url) => {
    await expect(assertPublicWebUrl(url)).rejects.toThrow(/内网/);
  });

  it("rejects unsupported protocols and embedded credentials", async () => {
    await expect(assertPublicWebUrl("file:///etc/passwd")).rejects.toThrow(/HTTP/);
    await expect(assertPublicWebUrl("https://user:secret@example.com/item")).rejects.toThrow(
      /账号或密码/
    );
  });

  it("splits and de-duplicates a multi-link paste while preserving a single share message", () => {
    const batch = extractWebLinkBatchInputs(`
      https://jp.mercari.com/item/m47053535154
      https://jp.mercari.com/item/m60878248868
      https://jp.mercari.com/item/m60878248868
    `);
    expect(batch).toEqual({
      inputs: [
        "https://jp.mercari.com/item/m47053535154",
        "https://jp.mercari.com/item/m60878248868",
      ],
      detectedCount: 3,
      duplicateCount: 1,
    });
    const share = "【闲鱼】https://m.tb.cn/h.example 标题 点击链接直接打开";
    expect(extractWebLinkBatchInputs(share).inputs).toEqual([share]);
  });

  it("keeps batch worker result ordering under concurrency", async () => {
    const result = await mapWithConcurrency([30, 5, 15], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value));
      return value;
    });
    expect(result).toEqual([30, 5, 15]);
  });
});
