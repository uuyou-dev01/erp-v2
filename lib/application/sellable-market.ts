import type {
  ListingCoveragePlatform,
  SellableItemUnitRow,
} from "@/lib/application/listing-coverage";
import type { StockLocationBreakdown } from "@/lib/application/inventory";

export type SellableMarketCode = "CN" | "JP" | "US" | "EU" | "GLOBAL" | "UNKNOWN";

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
  EU: "欧洲市场",
  GLOBAL: "全球市场",
  UNKNOWN: "未识别市场",
};

const PLATFORM_MARKET_BY_CODE: Partial<Record<string, SellableMarketCode>> = {
  MERCARI: "JP",
  YAHOO_AUCTION: "JP",
  YAHOO_SHOPPING: "JP",
  SNKRDUNK: "JP",
  RAKUTEN: "JP",
  AMAZON_JP: "JP",
  ZOZOTOWN: "JP",
  XIAN_YU: "CN",
  TAOBAO: "CN",
  TMALL: "CN",
  JD: "CN",
  PINDUODUO: "CN",
  DOUYIN: "CN",
  XIAOHONGSHU: "CN",
  ALIBABA_1688: "CN",
  EBAY: "US",
  AMAZON: "US",
  SHOPIFY: "US",
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
  if (region.startsWith("EU")) return "EU";

  const source = `${code} ${name}`;
  if (/(^|[-_\s])JP($|[-_\s])|日本|东京|大阪|京都|名古屋/.test(source)) return "JP";
  if (/(^|[-_\s])CN($|[-_\s])|中国|上海|北京|深圳|广州|杭州|国内/.test(source)) return "CN";
  if (/日本|东京|大阪|京都|名古屋/.test(source)) return "JP";
  if (/中国|上海|北京|深圳|广州|杭州|国内/.test(source)) return "CN";
  if (/^(FW|FWD)([-_\s]|$)/.test(code) || /货代|集运/.test(name)) return "JP";
  if (/美国|洛杉矶|纽约/.test(source)) return "US";
  if (/欧洲|德国|法国|意大利|西班牙|荷兰/.test(source)) return "EU";
  return "UNKNOWN";
}

export function inferMarketFromPlatform(
  platform: Pick<ListingCoveragePlatform, "country" | "code">
): SellableMarketCode {
  const country = platform.country?.trim().toUpperCase();
  if (
    country === "JP" ||
    country === "CN" ||
    country === "US" ||
    country === "EU" ||
    country === "GLOBAL"
  ) {
    return country;
  }
  return PLATFORM_MARKET_BY_CODE[platform.code.trim().toUpperCase()] ?? "UNKNOWN";
}

export function isPlatformTargetForMarket(
  platform: Pick<ListingCoveragePlatform, "country" | "code">,
  market: SellableMarketCode
) {
  if (market === "GLOBAL") return true;
  const platformMarket = inferMarketFromPlatform(platform);
  if (market === "UNKNOWN") {
    return platformMarket === "UNKNOWN" || platformMarket === "GLOBAL";
  }
  return platformMarket === market || platformMarket === "GLOBAL";
}

export function locationMatchesMarket(
  location: {
    region?: string | null;
    code?: string | null;
    name?: string | null;
    fulfillableMarkets?: string[];
    capabilities?: Array<{ code: string; enabled?: boolean }>;
    shippingLanesFrom?: Array<{
      laneType: string;
      destinationCountry: string | null;
      active: boolean;
    }>;
  },
  market: SellableMarketCode
) {
  if (market === "GLOBAL") return true;
  const fulfillableMarkets = fulfillmentMarketsForLocation(location);
  return fulfillableMarkets.includes("GLOBAL") || fulfillableMarkets.includes(market);
}

/**
 * 返回一个库存节点可服务的销售目的地。
 * 新数据以能力 + 客户配送线路为准；未加载履约关系的旧调用回退到物理地区，
 * 以便迁移期间保持兼容，但业务查询应主动加载 shippingLanesFrom。
 */
export function fulfillmentMarketsForLocation(location: {
  region?: string | null;
  code?: string | null;
  name?: string | null;
  fulfillableMarkets?: string[];
  capabilities?: Array<{ code: string; enabled?: boolean }>;
  shippingLanesFrom?: Array<{
    laneType: string;
    destinationCountry: string | null;
    active: boolean;
  }>;
}): SellableMarketCode[] {
  if (location.fulfillableMarkets) {
    return location.fulfillableMarkets.filter(isSellableMarketCode);
  }

  if (location.shippingLanesFrom) {
    const hasExplicitProfile =
      location.shippingLanesFrom.length > 0 || Boolean(location.capabilities?.length);
    if (!hasExplicitProfile) {
      return [inferMarketFromLocation(location)];
    }
    const canFulfill =
      !location.capabilities ||
      location.capabilities.some(
        (capability) => capability.code === "DIRECT_FULFILLMENT" && capability.enabled !== false
      );
    if (!canFulfill) return [];

    return [
      ...new Set(
        location.shippingLanesFrom
          .filter(
            (lane) =>
              lane.active && lane.laneType === "CUSTOMER_DELIVERY" && lane.destinationCountry
          )
          .map((lane) => lane.destinationCountry!)
          .filter(isSellableMarketCode)
      ),
    ];
  }

  return [inferMarketFromLocation(location)];
}

function isSellableMarketCode(value: string): value is SellableMarketCode {
  return ["CN", "JP", "US", "EU", "GLOBAL", "UNKNOWN"].includes(value);
}

export function locationMatchesPlatformMarket(
  location: {
    region?: string | null;
    code?: string | null;
    name?: string | null;
    fulfillableMarkets?: string[];
    capabilities?: Array<{ code: string; enabled?: boolean }>;
    shippingLanesFrom?: Array<{
      laneType: string;
      destinationCountry: string | null;
      active: boolean;
    }>;
  },
  platform: Pick<ListingCoveragePlatform, "country" | "code">
) {
  return locationMatchesMarket(location, inferMarketFromPlatform(platform));
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
    for (const market of fulfillmentMarketsForLocation(location)) {
      const current = ensure(market);
      current.sellableQty += location.qty;
      current.locationNames.add(`${location.code} ${location.name}`.trim());
    }
  }

  for (const location of input.inTransitLocations) {
    const market = inferMarketFromLocation(location);
    const current = ensure(market);
    current.inTransitQty += location.qty;
  }

  for (const unit of input.itemUnits) {
    const markets = unit.sellable
      ? (unit.fulfillableMarkets ?? [
          inferMarketFromLocation({ region: unit.locationRegion, name: unit.locationName }),
        ])
      : [inferMarketFromLocation({ region: unit.locationRegion, name: unit.locationName })];
    for (const market of markets) {
      if (!isSellableMarketCode(market)) continue;
      const current = ensure(market);
      if (unit.sellable) {
        current.locationNames.add(unit.locationName);
      }
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
