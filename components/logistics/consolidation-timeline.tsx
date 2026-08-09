import { CheckCircle2, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["OPEN", "SEALED", "SHIPPED", "RECEIVED"] as const;
const LABELS: Record<(typeof STEPS)[number], string> = {
  OPEN: "可加入商品",
  SEALED: "已封箱",
  SHIPPED: "国际运输",
  RECEIVED: "已到货",
};

export function ConsolidationTimeline({ status }: { status: string }) {
  const currentIndex = Math.max(0, STEPS.indexOf(status as (typeof STEPS)[number]));
  return (
    <div className="flex gap-2 overflow-x-auto">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <div key={step} className="flex min-w-[120px] items-center gap-2 rounded-md border px-3 py-2">
            {done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <CircleDot className={cn("h-4 w-4", current ? "text-primary" : "text-muted-foreground/40")} />
            )}
            <div>
              <p className="text-xs font-medium">{LABELS[step]}</p>
              <p className="text-[10px] text-muted-foreground">
                {done ? "已完成" : current ? "当前阶段" : "尚未开始"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
