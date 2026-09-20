import type {
  ListingCoverageProduct,
  ListingCoverageVariantRow,
  ListingRecord,
} from "@/lib/application/listing-coverage";
import { isReplenishmentAlert, type ReplenishmentDecision } from "@/lib/application/replenishment";

export interface ReplenishmentViewFilters {
  q?: string;
  kind?: string;
  category?: string;
  risk?: string;
  status?: string;
  stockType?: string;
}

export type ReplenishmentPoolFilter =
  | "all"
  | "urgent"
  | "soon"
  | "healthy"
  | "slow"
  | "insufficient"
  | "excluded";

export interface ReplenishmentPoolRow {
  product: ListingCoverageProduct;
  variant: ListingCoverageVariantRow;
  decision: ReplenishmentDecision | undefined;
}

export interface ReplenishmentPoolGroup {
  key: string;
  product: ListingCoverageProduct;
  /** Only the variants matching the current URL and pool filters. */
  rows: ReplenishmentPoolRow[];
  /** Matching variants before the pool filter, after global SKU deduplication. */
  totalVariantCount: number;
}

export function isExcludedReplenishmentRow(row: ReplenishmentPoolRow): boolean {
  return (
    row.decision?.status === "paused" ||
    row.decision?.status === "non_replenishable" ||
    (row.variant.catalogStatus ?? row.product.catalogStatus) === "disabled" ||
    (row.variant.productKind ?? row.product.productKind) === "USED"
  );
}

export function isSlowReplenishmentRow(row: ReplenishmentPoolRow): boolean {
  const stocking = row.variant.stockingDecision;
  return Boolean(
    row.variant.sellableQty > 0 &&
      stocking &&
      (stocking.pool === "pressure" ||
        stocking.pool === "clearance" ||
        stocking.pool === "slowProfit" ||
        (stocking.sales30Qty === 0 && stocking.sales90Qty > 0))
  );
}

export function replenishmentCategoryFor(
  row: ReplenishmentPoolRow
): Exclude<ReplenishmentPoolFilter, "all"> {
  if (isExcludedReplenishmentRow(row)) return "excluded";
  if (row.decision?.status === "out_of_stock" || row.decision?.status === "reorder_now") {
    return "urgent";
  }
  if (row.decision?.status === "reorder_soon") return "soon";
  if (isSlowReplenishmentRow(row)) return "slow";
  if (!row.decision || row.decision.status === "insufficient_data") return "insufficient";
  return "healthy";
}

function compareReplenishmentRows(a: ReplenishmentPoolRow, b: ReplenishmentPoolRow): number {
  const priority = (b.decision?.priority ?? 0) - (a.decision?.priority ?? 0);
  if (priority !== 0) return priority;
  const coverageA = a.decision?.coverageDays ?? Number.POSITIVE_INFINITY;
  const coverageB = b.decision?.coverageDays ?? Number.POSITIVE_INFINITY;
  if (coverageA !== coverageB) return coverageA - coverageB;
  return a.variant.skuCode.localeCompare(b.variant.skuCode);
}

/** Display and paginate product groups while preserving every SKU's own forecast. */
export function buildReplenishmentPoolGroups(
  products: ListingCoverageProduct[],
  filters: ReplenishmentViewFilters = {},
  category: ReplenishmentPoolFilter = "all"
): ReplenishmentPoolGroup[] {
  const bySku = new Map<string, ReplenishmentPoolRow>();
  for (const product of products) {
    for (const variant of product.variantRows) {
      if (!matchesReplenishmentVariant(product, variant, filters)) continue;
      const row = { product, variant, decision: variant.replenishment };
      const previous = bySku.get(variant.skuId);
      if (!previous || (!previous.decision && row.decision)) bySku.set(variant.skuId, row);
    }
  }

  const byGroup = new Map<string, ReplenishmentPoolGroup>();
  for (const row of bySku.values()) {
    let group = byGroup.get(row.product.key);
    if (!group) {
      group = { key: row.product.key, product: row.product, rows: [], totalVariantCount: 0 };
      byGroup.set(group.key, group);
    }
    group.totalVariantCount += 1;
    if (category === "all" || replenishmentCategoryFor(row) === category) group.rows.push(row);
  }

  const groups = [...byGroup.values()].filter((group) => group.rows.length > 0);
  for (const group of groups) group.rows.sort(compareReplenishmentRows);
  return groups.sort(
    (a, b) => compareReplenishmentRows(a.rows[0], b.rows[0]) || a.key.localeCompare(b.key)
  );
}

/** A mixed-status group can appear in multiple tabs; each tab counts it once. */
export function countReplenishmentPoolGroups(
  groups: ReplenishmentPoolGroup[]
): Record<ReplenishmentPoolFilter, number> {
  const counts: Record<ReplenishmentPoolFilter, number> = {
    all: groups.length,
    urgent: 0,
    soon: 0,
    healthy: 0,
    slow: 0,
    insufficient: 0,
    excluded: 0,
  };
  for (const group of groups) {
    for (const category of new Set(group.rows.map(replenishmentCategoryFor))) counts[category] += 1;
  }
  return counts;
}

export type ReplenishmentViewProduct = Pick<
  ListingCoverageProduct,
  "skuName" | "skuCode" | "brand" | "category" | "productKind"
> & { records: Pick<ListingRecord, "skuId" | "status" | "risks">[] };

export type ReplenishmentViewVariant = Pick<
  ListingCoverageVariantRow,
  | "skuId"
  | "skuName"
  | "skuCode"
  | "brand"
  | "category"
  | "productKind"
  | "sellableLotQty"
  | "sellableItemUnitCount"
  | "replenishment"
>;

/** Shared by the SKU table and its summary counts, without loading server data. */
export function matchesReplenishmentVariant(
  product: ReplenishmentViewProduct,
  variant: ReplenishmentViewVariant,
  filters: ReplenishmentViewFilters
): boolean {
  const kind = variant.productKind ?? product.productKind;
  if (filters.kind && kind !== filters.kind) return false;
  if (filters.category && (variant.category ?? product.category)?.trim() !== filters.category) {
    return false;
  }

  const keyword = filters.q?.trim().toLowerCase();
  if (keyword) {
    const matchesProduct = [product.skuName, product.skuCode, product.brand ?? ""].some((value) =>
      value.toLowerCase().includes(keyword)
    );
    const matchesVariant = [
      variant.skuName,
      variant.skuCode,
      variant.brand ?? "",
      variant.category ?? product.category ?? "",
    ].some((value) => value.toLowerCase().includes(keyword));
    if (!matchesProduct && !matchesVariant) return false;
  }

  const records = product.records.filter((record) => record.skuId === variant.skuId);
  if (filters.risk === "replenishment" && !isReplenishmentAlert(variant.replenishment))
    return false;
  if (filters.risk === "stockout" && variant.replenishment?.status !== "out_of_stock") return false;
  if (
    filters.risk &&
    !["replenishment", "stockout"].includes(filters.risk) &&
    !(filters.risk === "lowStock" && isReplenishmentAlert(variant.replenishment)) &&
    !records.some((record) => record.risks.some((risk) => risk.key === filters.risk))
  ) {
    return false;
  }
  if (
    filters.status &&
    !(filters.status === "SOLD_OUT" && variant.replenishment?.status === "out_of_stock") &&
    !records.some((record) => record.status === filters.status)
  ) {
    return false;
  }

  if (filters.stockType) {
    const hasLots = variant.sellableLotQty > 0;
    const hasItems = variant.sellableItemUnitCount > 0;
    const noStock = !hasLots && !hasItems;
    // A sold-out SKU must remain visible when a stock-form filter is selected.
    if (filters.stockType === "LOT" && !(hasLots && !hasItems) && !(noStock && kind === "NEW")) {
      return false;
    }
    if (
      filters.stockType === "ITEM_UNIT" &&
      !(hasItems && !hasLots) &&
      !(noStock && kind === "USED")
    ) {
      return false;
    }
    if (filters.stockType === "MIXED" && !(hasLots && hasItems)) return false;
  }
  return true;
}

/** Keep stock cards and the operating table on the same conservative day display. */
export function formatReplenishmentCoverage(decision?: ReplenishmentDecision): string {
  if (!decision || decision.coverageDays === null) return "—";
  if (decision.coverageDays === 0) return "已售罄";
  if (decision.coverageDays < 1) return "不足 1 天";
  if (decision.coverageDays > 365) return ">365 天";
  return `${Math.floor(decision.coverageDays)} 天`;
}
