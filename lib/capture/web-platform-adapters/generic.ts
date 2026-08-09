import type { WebLinkFieldClaim, WebLinkProductFields } from "@/lib/capture/web-link-types";
import {
  cleanWebText,
  fieldClaim,
  priceFromWebText,
} from "@/lib/capture/web-platform-adapters/shared";
import type {
  WebPlatformContentAdapter,
  WebPlatformExtraction,
} from "@/lib/capture/web-platform-adapters/types";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function flattenJsonLd(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isObject(value)) return [];
  const graph = value["@graph"];
  return [value, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

function jsonLdTypeIncludes(value: JsonObject, expected: string) {
  const type = value["@type"];
  return Array.isArray(type)
    ? type.some((entry) => cleanWebText(entry).toLowerCase() === expected.toLowerCase())
    : cleanWebText(type).toLowerCase() === expected.toLowerCase();
}

function jsonLdProduct(values: unknown[]) {
  return values.flatMap(flattenJsonLd).find((entry) => jsonLdTypeIncludes(entry, "Product"));
}

function jsonLdOffer(product?: JsonObject) {
  if (!product) return undefined;
  const offers = product.offers;
  if (Array.isArray(offers)) return offers.find(isObject);
  return isObject(offers) ? offers : undefined;
}

function jsonLdBrand(product?: JsonObject) {
  if (!product) return "";
  if (typeof product.brand === "string") return cleanWebText(product.brand);
  return isObject(product.brand) ? cleanWebText(product.brand.name) : "";
}

function jsonLdImages(product?: JsonObject) {
  if (!product) return [];
  const image = product.image;
  if (typeof image === "string") return [image];
  if (Array.isArray(image)) {
    return image.flatMap((entry) => {
      if (typeof entry === "string") return [entry];
      return isObject(entry) && typeof entry.url === "string" ? [entry.url] : [];
    });
  }
  return isObject(image) && typeof image.url === "string" ? [image.url] : [];
}

function currencyFromText(text: string, platformName: string) {
  if (/\b(?:JPY|JP¥)\b/i.test(text) || platformName === "Mercari") return "JPY";
  if (/\b(?:USD|US\$)\b/i.test(text) || /\$/.test(text)) return "USD";
  if (/\b(?:CNY|RMB)\b/i.test(text) || /￥/.test(text)) return "CNY";
  return "CNY";
}

function availabilityStatus(offer: JsonObject | undefined, text: string) {
  const availability = cleanWebText(offer?.availability);
  if (/OutOfStock|SoldOut/i.test(availability) || /sold\s*out|売り切れ|已售罄/i.test(text))
    return "SOLD_OUT" as const;
  if (/InStock|PreOrder/i.test(availability)) return "ACTIVE" as const;
  return "UNKNOWN" as const;
}

export const genericWebPlatformAdapter: WebPlatformContentAdapter = {
  code: "GENERIC",
  version: "2",
  label: "通用网页",
  tier: "GENERIC",
  variants: ["JSON-LD Product", "Open Graph", "HTML metadata"],
  capabilities: ["title", "description", "price", "currency", "brand", "images", "availability"],
  matches: () => true,
  extract: ({ document, platformName }): WebPlatformExtraction => {
    const meta = document.meta ?? {};
    const product = jsonLdProduct(document.jsonLd ?? []);
    const offer = jsonLdOffer(product);
    const bodyText = document.articleText || document.bodyText || "";
    const title = cleanWebText(
      document.heading || product?.name || meta["og:title"] || document.documentTitle
    );
    const description = cleanWebText(
      product?.description || meta["og:description"] || meta.description
    );
    const amount = cleanWebText(offer?.price) || priceFromWebText(bodyText);
    const currency =
      cleanWebText(offer?.priceCurrency).toUpperCase() ||
      currencyFromText(`${cleanWebText(offer?.priceCurrency)} ${bodyText}`, platformName);
    const brand = jsonLdBrand(product);
    const imageUrls = [...(document.images ?? []), ...jsonLdImages(product), meta["og:image"]]
      .map(cleanWebText)
      .filter((url, index, all) => /^https?:\/\//i.test(url) && all.indexOf(url) === index)
      .slice(0, 12);
    const pageStatus = availabilityStatus(offer, bodyText);
    const conditionText = cleanWebText(product?.itemCondition);
    const fields: Partial<WebLinkProductFields> = {
      title,
      description,
      amount,
      currency,
      conditionText,
      pageStatus,
      brand,
      imageUrls,
    };
    const claims: WebLinkFieldClaim[] = [];
    if (title) claims.push(fieldClaim("title", "GENERIC", 0.86, title));
    if (description) claims.push(fieldClaim("description", "GENERIC", 0.82));
    if (amount) claims.push(fieldClaim("amount", "GENERIC", offer?.price ? 0.94 : 0.7, amount));
    if (currency)
      claims.push(fieldClaim("currency", "GENERIC", offer?.priceCurrency ? 0.96 : 0.65));
    if (brand) claims.push(fieldClaim("brand", "GENERIC", 0.9, brand));
    if (imageUrls.length) claims.push(fieldClaim("imageUrls", "GENERIC", 0.82));
    if (pageStatus !== "UNKNOWN") claims.push(fieldClaim("pageStatus", "GENERIC", 0.88));
    if (conditionText) claims.push(fieldClaim("conditionText", "GENERIC", 0.78));
    return { fields, claims };
  },
};
