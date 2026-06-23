# ItemUnit SKU Inventory UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ItemUnit behave consistently as a single tracked inventory unit under a child SKU across sellable inventory, SKU detail, listing, labeling, photos, and accounting views.

**Architecture:** Keep `SKU` as the product hierarchy and keep `InventoryLot` / `ItemUnit` as inventory identities under a concrete child SKU. Add focused application helpers for SKU-level inventory summaries, then update UI surfaces to show new stock and single-unit stock side by side without treating ItemUnit as a separate product catalog. Accounting continues to use `OrderLine.skuId` for product reporting and `OrderAllocation` for cost source, with `ITEM_UNIT` allocations contributing the unit's own cost.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma, PostgreSQL, Decimal.js, Vitest, shadcn/ui, Tailwind CSS.

---

## Discussion Summary

- `ItemUnit` is one of the core concepts of this ERP. It represents a specific physical unit under a concrete child SKU, not a sibling concept to SKU.
- Parent SKU is a product group or series. Child SKU is the tradable specification. `InventoryLot` and `ItemUnit` sit under the child SKU.
- `InventoryLot` is for homogeneous quantity stock, usually new goods.
- `ItemUnit` is for used, defective, unique, consigned, photographed, labeled, or compliance-tracked units.
- The current "单件商品" page is conceptually useful but visually misleading because it behaves like a separate product list. It should become a "单件库存" workbench and remain linked to parent/child SKU context.
- The sellable inventory card should not expand inline. Clicking the details control should open a modal. The compact card should already show new-stock listing state and single-unit listing state.
- SKU detail should make ItemUnit visible as part of the SKU inventory section, split from batch stock but counted into the same SKU and parent SKU accounting.
- Later compliance workflows need item labels and photos. ItemUnit needs a stable display code or label code that can be printed/scanned, plus photo completeness and label status.

## File Structure

- Modify `prisma/schema.prisma`: add ItemUnit fields for stable single-unit code, label status, and label timestamp if not already present.
- Create or modify `lib/application/item-unit-identity.ts`: generate and format single-unit codes and label codes.
- Modify `lib/application/listing-coverage.ts`: enrich sellable inventory products with new-stock and item-unit listing summaries.
- Modify `components/inventory/sku-card-grid.tsx`: replace inline expansion with a details modal and compact card summary.
- Create `components/inventory/sku-inventory-detail-dialog.tsx`: modal that splits new batch stock and single-unit stock.
- Modify `lib/application/sku-catalog.ts`: expose SKU detail inventory sections for lots and item units.
- Modify `app/(dashboard)/inventory/skus/[id]/page.tsx`: display ItemUnit under SKU detail inventory sections and explain accounting source.
- Modify `app/(dashboard)/inventory/items/page.tsx`: reposition global ItemUnit page as a single-unit workbench, not a product catalog.
- Modify `components/inventory/item-unit-form.tsx`: support photos and label fields in create/edit workflows.
- Modify `app/actions/item-units.ts`: persist label/photo fields and expose structured action failures.
- Test with `tests/application/item-units-action.test.ts`, `tests/application/sku-stock-consistency.test.ts`, and a new source-level interaction test for the sellable card/modal behavior.

---

### Task 1: Add Stable ItemUnit Identity And Label Fields

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/application/item-unit-identity.ts`
- Modify: `lib/application/inventory.ts`
- Modify: `app/actions/item-units.ts`
- Test: `tests/application/item-units-action.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that creates an item unit through the action and verifies that it gets a stable single-unit code and label status.

```ts
it("creates item units with a stable unit code and pending label status", async () => {
  const store = await prisma.store.create({
    data: {
      id: `store_item_label_${runId}`,
      code: `STORE_ITEM_LABEL_${runId}`,
      name: "Item Label Store",
      currency: "CNY",
    },
  });
  const sku = await prisma.sKU.create({
    data: {
      storeId: store.id,
      code: `SKU_ITEM_LABEL_${runId}`,
      name: "Labelled Item SKU",
    },
  });
  const location = await prisma.location.create({
    data: {
      storeId: store.id,
      code: `WH_ITEM_LABEL_${runId}`,
      name: "Item Label Warehouse",
      type: "WAREHOUSE",
    },
  });

  const result = await createItemUnitAction({
    storeId: store.id,
    skuId: sku.id,
    locationId: location.id,
    unitCost: "100",
    costCurrency: "CNY",
    conditionGrade: "A",
    photos: ["https://example.com/item-a.jpg"],
  });

  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error);

  const item = await prisma.itemUnit.findUniqueOrThrow({
    where: { id: result.id },
    select: { unitCode: true, labelCode: true, labelStatus: true, photos: true },
  });
  expect(item.unitCode).toMatch(/^IU-/);
  expect(item.labelCode).toBe(item.unitCode);
  expect(item.labelStatus).toBe("PENDING");
  expect(item.photos).toEqual(["https://example.com/item-a.jpg"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/application/item-units-action.test.ts
```

Expected: FAIL because `unitCode`, `labelCode`, and `labelStatus` do not exist yet.

- [ ] **Step 3: Add schema fields**

Add fields to `model ItemUnit` in `prisma/schema.prisma`:

```prisma
  unitCode       String?
  labelCode      String?
  labelStatus    String   @default("PENDING") // PENDING, PRINTED, ATTACHED
  labelPrintedAt DateTime?

  @@unique([storeId, unitCode])
  @@unique([storeId, labelCode])
```

- [ ] **Step 4: Add identity helper**

Create `lib/application/item-unit-identity.ts`:

```ts
import type { Prisma } from "@prisma/client";

export function formatItemUnitCode(sequence: number, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `IU-${y}${m}${d}-${String(sequence).padStart(6, "0")}`;
}

export async function generateItemUnitCode(
  tx: Prisma.TransactionClient,
  storeId: string,
  date = new Date()
) {
  const dayPrefix = formatItemUnitCode(0, date).slice(0, -6);
  const count = await tx.itemUnit.count({
    where: {
      storeId,
      unitCode: { startsWith: dayPrefix },
    },
  });
  return formatItemUnitCode(count + 1, date);
}
```

- [ ] **Step 5: Persist codes when creating ItemUnit**

In `createInboundItemUnit` in `lib/application/inventory.ts`, call `generateItemUnitCode(tx, input.storeId, input.receivedAt)` before `tx.itemUnit.create`, then set:

```ts
      unitCode,
      labelCode: unitCode,
      labelStatus: "PENDING",
```

In `createItemUnit` in `app/actions/item-units.ts`, call `generateItemUnitCode(tx, data.storeId)` inside the transaction and set the same fields.

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npm test -- tests/application/item-units-action.test.ts
```

Expected: PASS.

---

### Task 2: Enrich Sellable Inventory Data With New Stock And ItemUnit Summaries

**Files:**
- Modify: `lib/application/listing-coverage.ts`
- Test: `tests/application/listing-pending.test.ts` or `tests/application/sku-stock-consistency.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that creates one SKU with both lot stock and two ItemUnits, then verifies the sellable product summary separates new stock from single-unit stock.

```ts
expect(product?.newStockSummary).toMatchObject({
  sellableQty: 5,
  activeListingCount: 1,
});
expect(product?.itemUnitSummary).toMatchObject({
  sellableCount: 2,
  activeListingCount: 1,
  pendingPhotoCount: 1,
  pendingLabelCount: 2,
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/application/sku-stock-consistency.test.ts
```

Expected: FAIL because `newStockSummary` and `itemUnitSummary` are not exposed.

- [ ] **Step 3: Extend `ListingCoverageProduct`**

In `lib/application/listing-coverage.ts`, add:

```ts
export interface StockChannelSummary {
  sellableQty: number;
  activeListingCount: number;
  pendingListingCount: number;
}

export interface ItemUnitChannelSummary {
  sellableCount: number;
  activeListingCount: number;
  pendingListingCount: number;
  pendingPhotoCount: number;
  pendingLabelCount: number;
}
```

Add these fields to `ListingCoverageProduct`:

```ts
  newStockSummary: StockChannelSummary;
  itemUnitSummary: ItemUnitChannelSummary;
```

- [ ] **Step 4: Compute the summaries**

When building each product, compute:

```ts
const activeSkuListings = records.filter(
  (record) => record.listingScope === "SKU" && record.status === "ACTIVE"
).length;
const activeItemListings = records.filter(
  (record) => record.listingScope === "ITEM_UNIT" && record.status === "ACTIVE"
).length;
const sellableItemUnits = itemUnits.filter((unit) => unit.sellable);

newStockSummary: {
  sellableQty: sellableLotQty,
  activeListingCount: activeSkuListings,
  pendingListingCount: Math.max(0, availablePlatforms.length - activeSkuListings),
},
itemUnitSummary: {
  sellableCount: sellableItemUnits.length,
  activeListingCount: activeItemListings,
  pendingListingCount: sellableItemUnits.filter((unit) => unit.listingCount === 0).length,
  pendingPhotoCount: sellableItemUnits.filter((unit) => unit.photoCount === 0).length,
  pendingLabelCount: sellableItemUnits.filter((unit) => unit.labelStatus !== "ATTACHED").length,
},
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/application/sku-stock-consistency.test.ts
```

Expected: PASS.

---

### Task 3: Replace Sellable Card Inline Expansion With Details Modal

**Files:**
- Modify: `components/inventory/sku-card-grid.tsx`
- Create: `components/inventory/sku-inventory-detail-dialog.tsx`
- Test: `tests/application/inventory-interaction-source.test.ts`

- [ ] **Step 1: Write the failing source test**

Add assertions:

```ts
expect(source).toContain("SkuInventoryDetailDialog");
expect(source).not.toContain("variantsExpanded");
expect(source).not.toContain("setVariantsExpanded");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/application/inventory-interaction-source.test.ts
```

Expected: FAIL because `sku-card-grid.tsx` still uses inline expansion.

- [ ] **Step 3: Create modal component**

Create `components/inventory/sku-inventory-detail-dialog.tsx` with props:

```ts
import { X, Package, Tag, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SkuCardVariantStock } from "@/app/actions/sku-card-overviews";

interface SkuInventoryDetailDialogProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  variant: SkuCardVariantStock | null;
}
```

The dialog body must render two sections:

```tsx
<section>
  <h3>新品批次</h3>
  <p>可售 {variant.newStockCount}</p>
  <p>平台：{variant.newStockPlatforms.map((p) => p.name).join(" / ") || "未上架"}</p>
</section>
<section>
  <h3>单件库存</h3>
  {variant.usedItems.map((item) => (
    <article key={item.id}>
      <p>{item.code}</p>
      <Badge>{item.condition}</Badge>
      <p>{item.status}</p>
      <p>{item.platforms.map((p) => p.name).join(" / ") || "未上架"}</p>
    </article>
  ))}
</section>
```

- [ ] **Step 4: Update compact card summary**

In `components/inventory/sku-card-grid.tsx`, remove inline expansion state and add modal state:

```ts
const [detailVariant, setDetailVariant] = useState<SkuCardVariantStock | null>(null);
```

On each card, show:

```tsx
<p>新品 {active.newStockCount} · 单件 {active.usedItems.length}</p>
<p>
  新品上架 {active.newStockPlatforms.length}
  {" · "}
  单件上架 {active.usedItems.filter((item) => item.platforms.length > 0).length}
</p>
```

Replace "展开" with:

```tsx
<Button variant="ghost" size="sm" onClick={() => setDetailVariant(active)}>
  详情
</Button>
```

Render:

```tsx
<SkuInventoryDetailDialog
  open={Boolean(detailVariant)}
  onClose={() => setDetailVariant(null)}
  productName={product.name}
  variant={detailVariant}
/>
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/application/inventory-interaction-source.test.ts
```

Expected: PASS.

---

### Task 4: Make SKU Detail Show ItemUnits Under The SKU Inventory Section

**Files:**
- Modify: `lib/application/sku-catalog.ts`
- Modify: `app/(dashboard)/inventory/skus/[id]/page.tsx`
- Test: `tests/application/sku-catalog-detail.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that creates a SKU with one lot and one ItemUnit, then checks the SKU detail exposes separate inventory sections:

```ts
expect(detail?.inventorySections.newStock.totalQty).toBe("2");
expect(detail?.inventorySections.itemUnits.totalCount).toBe(1);
expect(detail?.inventorySections.itemUnits.items[0]).toMatchObject({
  conditionGrade: "A",
  labelStatus: "PENDING",
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/application/sku-catalog-detail.test.ts
```

Expected: FAIL because `inventorySections` is not exposed.

- [ ] **Step 3: Extend `SkuCatalogDetail`**

In `lib/application/sku-catalog.ts`, add:

```ts
inventorySections: {
  newStock: {
    totalQty: string;
    lots: Array<{
      id: string;
      locationName: string;
      quantity: string;
      unitCost: string;
      costCurrency: string;
      receivedAt: string;
    }>;
  };
  itemUnits: {
    totalCount: number;
    items: Array<{
      id: string;
      unitCode: string | null;
      labelCode: string | null;
      labelStatus: string;
      conditionGrade: string | null;
      locationName: string;
      unitCost: string;
      costCurrency: string;
      photoCount: number;
      status: string;
    }>;
  };
};
```

- [ ] **Step 4: Query lots and item units in detail loader**

In `getSkuCatalogDetail`, include active lots with location and item units with location. Use StockLedger sums for lot quantities. Return `inventorySections`.

- [ ] **Step 5: Render sections on SKU detail page**

In `app/(dashboard)/inventory/skus/[id]/page.tsx`, replace the generic inventory distribution block with:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-sm font-medium">库存结构</CardTitle>
  </CardHeader>
  <CardContent className="grid gap-4 lg:grid-cols-2">
    <section>
      <h3 className="text-sm font-semibold">新品批次</h3>
      ...
    </section>
    <section>
      <h3 className="text-sm font-semibold">单件库存</h3>
      ...
    </section>
  </CardContent>
</Card>
```

Add a short accounting line:

```tsx
<p className="text-xs text-muted-foreground">
  售出时收入归属当前 SKU；批次成本来自 Lot，单件成本来自 ItemUnit。
</p>
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npm test -- tests/application/sku-catalog-detail.test.ts
```

Expected: PASS.

---

### Task 5: Reposition The Global Single-Unit Page As A Workbench

**Files:**
- Modify: `app/(dashboard)/inventory/items/page.tsx`
- Modify: `app/actions/item-units.ts`
- Test: `tests/application/item-units-action.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test for `getItemUnits` that verifies rows expose SKU hierarchy, label status, and photo count:

```ts
expect(rows[0]).toMatchObject({
  unitCode: expect.stringMatching(/^IU-/),
  labelStatus: "PENDING",
  photoCount: 1,
});
expect(rows[0].sku.parentSku.code).toBe(parent.code);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/application/item-units-action.test.ts
```

Expected: FAIL until `getItemUnits` serializes these fields.

- [ ] **Step 3: Serialize ItemUnit workbench data**

In `app/actions/item-units.ts`, return:

```ts
photoCount: Array.isArray(item.photos) ? item.photos.length : 0,
labelStatus: item.labelStatus,
unitCode: item.unitCode,
labelCode: item.labelCode,
```

- [ ] **Step 4: Update page columns and stats**

In `app/(dashboard)/inventory/items/page.tsx`, change page language to "单件库存工作台". Add stats:

```ts
pendingLabel: items.filter((i) => i.labelStatus !== "ATTACHED").length,
pendingPhoto: items.filter((i) => i.photoCount === 0).length,
listed: items.filter((i) => i.listings?.some((listing) => listing.status === "ACTIVE")).length,
```

Add columns:

```tsx
单件编号: row.unitCode ?? formatShortEntityId(row.id)
SKU: parent SKU / child SKU
标签: row.labelStatus
图片: row.photoCount
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/application/item-units-action.test.ts
```

Expected: PASS.

---

### Task 6: Verify Accounting Stays SKU-Based And Cost-Source-Based

**Files:**
- Modify only if needed: `app/actions/customer-orders.ts`, `app/actions/listings.ts`, `app/actions/reports.ts`
- Test: `tests/application/order-detail-profit.test.ts`
- Test: `tests/application/monthly-pnl-cogs.test.ts`

- [ ] **Step 1: Write the regression test**

Create one order line with `skuId` pointing at the child SKU and `OrderAllocation.allocationType = "ITEM_UNIT"` pointing at an item unit with `unitCost = 80`. Verify reporting uses SKU revenue and ItemUnit cost.

```ts
expect(orderProfit.lines[0]).toMatchObject({
  skuId: childSku.id,
  allocatedCost: "80.00",
});
expect(parentRollup.grossProfit).toBe("100.00");
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run:

```bash
npm test -- tests/application/order-detail-profit.test.ts tests/application/monthly-pnl-cogs.test.ts
```

Expected: PASS if the current accounting already follows `OrderLine.skuId` + `OrderAllocation` cost. If it fails, fix only the failing rollup query.

- [ ] **Step 3: Fix rollup only if needed**

If a rollup ignores `ITEM_UNIT`, update the query to sum:

```ts
const allocatedInventoryCost = line.allocations.reduce(
  (sum, allocation) => sum.plus(new Decimal(allocation.costAmount.toString())),
  new Decimal(0)
);
```

Do not introduce ItemUnit as a product dimension in accounting.

- [ ] **Step 4: Run accounting tests**

Run:

```bash
npm test -- tests/application/order-detail-profit.test.ts tests/application/monthly-pnl-cogs.test.ts
```

Expected: PASS.

---

## Verification

Run these commands after implementation:

```bash
npm run typecheck
npm test -- tests/application/item-units-action.test.ts tests/application/sku-stock-consistency.test.ts tests/application/sku-catalog-detail.test.ts tests/application/inventory-interaction-source.test.ts tests/application/order-detail-profit.test.ts tests/application/monthly-pnl-cogs.test.ts
npm run build
```

Expected:

- TypeScript exits 0.
- Vitest reports all selected files passing.
- Next build completes successfully.

## Self-Review

- Spec coverage: The plan covers ItemUnit identity, label/photo readiness, sellable inventory modal behavior, SKU detail inventory sections, global single-unit workbench, and accounting semantics.
- Placeholder scan: No TBD/TODO placeholders are present.
- Type consistency: The plan consistently treats `ItemUnit` as inventory under `skuId`, not as a product catalog entity.
