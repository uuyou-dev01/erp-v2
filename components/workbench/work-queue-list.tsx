"use client";

import { useMemo, useState } from "react";
import type { WorkItem } from "@/lib/application/next-actions";
import {
  groupWorkbenchItems,
  type WorkItemLogisticsGroup,
} from "@/lib/application/workbench-logistics-groups";
import { WorkItemRow } from "./work-item-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Boxes, ChevronDown, ChevronRight, Inbox, PackageCheck } from "lucide-react";

interface WorkQueueListProps {
  items: WorkItem[];
  selectedId?: string;
  checkedIds?: string[];
  selectable?: boolean;
  onCheckedChange?: (item: WorkItem, checked: boolean) => void;
  onGroupCheckedChange?: (items: WorkItem[], checked: boolean) => void;
  onCancelPurchase?: (item: WorkItem) => void;
  onSelect: (item: WorkItem) => void;
}

function LogisticsGroupRow({
  group,
  expanded,
  selectedId,
  checkedIds,
  selectable,
  onToggle,
  onCheckedChange,
  onCancelPurchase,
  onSelect,
}: {
  group: WorkItemLogisticsGroup;
  expanded: boolean;
  selectedId?: string;
  checkedIds: string[];
  selectable?: boolean;
  onToggle: () => void;
  onCheckedChange?: (items: WorkItem[], checked: boolean) => void;
  onCancelPurchase?: (item: WorkItem) => void;
  onSelect: (item: WorkItem) => void;
}) {
  const selectedCount = group.items.filter((item) => checkedIds.includes(item.id)).length;
  const allChecked = selectedCount === group.items.length;
  const partlyChecked = selectedCount > 0 && !allChecked;
  const Icon = group.groupKind === "consolidation" ? Boxes : PackageCheck;

  return (
    <div className="bg-muted/15">
      <div className="flex items-center gap-3 bg-muted/35 px-3 py-3">
        {selectable && (
          <input
            type="checkbox"
            ref={(node) => {
              if (node) node.indeterminate = partlyChecked;
            }}
            checked={allChecked}
            onChange={(event) => onCheckedChange?.(group.items, event.target.checked)}
            aria-label={`选择${group.title}内全部任务`}
            className="h-4 w-4 rounded border-input"
          />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{group.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {group.description}
            </span>
          </span>
          <span className="hidden shrink-0 text-xs font-medium text-primary sm:block">
            {group.actionLabel}
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="divide-y border-t border-dashed bg-background/80 pl-4">
          {group.items.map((item) => (
            <WorkItemRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              selectable={selectable}
              checked={checkedIds.includes(item.id)}
              onCheckedChange={(checked) => onCheckedChange?.([item], checked)}
              onCancelPurchase={() => onCancelPurchase?.(item)}
              onClick={() => onSelect(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkQueueList({
  items,
  selectedId,
  checkedIds = [],
  selectable,
  onCheckedChange,
  onGroupCheckedChange,
  onCancelPurchase,
  onSelect,
}: WorkQueueListProps) {
  const groupedEntries = useMemo(() => groupWorkbenchItems(items), [items]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);

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
      {groupedEntries.map((entry) =>
        entry.kind === "group" ? (
          <LogisticsGroupRow
            key={entry.id}
            group={entry}
            expanded={expandedGroupIds.includes(entry.id)}
            selectedId={selectedId}
            checkedIds={checkedIds}
            selectable={selectable}
            onToggle={() =>
              setExpandedGroupIds((current) =>
                current.includes(entry.id)
                  ? current.filter((id) => id !== entry.id)
                  : [...current, entry.id]
              )
            }
            onCheckedChange={(groupItems, checked) => {
              if (onGroupCheckedChange) onGroupCheckedChange(groupItems, checked);
              else groupItems.forEach((item) => onCheckedChange?.(item, checked));
            }}
            onCancelPurchase={onCancelPurchase}
            onSelect={onSelect}
          />
        ) : (
          <WorkItemRow
            key={entry.item.id}
            item={entry.item}
            selected={selectedId === entry.item.id}
            selectable={selectable}
            checked={checkedIds.includes(entry.item.id)}
            onCheckedChange={(checked) => onCheckedChange?.(entry.item, checked)}
            onCancelPurchase={() => onCancelPurchase?.(entry.item)}
            onClick={() => onSelect(entry.item)}
          />
        )
      )}
    </div>
  );
}
