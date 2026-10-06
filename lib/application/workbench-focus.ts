import type { WorkQueue } from "./next-actions";

export type WorkFocus = "now" | "waiting" | "opportunity";
export const WORK_FOCUS_LABELS: Record<WorkFocus, string> = {
  now: "现在要做",
  waiting: "等待外部结果",
  opportunity: "经营机会",
};
export function workQueueFocus(queue: WorkQueue): WorkFocus {
  if (["inTransit", "pendingArrival", "shipped", "listed", "completed"].includes(queue))
    return "waiting";
  if (["pendingListing", "inStock"].includes(queue)) return "opportunity";
  return "now";
}
export function parseWorkFocus(value: string | null): WorkFocus {
  return value === "waiting" || value === "opportunity" ? value : "now";
}
