import type { ListingPendingItem } from "@/lib/application/listing-pending";
import type { WorkItem } from "@/lib/application/next-actions";
import { ACTION_LABELS } from "@/lib/application/next-actions";

export function listingPendingItemToWorkItem(item: ListingPendingItem): WorkItem {
  const entityType = item.type === "ITEM_UNIT" ? "itemUnit" : "inventoryLot";
  const entityId = item.itemUnitId ?? item.skuId;
  const availablePlatformNames = item.availablePlatforms
    .map((platform) => platform.name)
    .join(" / ");
  const stockLabel =
    item.type === "ITEM_UNIT" ? (item.conditionGrade ?? "中古单品") : `可售 ${item.sellableQty} 件`;

  return {
    id: `pending-listing-${item.id}`,
    entityType,
    entityId,
    queue: "pendingListing",
    lifecycleStage: "IN_STOCK",
    title: `${item.skuCode} · ${item.skuName}`,
    subtitle: [stockLabel, item.locationName, `${item.availablePlatforms.length} 个平台待上架`]
      .filter(Boolean)
      .join(" · "),
    skuCode: item.skuCode,
    currentStatus: "PENDING_LISTING",
    currentStatusLabel: "待上架检查",
    primaryAction: "createListing",
    primaryActionLabel: ACTION_LABELS.createListing,
    priority: "normal",
    waitingSince: item.waitingSince,
    detailHref: "/inventory/sellable?unlisted=1",
    metadata: {
      pendingListingType: item.type,
      skuId: item.skuId,
      itemUnitId: item.itemUnitId ?? null,
      sellableQty: item.sellableQty,
      inTransitQty: item.inTransitQty,
      availablePlatforms: availablePlatformNames,
      suggestedPrice: item.suggestedPrice,
      suggestedCurrency: item.suggestedCurrency,
    },
  };
}

export function mergePendingListingWorkItems(
  items: WorkItem[],
  pendingListingItems: ListingPendingItem[],
  queue?: WorkItem["queue"],
  limit = 80
) {
  const pendingWorkItems = pendingListingItems.map(listingPendingItemToWorkItem);
  const merged =
    queue === "pendingListing"
      ? pendingWorkItems
      : [...items.filter((item) => item.queue !== "pendingListing"), ...pendingWorkItems];

  return merged
    .sort((a, b) => {
      const priorityWeight = { critical: 0, warning: 1, normal: 2 };
      const diff = priorityWeight[a.priority] - priorityWeight[b.priority];
      if (diff !== 0) return diff;
      return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
    })
    .slice(0, limit);
}
