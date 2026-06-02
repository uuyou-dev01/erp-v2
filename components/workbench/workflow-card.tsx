"use client";

import { cn } from "@/lib/utils";
import type { QueueCounts, WorkQueue } from "@/lib/application/next-actions";
import { QUEUE_LABELS } from "@/lib/application/next-actions";
import {
  BadgeCheck,
  ClipboardCheck,
  PackageCheck,
  Send,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface WorkflowCardProps {
  queue: WorkQueue;
  count: number;
  oldestWaitLabel?: string;
  selected?: boolean;
  onClick?: () => void;
}

const CARD_META: Partial<Record<WorkQueue, { icon: LucideIcon; className: string; mark: string }>> = {
  missingLogistics: { icon: Truck, className: "text-blue-600", mark: "🛒" },
  inTransit: { icon: Truck, className: "text-amber-600", mark: "🚚" },
  pendingArrival: { icon: PackageCheck, className: "text-orange-600", mark: "📦" },
  pendingListing: { icon: Store, className: "text-violet-600", mark: "🏷️" },
  listed: { icon: Store, className: "text-purple-600", mark: "🛍️" },
  pendingShipment: { icon: Send, className: "text-emerald-600", mark: "🚀" },
  shipped: { icon: Truck, className: "text-teal-600", mark: "📬" },
  returnInspection: { icon: ClipboardCheck, className: "text-orange-600", mark: "🔍" },
  pendingSettlement: { icon: BadgeCheck, className: "text-cyan-600", mark: "💸" },
  exception: { icon: ClipboardCheck, className: "text-red-600", mark: "⚠️" },
};

export function WorkflowCard({ queue, count, oldestWaitLabel, selected, onClick }: WorkflowCardProps) {
  const meta = CARD_META[queue] ?? { icon: BadgeCheck, className: "text-muted-foreground", mark: "•" };
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[132px] flex-col rounded-md border bg-card px-3 py-2 text-left transition-colors",
        selected ? "border-primary/40 bg-muted/40 ring-2 ring-primary/10" : "hover:bg-muted/30"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{meta.mark}</span>
          {QUEUE_LABELS[queue]}
        </span>
        <Icon className={cn("h-3.5 w-3.5", meta.className)} />
      </div>
      <span className={cn("mt-0.5 text-lg font-semibold tabular-nums", meta.className)}>{count}</span>
      {oldestWaitLabel && count > 0 && (
        <span className="mt-0.5 text-[10px] text-muted-foreground">{oldestWaitLabel}</span>
      )}
    </button>
  );
}

export function getOldestWaitLabel(items: { waitingSince: string }[]) {
  if (items.length === 0) return undefined;
  const oldest = items.reduce((min, item) =>
    new Date(item.waitingSince) < new Date(min.waitingSince) ? item : min
  );
  const days = Math.floor((Date.now() - new Date(oldest.waitingSince).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "今天";
  return `最久 ${days} 天`;
}

export type { QueueCounts };
