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

function mercariDescription(articleText: string) {
  const match = articleText.match(
    /商品の説明\s*([\s\S]*?)(?:\s+\d+\s*(?:分|時間|日|週間|か月|ヶ月|年前)|\s+商品の情報)/
  );
  return cleanWebText(match?.[1]);
}

function mercariCondition(articleText: string) {
  const match = articleText.match(/商品の状態\s*([^\n]+)(?:\n([^\n]+))?/);
  return uniqueWebText([match?.[1], match?.[2]]).join(" · ");
}

function mercariStatus(articleText: string) {
  if (/売り切れ|SOLD\s*OUT/i.test(articleText)) return "SOLD_OUT" as const;
  if (/ページが見つかりません|商品が削除|公開停止/.test(articleText)) return "UNAVAILABLE" as const;
  if (/購入手続きへ|カートに入れる|購入する/.test(articleText)) return "ACTIVE" as const;
  return "UNKNOWN" as const;
}

export const mercariWebPlatformAdapter: WebPlatformContentAdapter = {
  code: "MERCARI",
  version: "3",
  label: "Mercari",
  tier: "OPTIMIZED",
  variants: ["Shops product", "personal item", "PC/mobile canonical URL"],
  capabilities: [
    "externalListingId",
    "title",
    "description",
    "price",
    "condition",
    "availability",
    "seller",
    "brand",
    "categoryPath",
    "productImages",
  ],
  matches: ({ normalizedUrl, platformName }) => {
    const hostname = new URL(normalizedUrl).hostname.toLowerCase();
    return (
      platformName === "Mercari" || hostname === "mercari.com" || hostname.endsWith(".mercari.com")
    );
  },
  extract: ({ document }): WebPlatformExtraction => {
    const allLinks = document.links ?? [
      ...(document.categoryLinks ?? []),
      ...(document.brandLinks ?? []),
      ...(document.shopLinks ?? []),
    ];
    const categoryLinks = allLinks.filter((link) => /[?&]category_id=/.test(link.href));
    const brandLinks = allLinks.filter((link) => /[?&]brand_id=/.test(link.href));
    const sellerLinks = allLinks.filter((link) =>
      /\/(?:shops\/profile|user\/profile)\//.test(link.href)
    );
    const articleText = document.articleText || document.bodyText || "";
    const title = cleanWebText(document.heading).replace(/\s+-\s+メルカリ$/, "");
    const description = mercariDescription(articleText);
    const amount = priceFromWebText(articleText);
    const conditionText = mercariCondition(document.articleText || "");
    const pageStatus = mercariStatus(articleText);
    const sellerName = cleanWebText(sellerLinks[0]?.text.split(/\r?\n/)[0]);
    const brand = cleanWebText(brandLinks[0]?.text);
    const sourceCategoryPath = uniqueWebText(categoryLinks.map((entry) => entry.text));
    const imageUrls = uniqueWebText(
      (document.images ?? []).filter((url) =>
        /(?:mercari-shops-static\.com\/-\/(?:large|medium)\/plain\/|static\.mercdn\.net\/item\/detail\/orig\/photos\/)/.test(
          url
        )
      )
    )
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, 12);
    const fields: Partial<WebLinkProductFields> = {
      title,
      description,
      amount,
      currency: "JPY",
      conditionText,
      pageStatus,
      sellerName,
      brand,
      sourceCategoryPath,
      imageUrls,
    };
    const claims: WebLinkFieldClaim[] = [];
    if (title) claims.push(fieldClaim("title", "MERCARI", 0.96, title));
    if (description) claims.push(fieldClaim("description", "MERCARI", 0.92));
    if (amount) claims.push(fieldClaim("amount", "MERCARI", 0.93, amount));
    claims.push(fieldClaim("currency", "MERCARI", 0.99, "Mercari Japan"));
    if (conditionText) claims.push(fieldClaim("conditionText", "MERCARI", 0.94, conditionText));
    if (pageStatus !== "UNKNOWN") claims.push(fieldClaim("pageStatus", "MERCARI", 0.96));
    if (sellerName) claims.push(fieldClaim("sellerName", "MERCARI", 0.91, sellerName));
    if (brand) claims.push(fieldClaim("brand", "MERCARI", 0.94, brand));
    if (sourceCategoryPath.length)
      claims.push(
        fieldClaim("sourceCategoryPath", "MERCARI", 0.94, sourceCategoryPath.join(" / "))
      );
    if (imageUrls.length) claims.push(fieldClaim("imageUrls", "MERCARI", 0.92));
    return { fields, claims };
  },
};
