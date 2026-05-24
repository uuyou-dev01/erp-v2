"use client";

import type { WorkItem } from "@/lib/application/next-actions";
import { WorkItemRow } from "./work-item-row";
import { TriangleAlert } from "lucide-react";

interface ExceptionPanelProps {
  items: WorkItem[];
  onSelect: (item: WorkItem) => void;
}

export function ExceptionPanel({ items, onSelect }: ExceptionPanelProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-md border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-sm">⚠️</span>
        <span className="flex h-5 w-5 items-center justify-center rounded-md border bg-background text-red-600">
          <TriangleAlert className="h-3 w-3" />
        </span>
        <div>
          <h3 className="text-xs font-semibold text-foreground">风险层 · {items.length}</h3>
          <p className="text-[10px] text-muted-foreground">覆盖在生命周期上的利润、时效或履约风险</p>
        </div>
      </div>
      <div>
        {items.slice(0, 5).map((item) => (
          <WorkItemRow key={item.id} item={item} onClick={() => onSelect(item)} />
        ))}
      </div>
    </section>
  );
}
