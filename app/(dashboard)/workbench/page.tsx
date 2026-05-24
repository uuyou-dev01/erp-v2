import { Suspense } from "react";
import {
  getWorkbenchQueueCounts,
  getWorkbenchWorkItems,
  getWorkbenchRecentActivity,
} from "@/app/actions/workbench";
import { getQuickEntries } from "@/app/actions/quick-entries";
import { getSKUs } from "@/app/actions/skus";
import { getLocations } from "@/app/actions/locations";
import { getPlatforms } from "@/app/actions/platforms";
import { getConsolidationBatches } from "@/app/actions/consolidations";
import { NextActionWorkbench } from "@/components/workbench/next-action-workbench";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function WorkbenchPage() {
  const [counts, items, recentActivity, entries, skus, locations, platforms, consolidationBatches] = await Promise.all([
    getWorkbenchQueueCounts(STORE_ID),
    getWorkbenchWorkItems(STORE_ID, undefined, 120),
    getWorkbenchRecentActivity(STORE_ID),
    getQuickEntries(STORE_ID, 20),
    getSKUs(STORE_ID),
    getLocations(STORE_ID),
    getPlatforms(STORE_ID),
    getConsolidationBatches(STORE_ID),
  ]);

  const recentEntries = entries.map((entry) => ({
    id: entry.id,
    rawBrand: entry.rawBrand,
    rawProductName: entry.rawProductName,
    rawVariant: entry.rawVariant,
    conditionType: entry.conditionType,
    purchasePrice: entry.purchasePrice,
    purchaseCurrency: entry.purchaseCurrency,
    purchaseTrackingNo: entry.purchaseTrackingNo,
    transitTrackingNo: entry.transitTrackingNo,
    currentLocationText: entry.currentLocationText,
    listingPlatformsText: entry.listingPlatformsText,
    salePlatformText: entry.salePlatformText,
    salePrice: entry.salePrice,
    batchNote: entry.batchNote,
    workflowStage: entry.workflowStage,
    inspectionResult: entry.inspectionResult,
    processedStatus: entry.processedStatus,
    errorMessage: entry.errorMessage,
    generatedPurchaseOrderId: entry.generatedPurchaseOrderId,
    generatedLotId: entry.generatedLotId,
    generatedItemUnitIds: entry.generatedItemUnitIds,
    generatedListingIds: entry.generatedListingIds,
    generatedCustomerOrderId: entry.generatedCustomerOrderId,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt),
  }));

  const brandSuggestions = Array.from(
    new Set(
      [
        ...skus.map((s) => s.brand?.trim()).filter(Boolean),
        ...entries.map((e) => e.rawBrand?.trim()).filter(Boolean),
      ] as string[]
    )
  ).slice(0, 50);

  const productSuggestions = Array.from(
    new Set(
      [
        ...skus.map((s) => s.name?.trim()).filter(Boolean),
        ...entries.map((e) => e.rawProductName?.trim()).filter(Boolean),
      ] as string[]
    )
  ).slice(0, 100);

  const variantSuggestions = Array.from(
    new Set(entries.map((e) => e.rawVariant?.trim()).filter(Boolean) as string[])
  ).slice(0, 50);

  const purchasePlatformSuggestions = Array.from(
    new Set(entries.map((e) => e.purchasePlatformText?.trim()).filter(Boolean) as string[])
  ).slice(0, 30);

  const locationSuggestions = Array.from(
    new Set([
      ...locations.map((l) => l.name?.trim() || l.code?.trim()).filter(Boolean) as string[],
      ...(entries.map((e) => e.currentLocationText?.trim()).filter(Boolean) as string[]),
    ])
  ).slice(0, 30);

  const listingPlatformSuggestions = Array.from(
    new Set([
      ...platforms.map((p) => p.name?.trim()).filter(Boolean) as string[],
      ...(entries.map((e) => e.listingPlatformsText?.trim()).filter(Boolean) as string[]),
    ])
  ).slice(0, 30);

  const salePlatformSuggestions = platforms.map((p) => p.name).filter(Boolean) as string[];
  const locationOptions = locations.map((location) => ({
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type,
  }));
  const consolidationOptions = consolidationBatches
    .filter((batch) => batch.status === "OPEN")
    .map((batch) => ({
      id: batch.id,
      label: `集运批次 ${batch.id.slice(0, 8)} · ${batch.lines.length} 件`,
      fromLocationId: batch.fromLocationId,
      toLocationId: batch.toLocationId,
    }));

  const platformOptions = platforms.map((platform) => ({
    id: platform.id,
    code: platform.code,
    name: platform.name,
    defaultCurrency: platform.defaultCurrency,
    defaultFeeRate: platform.defaultFeeRate,
    defaultShippingFee: platform.defaultShippingFee,
    shippingRules: platform.shippingRules,
  }));

  return (
    <div>
      <PageHeader
        title="工作台"
        description="按商品生命周期查看待办，在列表中直接完成下一步动作。"
        badge={
          counts.total > 0 ? (
            <Badge variant="secondary" className="font-normal">
              {counts.total} 项待办
            </Badge>
          ) : undefined
        }
      />
      <Suspense fallback={<div className="text-sm text-muted-foreground">加载工作台...</div>}>
        <NextActionWorkbench
          storeId={STORE_ID}
          initialCounts={counts}
          initialItems={items}
          recentActivity={recentActivity}
          recentEntries={recentEntries}
          platforms={platformOptions}
          locations={locationOptions}
          consolidationBatches={consolidationOptions}
          suggestions={{
            brand: brandSuggestions,
            product: productSuggestions,
            variant: variantSuggestions,
            purchasePlatform: purchasePlatformSuggestions,
            location: locationSuggestions,
            listingPlatform: listingPlatformSuggestions,
            salePlatform: salePlatformSuggestions,
          }}
        />
      </Suspense>
    </div>
  );
}
