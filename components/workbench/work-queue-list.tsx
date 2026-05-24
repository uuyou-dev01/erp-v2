"use client";

import type { WorkItem } from "@/lib/application/next-actions";
import { WorkItemRow } from "./work-item-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";

interface WorkQueueListProps {
  items: WorkItem[];
  selectedId?: string;
  checkedIds?: string[];
  selectable?: boolean;
  onCheckedChange?: (item: WorkItem, checked: boolean) => void;
  onCancelPurchase?: (item: WorkItem) => void;
  onSelect: (item: WorkItem) => void;
}

export function WorkQueueList({
  items,
  selectedId,
  checkedIds = [],
  selectable,
  onCheckedChange,
  onCancelPurchase,
  onSelect,
}: WorkQueueListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="暂无待办"
        description="切换其他队列，或使用快速录入添加商品。"
      />
    );
  }

  return (
    <div className="divide-y rounded-md border">
      {items.map((item) => (
        <WorkItemRow
          key={item.id}
          item={item}
          selected={selectedId === item.id}
          selectable={selectable}
          checked={checkedIds.includes(item.id)}
          onCheckedChange={(checked) => onCheckedChange?.(item, checked)}
          onCancelPurchase={() => onCancelPurchase?.(item)}
          onClick={() => onSelect(item)}
        />
      ))}
    </div>
  );
}
