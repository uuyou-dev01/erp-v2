"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { QueueCounts, WorkItem, WorkQueue } from "@/lib/application/next-actions";
import type { WorkItemDetail } from "@/lib/application/workflow-queries";
import { getWorkbenchWorkItemDetail } from "@/app/actions/workbench";
import { cancelPurchaseOrder } from "@/app/actions/purchase-orders";
import { TodayCommandBar } from "./today-command-bar";
import { StatusQueue } from "./status-queue";
import { WorkQueueList } from "./work-queue-list";
import { ExceptionPanel } from "./exception-panel";
import { RecentActivityFeed, type ActivityFeedItem } from "./recent-activity-feed";
import { WorkflowCard, getOldestWaitLabel } from "./workflow-card";
import { ActionDrawer } from "./action-drawer";
import { QuickEntryWorkbench } from "./quick-entry-workbench";
import { WORKFLOW_STAGES } from "@/lib/application/next-actions";
import { cn } from "@/lib/utils";
import { BulkActionToolbar } from "./bulk-action-toolbar";
import { PendingActionPanel } from "./pending-action-panel";
import type { WorkbenchPlatformOption } from "./action-drawer-forms";

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

interface QuickEntrySuggestions {
  brand: string[];
  product: string[];
  variant: string[];
  purchasePlatform: string[];
  location: string[];
  listingPlatform: string[];
  salePlatform: string[];
}

interface RecentEntry {
  id: string;
  rawBrand: string | null;
  rawProductName: string;
  rawVariant: string | null;
  conditionType: string | null;
  purchasePrice: string | null;
  purchaseCurrency: string | null;
  purchaseTrackingNo: string | null;
  transitTrackingNo: string | null;
  currentLocationText: string | null;
  listingPlatformsText: string | null;
  salePlatformText: string | null;
  salePrice: string | null;
  batchNote: string | null;
  workflowStage: string;
  inspectionResult: string | null;
  processedStatus: string;
  errorMessage: string | null;
  generatedPurchaseOrderId: string | null;
  generatedLotId: string | null;
  generatedItemUnitIds: unknown;
  generatedListingIds: unknown;
  generatedCustomerOrderId: string | null;
  createdAt: string;
}

interface NextActionWorkbenchProps {
  storeId: string;
  initialCounts: QueueCounts;
  initialItems: WorkItem[];
  recentActivity: ActivityFeedItem[];
  recentEntries: RecentEntry[];
  platforms: WorkbenchPlatformOption[];
  locations: Array<{ id: string; code: string; name: string; type: string }>;
  consolidationBatches: Array<{
    id: string;
    label: string;
    fromLocationId: string | null;
    toLocationId: string | null;
  }>;
  suggestions: QuickEntrySuggestions;
}

function parseQueue(value: string | null): WorkQueue | "all" {
  if (!value || value === "all") return "all";
  return value as WorkQueue;
}

export function NextActionWorkbench({
  storeId,
  initialCounts,
  initialItems,
  recentActivity,
  recentEntries,
  platforms,
  locations,
  consolidationBatches,
  suggestions,
}: NextActionWorkbenchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedQueue, setSelectedQueue] = useState<WorkQueue | "all">(
    parseQueue(searchParams.get("queue"))
  );
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<WorkItemDetail | null>(null);
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const filteredItems = useMemo(() => {
    let items = initialItems;
    if (selectedQueue !== "all") {
      items = items.filter((i) => i.queue === selectedQueue);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.subtitle?.toLowerCase().includes(q) ||
          i.skuCode?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [initialItems, selectedQueue, search]);

  const exceptionItems = useMemo(
    () => initialItems.filter((i) => i.queue === "exception" || i.queue === "inspectionException"),
    [initialItems]
  );

  const handleSelectQueue = (queue: WorkQueue | "all") => {
    setSelectedQueue(queue);
    setSelectedItem(null);
    setSelectedDetail(null);
    setCheckedIds([]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    params.delete("open");
    if (queue === "all") params.delete("queue");
    else params.set("queue", queue);
    router.replace(`/workbench?${params.toString()}`, { scroll: false });
  };

  const handleSelectItem = (item: WorkItem) => {
    setSelectedItem(item);
    setShowQuickEntry(false);
    startTransition(async () => {
      const data = await getWorkbenchWorkItemDetail(item.entityType, item.entityId);
      setSelectedDetail(data);
    });
  };

  const handleCancelPurchase = (item: WorkItem) => {
    if (item.entityType !== "purchaseOrder" || item.queue !== "missingLogistics") return;
    const confirmed = window.confirm(`确认取消采购单「${item.title}」吗？此操作会让它从待补物流队列移除。`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        await cancelPurchaseOrder(item.entityId);
        setSelectedItem((current) => (current?.id === item.id ? null : current));
        setSelectedDetail((current) => (current?.id === item.id ? null : current));
        setCheckedIds((ids) => ids.filter((id) => id !== item.id));
        router.refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : "取消采购失败");
      }
    });
  };

  const handleCloseDrawer = () => {
    setSelectedItem(null);
    setSelectedDetail(null);
  };

  const handleCloseQuickEntry = () => {
    setShowQuickEntry(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    const query = params.toString();
    router.replace(query ? `/workbench?${query}` : "/workbench", { scroll: false });
  };

  const openQuickEntry = () => {
    setSelectedItem(null);
    setSelectedDetail(null);
    setShowQuickEntry(true);
  };

  useEffect(() => {
    if (searchParams.get("action") === "quickEntry") {
      openQuickEntry();
    }
    const openParam = searchParams.get("open");
    if (openParam) {
      const [type, id] = openParam.split(":");
      if (type && id) {
        startTransition(async () => {
          const data = await getWorkbenchWorkItemDetail(type as WorkItem["entityType"], id);
          setSelectedDetail(data);
          setSelectedItem(data ?? null);
          setShowQuickEntry(false);
        });
      }
    }
  }, [searchParams]);

  return (
    <div className="space-y-4">
      <TodayCommandBar
        search={search}
        onSearchChange={setSearch}
        onQuickEntry={openQuickEntry}
        onPasteImport={openQuickEntry}
      />

      <div className="flex gap-3 overflow-x-auto pb-1">
        {WORKFLOW_STAGES.filter((s) => initialCounts[s.key] > 0 || s.key === selectedQueue).slice(0, 8).map(({ key }) => {
          const queueItems = initialItems.filter((i) => i.queue === key);
          return (
            <WorkflowCard
              key={key}
              queue={key}
              count={initialCounts[key]}
              oldestWaitLabel={getOldestWaitLabel(queueItems)}
              selected={selectedQueue === key}
              onClick={() => handleSelectQueue(key)}
            />
          );
        })}
      </div>

      {exceptionItems.length > 0 && (
        <ExceptionPanel items={exceptionItems} onSelect={handleSelectItem} />
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_220px]">
        <Panel title="任务分组" className="h-fit">
          <StatusQueue
            counts={initialCounts}
            selectedQueue={selectedQueue}
            onSelect={handleSelectQueue}
          />
        </Panel>

        <Panel
          title={selectedQueue === "all" ? `全部待办 · ${filteredItems.length}` : `待处理 · ${filteredItems.length}`}
        >
          <BulkActionToolbar
            queue={selectedQueue}
            items={filteredItems}
            locations={locations}
            consolidationBatches={consolidationBatches}
            selectedIds={checkedIds}
            onClear={() => setCheckedIds([])}
          />
          <WorkQueueList
            items={filteredItems}
            selectedId={selectedItem?.id}
            selectable={selectedQueue !== "all"}
            checkedIds={checkedIds}
            onCheckedChange={(item, checked) => {
              setCheckedIds((ids) =>
                checked ? [...ids, item.id] : ids.filter((id) => id !== item.id)
              );
            }}
            onCancelPurchase={handleCancelPurchase}
            onSelect={handleSelectItem}
          />
        </Panel>

        <Panel title="最近操作" className="h-fit">
          <RecentActivityFeed items={recentActivity} />
        </Panel>
      </div>

      <ActionDrawer
        open={Boolean(selectedItem && selectedDetail)}
        onClose={handleCloseDrawer}
        className="max-w-[min(560px,calc(100vw-1rem))]"
      >
        {selectedDetail && (
          <PendingActionPanel
            detail={selectedDetail}
            platforms={platforms}
            locations={locations}
            consolidationBatches={consolidationBatches}
            onClose={handleCloseDrawer}
            onComplete={() => {
              handleCloseDrawer();
              router.refresh();
            }}
          />
        )}
        {selectedItem && !selectedDetail && pending && (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            加载详情...
          </div>
        )}
      </ActionDrawer>

      <ActionDrawer
        open={showQuickEntry}
        onClose={handleCloseQuickEntry}
        className="max-w-[min(1180px,calc(100vw-2rem))]"
      >
        <div className="flex h-full flex-col">
          <div className="border-b px-5 py-4">
            <h2 className="text-base font-semibold">快速录入</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              支持单行录入、批量新增和 Google Sheet 粘贴，保存后自动进入待办队列。
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <QuickEntryWorkbench
              storeId={storeId}
              recentEntries={recentEntries}
              suggestions={suggestions}
            />
          </div>
        </div>
      </ActionDrawer>
    </div>
  );
}
