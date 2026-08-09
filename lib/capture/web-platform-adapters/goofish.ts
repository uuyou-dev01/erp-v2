import type {
  WebLinkFieldClaim,
  WebLinkFieldName,
  WebLinkProductFields,
} from "@/lib/capture/web-link-types";
import {
  cleanWebText,
  fieldClaim,
  priceFromWebText,
} from "@/lib/capture/web-platform-adapters/shared";
import type {
  WebPlatformContentAdapter,
  WebPlatformExtraction,
} from "@/lib/capture/web-platform-adapters/types";

function goofishShareTitle(sharedText: string) {
  const normalizeTitle = (value: string) => {
    let title = cleanWebText(value)
      .replace(/^快来捡漏/, "")
      .trim();
    const straightQuoteCount = title.match(/"/g)?.length ?? 0;
    if (straightQuoteCount % 2 === 1) title = title.replace(/"/g, "");
    return title;
  };
  const bracketed = [...sharedText.matchAll(/【([^】]{3,})】/g)]
    .map((match) => normalizeTitle(match[1]))
    .filter((value) => value && value !== "闲鱼");
  if (bracketed.length) return bracketed.sort((a, b) => b.length - a.length)[0];
  const quoted = sharedText.match(/「([^」]{3,})」/)?.[1];
  if (quoted) return normalizeTitle(quoted);
  return normalizeTitle(sharedText.split(/https?:\/\//i)[0])
    .replace(/^【闲鱼】/, "")
    .replace(/#[^#]+#.*$/, "")
    .trim();
}

export const goofishWebPlatformAdapter: WebPlatformContentAdapter = {
  code: "GOOFISH",
  version: "1",
  label: "闲鱼",
  tier: "OPTIMIZED",
  variants: ["p.goofish.com share link", "m.tb.cn share link", "goofish item URL"],
  capabilities: ["redirectExpansion", "externalListingId", "sharedTitle", "sharedText"],
  matches: ({ normalizedUrl, platformName }) => {
    const hostname = new URL(normalizedUrl).hostname.toLowerCase();
    return (
      platformName === "闲鱼" || hostname === "goofish.com" || hostname.endsWith(".goofish.com")
    );
  },
  extract: ({ document }): WebPlatformExtraction => {
    const sharedText = cleanWebText(document.sharedText);
    const title = goofishShareTitle(sharedText);
    const sharedAmount = priceFromWebText(sharedText);
    const fields: Partial<WebLinkProductFields> = {
      title,
      description: sharedText,
      amount: sharedAmount,
      currency: "CNY",
      pageStatus: "UNKNOWN",
    };
    const claims: WebLinkFieldClaim[] = [];
    if (title) claims.push(fieldClaim("title", "GOOFISH", 0.9, title));
    if (sharedText) claims.push(fieldClaim("description", "GOOFISH", 0.72, sharedText));
    if (sharedAmount) claims.push(fieldClaim("amount", "GOOFISH", 0.76, sharedAmount));
    claims.push(fieldClaim("currency", "GOOFISH", 0.9, "闲鱼中国站"));
    const clearFields: WebLinkFieldName[] = ["description", "imageUrls", "sellerName", "brand"];
    if (!title) clearFields.push("title");
    if (!sharedAmount) clearFields.push("amount");
    return {
      fields,
      claims,
      clearFields,
      warnings: ["闲鱼匿名页面未提供可靠商品详情；已保留分享标题和商品 ID，请手动核对价格与图片"],
    };
  },
};
