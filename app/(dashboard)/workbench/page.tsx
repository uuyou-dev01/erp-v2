import { Suspense } from "react";
import {
  getWorkbenchQueueCounts,
  getWorkbenchWorkItems,
  getWorkbenchRecentActivity,
  getWorkbenchAssignableMembers,
} from "@/app/actions/workbench";
import { getQuickEntries } from "@/app/actions/quick-entries";
import { getSKUs } from "@/app/actions/skus";
import { getLocations } from "@/app/actions/locations";
import { getPlatforms } from "@/app/actions/platforms";
import { getConsolidationBatches } from "@/app/actions/consolidations";
import { NextActionWorkbench } from "@/components/workbench/next-action-workbench";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const context = await requireUserContext();
  const storeId = context.activeStoreId;
  const [
    counts,
    items,
    recentActivity,
    entries,
    skus,
    locations,
    platforms,
    consolidationBatches,
    assignableMembers,
  ] = await Promise.all([
    getWorkbenchQueueCounts(storeId),
    getWorkbenchWorkItems(storeId, undefined, 120),
    getWorkbenchRecentActivity(storeId),
    getQuickEntries(storeId, 20),
    getSKUs(storeId),
    getLocations(storeId),
    getPlatforms(storeId),
    getConsolidationBatches(storeId),
    getWorkbenchAssignableMembers(storeId),
  ]);

  const recentEntries = entries.map((entry) => ({
    id: entry.id,
    rawBrand: entry.rawBrand,
    rawProductName: entry.rawProductName,
    rawVariant: entry.rawVariant,
    conditionType: entry.conditionType,
    conditionGrade: entry.conditionGrade,
    functionStatus: entry.functionStatus,
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
    createdAt:
      entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt),
  }));

  const brandSuggestions = Array.from(
    new Set([
      ...skus.map((s) => s.brand?.trim()).filter(Boolean),
      ...entries.map((e) => e.rawBrand?.trim()).filter(Boolean),
    ] as string[])
  ).slice(0, 50);

  const catalogProducts = skus
    .filter((sku) => sku.catalogRole === "GROUP" || sku.catalogRole === "SIMPLE")
    .map((sku) => ({
      id: sku.id,
      name: sku.name,
      brand: sku.brand,
      category: sku.category,
      catalogRole: sku.catalogRole,
    }));

  const catalogVariants = skus
    .filter(
      (sku) =>
        sku.catalogRole === "VARIANT" &&
        Boolean(sku.parentSkuId) &&
        Boolean(sku.variantLabel?.trim())
    )
    .map((sku) => ({
      parentSkuId: sku.parentSkuId!,
      label: sku.variantLabel!,
    }));

  const productSuggestions = Array.from(
    new Set([
      ...catalogProducts.map((product) => product.name.trim()).filter(Boolean),
      ...entries.map((e) => e.rawProductName?.trim()).filter(Boolean),
    ] as string[])
  ).slice(0, 100);

  const variantSuggestions = Array.from(
    new Set([
      ...catalogVariants.map((variant) => variant.label),
      ...(entries.map((entry) => entry.rawVariant?.trim()).filter(Boolean) as string[]),
    ])
  ).slice(0, 50);

  const purchasePlatformSuggestions = Array.from(
    new Set([
      "闲鱼",
      "千岛",
      "淘宝",
      "京东",
      "得物",
      "SNKRDUNK",
      ...(entries.map((entry) => entry.purchasePlatformText?.trim()).filter(Boolean) as string[]),
    ])
  ).slice(0, 30);

  const locationSuggestions = Array.from(
    new Set([
      ...(locations.map((l) => l.name?.trim() || l.code?.trim()).filter(Boolean) as string[]),
      ...(entries.map((e) => e.currentLocationText?.trim()).filter(Boolean) as string[]),
    ])
  ).slice(0, 30);

  const listingPlatformSuggestions = Array.from(
    new Set([
      ...(platforms.map((p) => p.name?.trim()).filter(Boolean) as string[]),
      ...(entries.map((e) => e.listingPlatformsText?.trim()).filter(Boolean) as string[]),
    ])
  ).slice(0, 30);

  const salePlatformSuggestions = platforms.map((p) => p.name).filter(Boolean) as string[];
  const locationOptions = locations.map((location) => ({
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type,
    region: location.region,
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
          storeId={storeId}
          currentUserId={context.userId}
          initialCounts={counts}
          initialItems={items}
          recentActivity={recentActivity}
          recentEntries={recentEntries}
          platforms={platformOptions}
          assignableMembers={assignableMembers.map((member) => ({
            id: member.id,
            name: member.name || member.email,
            email: member.email,
            role: member.role,
          }))}
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
            catalogProducts,
            catalogVariants,
          }}
        />
      </Suspense>
    </div>
  );
}
