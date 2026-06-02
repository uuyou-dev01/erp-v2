import type { StockLocationBreakdown } from "@/lib/application/inventory";

export type ListingStatus = "ACTIVE" | "DELISTED" | "SOLD_OUT" | string;

export interface ListingOpsPlatform {
  id: string;
  name: string;
  code: string;
}

export interface ListingOpsRisk {
  key: string;
  label: string;
  tone: "amber" | "red" | "slate";
}

export interface ListingOpsItem {
  id: string;
  listingType: "SKU" | "ITEM_UNIT";
  status: ListingStatus;
  skuId: string | null;
  itemUnitId: string | null;
  skuCode: string;
  skuName: string;
  imageUrl: string | null;
  platform: ListingOpsPlatform;
  listedPrice: string | null;
  currency: string | null;
  platformFeeRate: string | null;
  defaultShippingFee: string | null;
  estimatedNet: string | null;
  listedAt: string;
  updatedAt: string;
  sellableQty: number;
  sellableLocations: StockLocationBreakdown[];
  risks: ListingOpsRisk[];
}

export interface ListingOpsStats {
  activeCount: number;
  delistedCount: number;
  soldOutCount: number;
  lowStockCount: number;
  unpricedCount: number;
  staleCount: number;
}
