import type { WebLinkFieldClaim, WebLinkProductFields } from "@/lib/capture/web-link-types";
import {
  cleanWebText,
  fieldClaim,
  priceFromWebText,
  uniqueWebText,
} from "@/lib/capture/web-platform-adapters/shared";
import type {
  WebPlatformContentAdapter,
  WebPlatformExtraction,
} from "@/lib/capture/web-platform-adapters/types";

function atmosStatus(text: string) {
  if (/在庫切れ|完売|SOLD\s*OUT/i.test(text)) return "SOLD_OUT" as const;
  if (/カートに入れる|サイズを選択|店頭在庫を見る/.test(text)) return "ACTIVE" as const;
  return "UNKNOWN" as const;
}

export const atmosWebPlatformAdapter: WebPlatformContentAdapter = {
  code: "ATMOS",
  version: "1",
  label: "Atmos",
  tier: "OPTIMIZED",
  variants: ["official item page"],
  capabilities: [
    "externalListingId",
    "title",
    "price",
    "currency",
    "availability",
    "seller",
    "productImages",
  ],
  matches: ({ normalizedUrl, platformName }) => {
    const hostname = new URL(normalizedUrl).hostname.toLowerCase();
    return (
      platformName === "Atmos" ||
      hostname === "atmos-tokyo.com" ||
      hostname.endsWith(".atmos-tokyo.com")
    );
  },
  extract: ({ document, externalListingId }): WebPlatformExtraction => {
    const articleText = document.articleText || document.bodyText || "";
    const title = cleanWebText(document.heading);
    const amount = priceFromWebText(articleText);
    const pageStatus = atmosStatus(articleText);
    const imageUrls = uniqueWebText(
      (document.images ?? []).filter((url) =>
        Boolean(
          /^https?:\/\/assets\.atmos-tokyo\.com\/items\//i.test(url) &&
          (!externalListingId || url.toLowerCase().includes(`/${externalListingId.toLowerCase()}-`))
        )
      )
    ).slice(0, 12);
    const fields: Partial<WebLinkProductFields> = {
      title,
      amount,
      currency: "JPY",
      pageStatus,
      sellerName: "atmos",
      imageUrls,
    };
    const claims: WebLinkFieldClaim[] = [];
    if (title) claims.push(fieldClaim("title", "ATMOS", 0.95, title));
    if (amount) claims.push(fieldClaim("amount", "ATMOS", 0.92, amount));
    claims.push(fieldClaim("currency", "ATMOS", 0.99, "Atmos Japan"));
    if (pageStatus !== "UNKNOWN") claims.push(fieldClaim("pageStatus", "ATMOS", 0.9));
    claims.push(fieldClaim("sellerName", "ATMOS", 0.98, "atmos official store"));
    if (imageUrls.length) claims.push(fieldClaim("imageUrls", "ATMOS", 0.96));
    return { fields, claims };
  },
};
