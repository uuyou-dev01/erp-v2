export const CORE_SELLING_PLATFORM_CODES = [
  "MERCARI",
  "YAHOO_AUCTION",
  "SNKRDUNK",
  "XIAN_YU",
  "DOUYIN",
  "XIAOHONGSHU",
  "TAOBAO",
] as const;

export const FULFILLMENT_READY_PLATFORM_CODES = [
  "MERCARI",
  "YAHOO_AUCTION",
  "SNKRDUNK",
] as const;

const CORE_SELLING_PLATFORM_CODE_SET = new Set<string>(CORE_SELLING_PLATFORM_CODES);
const FULFILLMENT_READY_PLATFORM_CODE_SET = new Set<string>(
  FULFILLMENT_READY_PLATFORM_CODES,
);

export function isCoreSellingPlatform(code?: string | null) {
  return Boolean(code && CORE_SELLING_PLATFORM_CODE_SET.has(code));
}

export function requiresSellableStockForListing(code?: string | null) {
  return Boolean(code && FULFILLMENT_READY_PLATFORM_CODE_SET.has(code));
}

export function sortCoreSellingPlatforms<T extends { code: string }>(items: T[]) {
  const order = new Map<string, number>(
    CORE_SELLING_PLATFORM_CODES.map((code, index) => [code, index])
  );

  return [...items].sort((a, b) => {
    const aIndex = order.get(a.code) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = order.get(b.code) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.code.localeCompare(b.code);
  });
}
