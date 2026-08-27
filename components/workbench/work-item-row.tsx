"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { WorkItem } from "@/lib/application/next-actions";
import { LIFECYCLE_LABELS, QUEUE_LABELS } from "@/lib/application/next-actions";
import { Badge } from "@/components/ui/badge";
import { ExceptionBadge } from "./exception-badge";
import {
  AlertTriangle,
  BadgeCheck,
  PackageCheck,
  Send,
  Store,
  Truck,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

interface WorkItemRowProps {
  item: WorkItem;
  selected?: boolean;
  checked?: boolean;
  selectable?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onCancelPurchase?: () => void;
  onClick?: () => void;
}

const QUEUE_META: Partial<
  Record<WorkItem["queue"], { icon: LucideIcon; className: string; badge: string; mark: string }>
> = {
  missingLogistics: {
    icon: Truck,
    className: "text-blue-600",
    badge: "border-blue-100 text-blue-700",
    mark: "🛒",
  },
  inTransit: {
    icon: Truck,
    className: "text-amber-600",
    badge: "border-amber-100 text-amber-700",
    mark: "🚚",
  },
  pendingArrival: {
    icon: PackageCheck,
    className: "text-orange-600",
    badge: "border-orange-100 text-orange-700",
    mark: "📦",
  },
  inspectionException: {
    icon: AlertTriangle,
    className: "text-red-600",
    badge: "border-red-100 text-red-700",
    mark: "⚠️",
  },
  pendingListing: {
    icon: Store,
    className: "text-violet-600",
    badge: "border-violet-100 text-violet-700",
    mark: "🏷️",
  },
  listed: {
    icon: Store,
    className: "text-purple-600",
    badge: "border-purple-100 text-purple-700",
    mark: "🛍️",
  },
  pendingShipment: {
    icon: Send,
    className: "text-emerald-600",
    badge: "border-emerald-100 text-emerald-700",
    mark: "🚀",
  },
  shipped: {
    icon: Truck,
    className: "text-teal-600",
    badge: "border-teal-100 text-teal-700",
    mark: "📬",
  },
  returnInspection: {
    icon: ClipboardCheck,
    className: "text-orange-600",
    badge: "border-orange-100 text-orange-700",
    mark: "🔍",
  },
  pendingSettlement: {
    icon: BadgeCheck,
    className: "text-cyan-600",
    badge: "border-cyan-100 text-cyan-700",
    mark: "💸",
  },
  exception: {
    icon: AlertTriangle,
    className: "text-red-600",
    badge: "border-red-100 text-red-700",
    mark: "⚠️",
  },
};

function waitingLabel(waitingSince: string) {
  const hours = Math.floor((Date.now() - new Date(waitingSince).getTime()) / (1000 * 60 * 60));
  if (hours < 24) return `${Math.max(hours, 1)}h`;
  return `${Math.floor(hours / 24)}d`;
}

function compactNumber(value?: string) {
  if (!value) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function trackingLabel(item: WorkItem) {
  const trackingNo = item.metadata?.trackingNo;
  return typeof trackingNo === "string" && trackingNo.trim()
    ? `物流单号 ${trackingNo.trim()}`
    : null;
}

export function WorkItemRow({
  item,
  selected,
  checked,
  selectable,
  onCheckedChange,
  onCancelPurchase,
  onClick,
}: WorkItemRowProps) {
  const meta = QUEUE_META[item.queue] ?? {
    icon: BadgeCheck,
    className: "text-muted-foreground",
    badge: "",
    mark: "•",
  };
  const Icon = meta.icon;
  const lineItems = item.lineItems ?? [];
  const visibleLines = lineItems.slice(0, 4);
  const hiddenLineCount = Math.max(0, lineItems.length - visibleLines.length);

  const canCancelPurchase =
    item.entityType === "purchaseOrder" && item.queue === "missingLogistics";
  const tracking = trackingLabel(item);
  const physicalStateLabel =
    typeof item.metadata?.physicalStateLabel === "string" ? item.metadata.physicalStateLabel : null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClick?.();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
        selected && "bg-muted"
      )}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange?.(event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-input"
        />
      )}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background">
        <Icon className={cn("h-3.5 w-3.5", meta.className)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{item.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] font-normal", meta.badge)}>
            <span className="mr-1">{meta.mark}</span>
            {item.currentStatusLabel}
          </Badge>
          {item.lifecycleStage && (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
            >
              {physicalStateLabel ?? LIFECYCLE_LABELS[item.lifecycleStage]}
            </Badge>
          )}
          {item.taskId && (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px] font-normal text-emerald-700"
            >
              {item.taskAssignedToName ? `负责人 ${item.taskAssignedToName}` : "待指派"}
            </Badge>
          )}
          {item.taskFulfillmentLocationNames?.length ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-blue-700">
              发货仓 {item.taskFulfillmentLocationNames.join("、")}
            </Badge>
          ) : null}
          {item.exceptionMessage && <ExceptionBadge message={item.exceptionMessage} />}
          <span className="text-xs text-muted-foreground">
            {[item.subtitle ?? QUEUE_LABELS[item.queue], tracking, waitingLabel(item.waitingSince)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        {visibleLines.length > 0 && (
          <div className="mt-2 space-y-1 border-l pl-3">
            {visibleLines.map((line) => (
              <div
                key={line.id}
                className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground"
              >
                <span className="min-w-0 truncate">{line.title}</span>
                <span className="shrink-0 tabular-nums">
                  x{compactNumber(line.quantity)} · {compactNumber(line.unitPrice)}
                </span>
              </div>
            ))}
            {hiddenLineCount > 0 && (
              <p className="text-xs text-muted-foreground">还有 {hiddenLineCount} 个购入明细...</p>
            )}
          </div>
        )}
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {canCancelPurchase && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onCancelPurchase?.();
            }}
          >
            取消采购
          </button>
        )}
        <span className="text-xs text-muted-foreground group-hover:text-primary">
          {item.taskStatusLabel ?? item.primaryActionLabel}
        </span>
      </div>
    </div>
  );
}
