import type { WorkItem, WorkQueue } from "@/lib/application/next-actions";

export type LogisticsGroupKind = "tracking" | "consolidation";

export interface WorkItemLogisticsGroup {
  kind: "group";
  id: string;
  queue: WorkQueue;
  groupKind: LogisticsGroupKind;
  groupKey: string;
  title: string;
  description: string;
  actionLabel: string;
  totalQuantity: number;
  items: WorkItem[];
}

export interface WorkItemListEntry {
  kind: "item";
  item: WorkItem;
}

export type GroupedWorkItemListEntry = WorkItemListEntry | WorkItemLogisticsGroup;

function metadataText(item: WorkItem, key: string) {
  const value = item.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function logisticsGroupIdentity(item: WorkItem) {
  if (item.queue === "inTransit") {
    const batchId = metadataText(item, "consolidationBatchId");
    if (batchId) {
      return {
        kind: "consolidation" as const,
        key: batchId,
        displayValue:
          metadataText(item, "consolidationBatchLabel") ?? `批次 ${batchId.slice(0, 8)}`,
      };
    }
  }

  if (
    item.queue === "pendingArrival" ||
    item.queue === "pendingDisposition" ||
    item.queue === "inTransit"
  ) {
    const trackingNo = metadataText(item, "trackingNo");
    if (trackingNo) {
      return {
        kind: "tracking" as const,
        key: trackingNo.toLocaleUpperCase(),
        displayValue: trackingNo,
      };
    }
  }

  return null;
}

function itemQuantity(item: WorkItem) {
  const metadataQuantity = item.metadata?.totalQty;
  if (typeof metadataQuantity === "number" && Number.isFinite(metadataQuantity)) {
    return metadataQuantity;
  }
  if (typeof metadataQuantity === "string" && Number.isFinite(Number(metadataQuantity))) {
    return Number(metadataQuantity);
  }
  return (item.lineItems ?? []).reduce((sum, line) => {
    const quantity = Number(line.quantity);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);
}

function actionLabel(queue: WorkQueue) {
  if (queue === "pendingArrival") return "批量确认收货";
  if (queue === "pendingDisposition") return "批量分流";
  return "查看集运任务";
}

export function groupWorkbenchItems(items: WorkItem[]): GroupedWorkItemListEntry[] {
  const buckets = new Map<
    string,
    {
      identity: NonNullable<ReturnType<typeof logisticsGroupIdentity>>;
      items: WorkItem[];
    }
  >();

  for (const item of items) {
    const identity = logisticsGroupIdentity(item);
    if (!identity) continue;
    const bucketKey = `${item.queue}:${identity.kind}:${identity.key}`;
    const existing = buckets.get(bucketKey);
    if (existing) existing.items.push(item);
    else buckets.set(bucketKey, { identity, items: [item] });
  }

  const emitted = new Set<string>();
  const result: GroupedWorkItemListEntry[] = [];

  for (const item of items) {
    const identity = logisticsGroupIdentity(item);
    if (!identity) {
      result.push({ kind: "item", item });
      continue;
    }

    const bucketKey = `${item.queue}:${identity.kind}:${identity.key}`;
    const bucket = buckets.get(bucketKey);
    if (!bucket || bucket.items.length < 2) {
      result.push({ kind: "item", item });
      continue;
    }
    if (emitted.has(bucketKey)) continue;
    emitted.add(bucketKey);

    const totalQuantity = bucket.items.reduce((sum, groupItem) => sum + itemQuantity(groupItem), 0);
    const trackingNo =
      bucket.identity.kind === "consolidation"
        ? metadataText(bucket.items[0], "outboundTrackingNo")
        : bucket.identity.displayValue;
    result.push({
      kind: "group",
      id: `logistics-group:${bucketKey}`,
      queue: item.queue,
      groupKind: bucket.identity.kind,
      groupKey: bucket.identity.key,
      title:
        bucket.identity.kind === "consolidation"
          ? `集运批次 · ${bucket.identity.displayValue}`
          : `物流单号 · ${bucket.identity.displayValue}`,
      description: [
        `${bucket.items.length} 个任务`,
        totalQuantity > 0 ? `${totalQuantity} 件商品` : null,
        bucket.identity.kind === "consolidation"
          ? trackingNo
            ? `国际物流 ${trackingNo}`
            : "共用同一集运批次"
          : "共用同一物流单号",
      ]
        .filter(Boolean)
        .join(" · "),
      actionLabel: actionLabel(item.queue),
      totalQuantity,
      items: bucket.items,
    });
  }

  return result;
}
