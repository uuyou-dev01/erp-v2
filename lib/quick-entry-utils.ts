import Decimal from "decimal.js";

const PLATFORM_ALIASES: Record<string, string[]> = {
  mercari: ["煤炉", "mercari", "メルカリ"],
  xianyu: ["闲鱼", "xianyu", "goofish"],
  rakuten: ["乐天", "rakuten", "楽天"],
  yahoo: ["雅虎", "yahoo"],
  snkrdunk: ["snkrdunk"],
  dewu: ["得物", "dewu"],
  tiktok: ["tiktok", "tiktokshop"],
};

export function parsePlatformList(text?: string | null): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/[,，、/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function matchPlatformCode(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  for (const [code, aliases] of Object.entries(PLATFORM_ALIASES)) {
    if (aliases.some((a) => normalized.includes(a.toLowerCase()) || a.toLowerCase().includes(normalized))) {
      return code;
    }
  }
  return null;
}

export function normalizeSkuCode(base: string, variant?: string | null) {
  const slug = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item";

  const main = slug(base);
  const v = variant?.trim() ? slug(variant) : "";
  return v ? `${main}-${v}` : main;
}

export function isUsedCondition(conditionType?: string | null) {
  if (!conditionType) return false;
  return /中古|二手|used/i.test(conditionType);
}

export function parseQuantity(value?: string | number | Decimal | null) {
  if (value == null || value === "") return new Decimal(1);
  const d = new Decimal(String(value));
  return d.isFinite() && d.gt(0) ? d : new Decimal(1);
}

export function parseOptionalDecimal(value?: string | number | null) {
  if (value == null || value === "") return null;
  const d = new Decimal(String(value));
  return d.isFinite() ? d : null;
}

export type IncompleteReason =
  | "missing_purchase_price"
  | "missing_location"
  | "missing_sale_price"
  | "unconfirmed_sku"
  | "missing_fx";

export function detectIncompleteFields(entry: {
  purchasePrice?: Decimal | null;
  currentLocationText?: string | null;
  salePrice?: Decimal | null;
  isAutoCreatedSku?: boolean;
  purchaseCurrency?: string | null;
}) {
  const reasons: IncompleteReason[] = [];
  if (!entry.purchasePrice) reasons.push("missing_purchase_price");
  if (!entry.currentLocationText?.trim()) reasons.push("missing_location");
  if (entry.salePrice && !entry.salePrice.isZero() && !entry.purchasePrice) {
    reasons.push("missing_purchase_price");
  }
  if (entry.isAutoCreatedSku) reasons.push("unconfirmed_sku");
  return reasons;
}
