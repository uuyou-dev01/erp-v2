"use client";

import { cn } from "@/lib/utils";
import type { QueueCounts, WorkQueue } from "@/lib/application/next-actions";
import { QUEUE_LABELS } from "@/lib/application/next-actions";

interface StatusQueueProps {
  counts: QueueCounts;
  selectedQueue?: WorkQueue | "all";
  onSelect: (queue: WorkQueue | "all") => void;
  className?: string;
}

const TASK_GROUPS: Array<{
  label: string;
  description: string;
  queues: WorkQueue[];
  mark: string;
  color: string;
}> = [
  {
    label: "采购处理",
    description: "补物流、到货确认和分流",
    queues: ["missingLogistics", "pendingArrival", "pendingDisposition"],
    mark: "🛒",
    color: "text-blue-600",
  },
  {
    label: "跨境 / 转运",
    description: "集运、调仓和跨境在途",
    queues: ["inTransit"],
    mark: "🚚",
    color: "text-amber-600",
  },
  {
    label: "质检与资料",
    description: "评级、功能检查、补图和退货复检",
    queues: ["returnInspection"],
    mark: "🔁",
    color: "text-orange-600",
  },
  {
    label: "库存 / 上架",
    description: "检查可售商品的上架覆盖",
    queues: ["pendingListing"],
    mark: "🏷️",
    color: "text-violet-600",
  },
  {
    label: "出售",
    description: "售出后的发货与结算",
    queues: ["pendingShipment", "shipped", "pendingSettlement"],
    mark: "💸",
    color: "text-emerald-600",
  },
  {
    label: "异常",
    description: "影响利润、履约和时效",
    queues: ["inspectionException", "exception"],
    mark: "⚠️",
    color: "text-red-600",
  },
];

const QUEUE_DOT: Partial<Record<WorkQueue, string>> = {
  missingLogistics: "bg-blue-500",
  inTransit: "bg-amber-500",
  pendingArrival: "bg-orange-500",
  pendingDisposition: "bg-teal-500",
  inspectionException: "bg-red-500",
  pendingListing: "bg-violet-500",
  listed: "bg-purple-500",
  returnInspection: "bg-orange-500",
  pendingShipment: "bg-emerald-500",
  shipped: "bg-teal-500",
  pendingSettlement: "bg-cyan-500",
  completed: "bg-slate-400",
  exception: "bg-red-500",
};

export function StatusQueue({
  counts,
  selectedQueue = "all",
  onSelect,
  className,
}: StatusQueueProps) {
  const groupTotal = (queues: WorkQueue[]) => queues.reduce((sum, queue) => sum + counts[queue], 0);

  return (
    <nav className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
          selectedQueue === "all"
            ? "bg-muted font-medium"
            : "text-muted-foreground hover:bg-muted/60"
        )}
      >
        <span>全部</span>
        <span className="text-xs tabular-nums text-muted-foreground">{counts.total}</span>
      </button>

      {TASK_GROUPS.map((group) => (
        <section key={group.label} className="space-y-1">
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm leading-none">{group.mark}</span>
              <div className="min-w-0">
                <p className={cn("text-[11px] font-semibold", group.color)}>{group.label}</p>
                <p className="truncate text-[10px] text-muted-foreground">{group.description}</p>
              </div>
            </div>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {groupTotal(group.queues)}
            </span>
          </div>
          <div className="space-y-0.5">
            {group.queues.map((key) => {
              const isException = key === "exception" || key === "inspectionException";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                    selectedQueue === key &&
                      isException &&
                      "bg-destructive/10 font-medium text-destructive",
                    selectedQueue === key && !isException && "bg-muted font-medium",
                    selectedQueue !== key && "text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", QUEUE_DOT[key])} />
                    <span className="truncate">{QUEUE_LABELS[key]}</span>
                  </span>
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
