# Sellable Board Variant Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sellable inventory board show parent SKU groups while ensuring every actionable number, location, platform coverage, and listing action is scoped to the selected child SKU variant and current pallet filter.

**Architecture:** Keep parent SKU/display group as the card container, but introduce a derived "view model" for the active variant and active pallet scope. The list card defaults to the best matching child SKU for the current market/location filter, and the detail modal lets users switch variants; both card and modal use the same scoped calculations.

**Tech Stack:** Next.js App Router, React client components, Prisma-backed server aggregation, Vitest-style application tests already present in `tests/application`.

---

## Current Diagnosis

The current page mixes three layers:

1. **Parent SKU / display group:** useful for collapsing `火影忍者 晓组织` into one card.
2. **Child SKU / variant:** the real sellable target for stock, location, SKU listing, and price.
3. **Account/store listing:** future layer where a user or account can "take" a pallet item and publish it under their own account.

The current card reads too much from `product`:

- Top quantity uses parent/group `sellableQty`.
- Location uses parent/group `sellableLocations`.
- Platform strip uses parent/group `records`.
- New/used channel boxes use parent/group summaries.
- `上架` opens from the parent/group SKU instead of the active child SKU.

This is why the card feels wrong when a parent has variants, and why market/location filters do not visibly reshape the card enough.

## Target Product Behavior

### Card Behavior

- A card still represents one parent SKU/display group.
- If it has variants, the card must choose one **active variant** for the current filter context.
- The card header may still show parent/group name, but the operational area must clearly show:
  - active child SKU image/name/code,
  - active child SKU sellable qty in the current market/location,
  - active child SKU location,
  - active child SKU platform coverage,
  - active child SKU new/used numbers,
  - active child SKU `上架` action.

### Filter Behavior

- Market filter (`market=CN`, `market=JP`) must change:
  - which variants are considered available,
  - displayed sellable quantities,
  - displayed locations,
  - platform target set,
  - pending platform counts.
- Location filter (`locationId=...`) must further narrow:
  - quantities,
  - location label,
  - cards that remain visible,
  - selected variant default.

### Account/采货 Future Behavior

This should not be fully built in this pass, but the design should reserve the concept:

- Pallet stock can be visible to multiple people/accounts.
- A seller account can create its own listing against a shared inventory source.
- When sold, the order consumes the shared underlying Lot/ItemUnit.
- Listing ownership/account and inventory ownership are separate concepts.

For now, rename/structure actions so they do not imply "this stock belongs to the lister":

- short-term button remains `上架`;
- data model later needs `ListingAccount` or `SalesAccount`;
- `Listing` later needs `accountId` / `ownerUserId` / `sourceInventoryRef`.

---

## Files

- Modify: `lib/application/listing-coverage.ts`
  - Add scoped variant fields and helper functions.
  - Make variant rows carry enough data for card-level rendering.
- Modify: `components/listing/listing-coverage-card.tsx`
  - Render card from `activeVariantView`, not parent aggregate.
  - Keep parent name as grouping context.
- Modify: `components/listing/listing-coverage-grid.tsx`
  - Pass market/location scope consistently.
- Modify: `app/(dashboard)/inventory/sellable/page.tsx`
  - Filter and stats should use scoped sellable products, not unscoped parent totals.
- Modify: `components/listing/sellable-inventory-stats.tsx`
  - Update copy if stats become scoped.
- Test: `tests/application/sku-stock-consistency.test.ts`
  - Extend parent/child coverage tests.
- Test: `tests/application/sellable-market.test.ts`
  - Add market filtering expectations if needed.

---

## Task 1: Define Scoped Variant View Model

**Files:**
- Modify: `lib/application/listing-coverage.ts`
- Test: `tests/application/sku-stock-consistency.test.ts`

- [ ] **Step 1: Add a failing test for market-scoped child SKU display**

Add a test case near the existing parent rollup coverage tests:

```ts
it("keeps parent card grouping but exposes market-scoped variant quantities", async () => {
  const products = await getListingCoverageProducts("store_1");
  const group = products.find((product) => product.skuName.includes("火影忍者"));

  expect(group).toBeTruthy();
  expect(group?.variantRows.length).toBeGreaterThan(1);

  const cnVariant = group!.variantRows.find((variant) =>
    variant.sellableLocations.some((location) => location.region?.startsWith("CN"))
  );

  expect(cnVariant).toBeTruthy();
  expect(cnVariant!.sellableQty).toBeGreaterThan(0);
  expect(cnVariant!.sellableLocations.every((location) => location.region?.startsWith("CN"))).toBe(
    true
  );
});
```

- [ ] **Step 2: Run the targeted test**

Run:

```bash
npm test -- tests/application/sku-stock-consistency.test.ts
```

Expected: fails until scoped fields/helpers exist or fixture needs adapting.

- [ ] **Step 3: Add scoped helper types**

Add to `lib/application/listing-coverage.ts`:

```ts
export interface ListingCoverageVariantView extends ListingCoverageVariantRow {
  scopedSellableQty: number;
  scopedSellableLotQty: number;
  scopedSellableItemUnitCount: number;
  scopedInTransitQty: number;
  scopedSellableLocations: StockLocationBreakdown[];
  scopedInTransitLocations: StockLocationBreakdown[];
  scopedRecords: ListingRecord[];
  scopedPlatforms: ListingCoveragePlatform[];
}
```

- [ ] **Step 4: Add helper signatures**

Add pure helpers near existing market/location logic:

```ts
export function buildVariantView(input: {
  variant: ListingCoverageVariantRow;
  records: ListingRecord[];
  platforms: ListingCoveragePlatform[];
  market?: SellableMarketCode;
  locationId?: string;
}): ListingCoverageVariantView {
  const sellableLocations = input.variant.sellableLocations.filter((location) => {
    if (input.market && inferMarketFromLocation(location) !== input.market) return false;
    if (input.locationId && location.locationId !== input.locationId) return false;
    return true;
  });

  const inTransitLocations = input.variant.inTransitLocations.filter((location) => {
    if (input.market && inferMarketFromLocation(location) !== input.market) return false;
    if (input.locationId && location.locationId !== input.locationId) return false;
    return true;
  });

  const scopedRecords = input.records.filter((record) => record.skuId === input.variant.skuId);
  const scopedPlatforms = input.market
    ? input.platforms.filter((platform) => isPlatformTargetForMarket(platform, input.market!))
    : input.platforms;

  return {
    ...input.variant,
    scopedSellableQty: sellableLocations.reduce((sum, location) => sum + location.qty, 0),
    scopedSellableLotQty: sellableLocations.reduce((sum, location) => sum + location.qty, 0),
    scopedSellableItemUnitCount: input.variant.sellableItemUnitCount,
    scopedInTransitQty: inTransitLocations.reduce((sum, location) => sum + location.qty, 0),
    scopedSellableLocations: sellableLocations,
    scopedInTransitLocations: inTransitLocations,
    scopedRecords,
    scopedPlatforms,
  };
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/application/sku-stock-consistency.test.ts
npm run typecheck
```

Expected: pass.

---

## Task 2: Make Card Display Follow Active Variant

**Files:**
- Modify: `components/listing/listing-coverage-card.tsx`

- [ ] **Step 1: Choose active variant from filter context**

Inside `ListingCoverageCard`, derive an active variant:

```ts
const activeVariant =
  selectedVariant ??
  product.variantRows.find((variant) =>
    variant.sellableLocations.some((location) => {
      if (focusLocationId && location.locationId !== focusLocationId) return false;
      if (focusMarket && inferMarketFromLocation(location) !== focusMarket) return false;
      return true;
    })
  ) ??
  product.variantRows[0] ??
  null;
```

- [ ] **Step 2: Replace card header operational display**

Card should show:

- parent/group name as the card title when there are multiple variants;
- active variant as the operational subtitle;
- active variant image as the visible image if present;
- quantity from active variant scoped qty.

Example layout:

```tsx
<ProductImage
  src={activeVariant?.imageUrl ?? product.imageUrl}
  alt={activeVariant?.skuName ?? product.skuName}
  size="sm"
  className="shrink-0 rounded-md"
/>
<div className="min-w-0 flex-1">
  <p className="truncate text-sm font-medium leading-tight">{product.skuName}</p>
  {activeVariant ? (
    <p className="truncate text-[11px] text-muted-foreground">
      {activeVariant.skuName}
    </p>
  ) : null}
</div>
```

- [ ] **Step 3: Replace platform strip input**

Build the platform state from active variant records:

```ts
const cardRecords = activeVariant
  ? product.records.filter((record) => record.skuId === activeVariant.skuId)
  : product.records;
const cardPlatforms = activeVariant
  ? platformStateFromRecords(displayPlatforms, cardRecords)
  : displayPlatforms;
```

Then pass `cardPlatforms` to `ListingPlatformStrip`.

- [ ] **Step 4: Make `上架` target child SKU**

When `activeVariant` exists, `QuickAddListingDialog` and catalog links should use the active child SKU where possible. The button label can remain `上架`, but the dialog context should be child SKU.

- [ ] **Step 5: Run checks**

Run:

```bash
npm run typecheck
npm run build
```

Expected: pass.

---

## Task 3: Make Page Stats and Card Filtering Match Current Pallet Scope

**Files:**
- Modify: `app/(dashboard)/inventory/sellable/page.tsx`
- Modify: `lib/application/listing-coverage.ts`
- Modify: `components/listing/sellable-inventory-stats.tsx`

- [ ] **Step 1: Add helper for scoped product inclusion**

Current `productHasMarket` and `productHasLocation` only decide visibility. Add a helper that answers whether a product has a variant with actual scoped sellable qty:

```ts
function productHasScopedVariant(
  product: ListingCoverageProduct,
  market?: SellableMarketCode,
  locationId?: string
) {
  return product.variantRows.some((variant) =>
    variant.sellableLocations.some((location) => {
      if (market && inferMarketFromLocation(location) !== market) return false;
      if (locationId && location.locationId !== locationId) return false;
      return location.qty > 0;
    })
  );
}
```

- [ ] **Step 2: Use scoped products for stats**

Change:

```ts
const stats = computeSellableInventoryStats(scopedProducts);
```

to use only products with scoped available variants:

```ts
const visibleScopedProducts = scopedProducts.filter((product) =>
  productHasScopedVariant(product, selectedMarket, params.locationId)
);
const stats = computeSellableInventoryStats(visibleScopedProducts);
```

- [ ] **Step 3: Ensure `pageProducts` uses the same scoped basis**

Make `filteredProducts` start from `visibleScopedProducts`, not `scopedProducts`.

- [ ] **Step 4: Update stat copy**

Change stats subtitles to make scope obvious:

- `可售商品`: `当前货盘`
- `已有上架`: `当前筛选`
- `待上架`: `当前筛选`
- `在售记录`: `ACTIVE`

- [ ] **Step 5: Run checks**

Run:

```bash
npm run typecheck
npm run build
```

Expected: pass.

---

## Task 4: Improve Detail Modal Variant Interaction

**Files:**
- Modify: `components/listing/listing-coverage-card.tsx`

- [ ] **Step 1: Default selected variant to card active variant**

When opening the modal, use the card active variant as default.

- [ ] **Step 2: Make the lower detail panel explicitly variant-scoped**

Rename detail sections visually:

- `新品批次` -> `当前子 SKU：新品/批次`
- `单件库存` -> `当前子 SKU：中古/单件`

- [ ] **Step 3: Make variant rows show scoped quantities**

Each variant row should show:

- current pallet sellable qty,
- total sellable qty in muted text if different,
- active platform count for the current market.

- [ ] **Step 4: Run checks**

Run:

```bash
npm run typecheck
npm run build
```

Expected: pass.

---

## Task 5: Document Future Account-Linked Listing Model

**Files:**
- Modify: `docs/domain.md`
- Modify: `docs/inventory.md`

- [ ] **Step 1: Add a short domain note**

Add:

```md
### 货盘与账号上架

货盘库存表示系统可售资源，不等于某个销售账号拥有库存。后续多账号/多店铺场景中，账号可以基于共享货盘创建自己的上架记录；成交后订单仍然回扣共享的 Lot 或 ItemUnit。Listing 的账号归属和库存归属需要分开建模。
```

- [ ] **Step 2: Add later-model fields as notes**

Document future fields:

- `Listing.accountId`
- `Listing.ownerUserId`
- `Listing.sourceInventoryType`
- `Listing.sourceInventoryId`
- `CustomerOrder.sellerAccountId`

- [ ] **Step 3: Run docs-safe checks**

Run:

```bash
npm run typecheck
```

Expected: pass.

---

## Self Review

- Spec coverage:
  - Parent SKU collapse remains.
  - Child SKU scoped display is covered by Tasks 1, 2, and 4.
  - Market/location filter changes data via Task 3.
  - Account-linked future model is documented by Task 5.
- Known limitation:
  - This plan does not implement multi-account ownership yet. It reserves terminology and documents the future model so current listing code does not paint us into a corner.

