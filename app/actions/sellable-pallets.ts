"use server";

import { getListingCoverageProducts } from "@/lib/application/listing-coverage";
import {
  marketLabel,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";
import { requireUserContext } from "@/lib/auth/user-context";

export interface SellablePalletNavItem {
  name: string;
  href: string;
  count: number;
  market?: SellableMarketCode;
}

const MARKET_ORDER: SellableMarketCode[] = ["CN", "JP", "US", "GLOBAL", "UNKNOWN"];

function palletName(market: SellableMarketCode) {
  if (market === "UNKNOWN") return "未识别货盘";
  return marketLabel(market).replace("市场", "货盘");
}

export async function getSellablePalletNavItems(
  storeId?: string
): Promise<SellablePalletNavItem[]> {
  const context = await requireUserContext({ storeId });
  const products = await getListingCoverageProducts(context.activeStoreId);
  const sellableProducts = products.filter((product) => product.sellableQty > 0);

  const productKeysByMarket = new Map<SellableMarketCode, Set<string>>();
  for (const product of sellableProducts) {
    for (const summary of product.marketSummaries) {
      if (summary.sellableQty <= 0) continue;
      let keys = productKeysByMarket.get(summary.market);
      if (!keys) {
        keys = new Set<string>();
        productKeysByMarket.set(summary.market, keys);
      }
      keys.add(product.key);
    }
  }

  const items: SellablePalletNavItem[] = [
    {
      name: "全部货盘",
      href: "/inventory/sellable",
      count: sellableProducts.length,
    },
  ];

  for (const market of MARKET_ORDER) {
    const count = productKeysByMarket.get(market)?.size ?? 0;
    if (count <= 0) continue;
    items.push({
      name: palletName(market),
      href: `/inventory/sellable?market=${market}`,
      count,
      market,
    });
  }

  return items;
}
