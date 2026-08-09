import type { ListingPendingItem } from "@/lib/application/listing-pending";
import type { WorkItem } from "@/lib/application/next-actions";
import { ACTION_LABELS } from "@/lib/application/next-actions";
import type { WorkItemDetail } from "@/lib/application/workflow-queries";
import { formatItemUnitCondition } from "@/lib/inventory/item-unit-display";

export function listingPendingItemToWorkItem(item: ListingPendingItem): WorkItem {
  const entityType = item.type === "ITEM_UNIT" ? "itemUnit" : "sku";
  const entityId = item.itemUnitId ?? item.skuId;
  const availablePlatformNames = item.availablePlatforms
    .map((platform) => platform.name)
    .join(" / ");
  const stockLabel =
    item.type === "ITEM_UNIT"
      ? `单件 · ${formatItemUnitCondition(item.conditionGrade)}`
      : item.sellableQty > 0
        ? `批次库存 · 可售 ${item.sellableQty} 件`
        : `批次库存 · 转运中 ${item.inTransitQty} 件`;
  const coverageLabel =
    item.activePlatforms.length > 0
      ? `已上架 ${item.activePlatforms.length} · 待补 ${item.availablePlatforms.length}`
      : `${item.availablePlatforms.length} 个平台待上架`;

  return {
    id: `pending-listing-${item.id}`,
    entityType,
    entityId,
    queue: "pendingListing",
    lifecycleStage: "IN_STOCK",
    title: `${item.skuCode} · ${item.skuName}`,
    subtitle: [stockLabel, item.locationName, coverageLabel].filter(Boolean).join(" · "),
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

export function applyPendingListingContext(
  detail: WorkItemDetail,
  item: ListingPendingItem
): WorkItemDetail {
  const pending = listingPendingItemToWorkItem(item);
  return {
    ...detail,
    ...pending,
    lifecycle: detail.lifecycle,
    shipments: detail.shipments,
    metadata: { ...detail.metadata, ...pending.metadata },
    actionContext: {
      ...detail.actionContext,
      status: "PENDING_LISTING",
      activeListingPlatformsText:
        item.activePlatforms.map((platform) => platform.name).join("、") || null,
      listingPlatformsText: item.availablePlatforms.map((platform) => platform.name).join("、"),
      availablePlatformIds: item.availablePlatforms.map((platform) => platform.id).join(","),
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
