import type {
  ListingCoveragePlatform,
  SellableItemUnitRow,
} from "@/lib/application/listing-coverage";
import type { StockLocationBreakdown } from "@/lib/application/inventory";

export type SellableMarketCode = "CN" | "JP" | "US" | "GLOBAL" | "UNKNOWN";

export interface SellableMarketSummary {
  market: SellableMarketCode;
  label: string;
  sellableQty: number;
  inTransitQty: number;
  locationNames: string[];
  isPrimary: boolean;
}

const MARKET_LABELS: Record<SellableMarketCode, string> = {
  CN: "中国市场",
  JP: "日本市场",
  US: "美国市场",
  GLOBAL: "全球市场",
  UNKNOWN: "未识别市场",
};

export function marketLabel(market: SellableMarketCode) {
  return MARKET_LABELS[market];
}

export function inferMarketFromLocation(location: {
  region?: string | null;
  code?: string | null;
  name?: string | null;
}): SellableMarketCode {
  const region = location.region?.toUpperCase() ?? "";
  const code = location.code?.toUpperCase() ?? "";
  const name = location.name ?? "";

  if (region.startsWith("JP")) return "JP";
  if (region.startsWith("CN")) return "CN";
  if (region.startsWith("US")) return "US";

  const source = `${code} ${name}`;
  if (/(^|[-_\s])JP($|[-_\s])|日本|东京|大阪|京都|名古屋/.test(source)) return "JP";
  if (/(^|[-_\s])CN($|[-_\s])|中国|上海|北京|深圳|广州|杭州|国内/.test(source)) return "CN";
  if (/日本|东京|大阪|京都|名古屋/.test(source)) return "JP";
  if (/中国|上海|北京|深圳|广州|杭州|国内/.test(source)) return "CN";
  if (/^(FW|FWD)([-_\s]|$)/.test(code) || /货代|集运/.test(name)) return "JP";
  if (/美国|洛杉矶|纽约/.test(source)) return "US";
  return "UNKNOWN";
}

export function isPlatformTargetForMarket(
  platform: Pick<ListingCoveragePlatform, "country" | "code">,
  market: SellableMarketCode
) {
  if (market === "UNKNOWN" || market === "GLOBAL") return true;
  const country = platform.country?.toUpperCase();
  if (country) return country === market || country === "GLOBAL";

  const code = platform.code.toUpperCase();
  if (market === "JP") {
    return ["MERCARI", "YAHOO_AUCTION", "YAHOO_SHOPPING", "SNKRDUNK", "RAKUTEN", "AMAZON_JP", "ZOZOTOWN"].includes(code);
  }
  if (market === "CN") {
    return ["XIAN_YU", "TAOBAO", "TMALL", "JD", "PINDUODUO", "DOUYIN", "XIAOHONGSHU", "ALIBABA_1688"].includes(code);
  }
  if (market === "US") {
    return ["EBAY", "AMAZON", "SHOPIFY"].includes(code);
  }
  return true;
}

export function buildSellableMarketSummaries(input: {
  sellableLocations: StockLocationBreakdown[];
  inTransitLocations: StockLocationBreakdown[];
  itemUnits: SellableItemUnitRow[];
}): SellableMarketSummary[] {
  const byMarket = new Map<
    SellableMarketCode,
    { sellableQty: number; inTransitQty: number; locationNames: Set<string> }
  >();

  const ensure = (market: SellableMarketCode) => {
    let current = byMarket.get(market);
    if (!current) {
      current = { sellableQty: 0, inTransitQty: 0, locationNames: new Set() };
      byMarket.set(market, current);
    }
    return current;
  };

  for (const location of input.sellableLocations) {
    const market = inferMarketFromLocation(location);
    const current = ensure(market);
    current.sellableQty += location.qty;
    current.locationNames.add(`${location.code} ${location.name}`.trim());
  }

  for (const location of input.inTransitLocations) {
    const market = inferMarketFromLocation(location);
    const current = ensure(market);
    current.inTransitQty += location.qty;
  }

  for (const unit of input.itemUnits) {
    const market = inferMarketFromLocation({
      region: unit.locationRegion,
      name: unit.locationName,
    });
    const current = ensure(market);
    if (unit.sellable) {
      current.locationNames.add(unit.locationName);
    }
  }

  const rows = [...byMarket.entries()]
    .map(([market, value]) => ({
      market,
      label: marketLabel(market),
      sellableQty: value.sellableQty,
      inTransitQty: value.inTransitQty,
      locationNames: [...value.locationNames],
      isPrimary: false,
    }))
    .sort((a, b) => {
      if (b.sellableQty !== a.sellableQty) return b.sellableQty - a.sellableQty;
      return b.inTransitQty - a.inTransitQty;
    });

  if (rows[0]) rows[0].isPrimary = true;
  return rows;
}
