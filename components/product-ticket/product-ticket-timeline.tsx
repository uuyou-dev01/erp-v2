import type { ProductTicket } from "@/lib/application/workflow-queries";
import { LifecycleTimeline } from "@/components/workbench/lifecycle-timeline";
import { ShipmentTimeline } from "@/components/workbench/shipment-timeline";
import { cn } from "@/lib/utils";
import { LIFECYCLE_LABELS, type ProductLifecycleStage } from "@/lib/application/next-actions";

const MAIN_STAGES: ProductLifecycleStage[] = ["PROCURING", "IN_STOCK", "SELLING", "COMPLETED"];

function MainLifecycleRail({ stage }: { stage: ProductLifecycleStage }) {
  const activeIndex = MAIN_STAGES.indexOf(stage === "EXCEPTION" ? "PROCURING" : stage);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">主生命周期</h3>
        <span className={cn("text-xs font-medium", stage === "EXCEPTION" ? "text-destructive" : "text-muted-foreground")}>
          {LIFECYCLE_LABELS[stage]}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {MAIN_STAGES.map((key, index) => {
          const active = key === stage;
          const done = activeIndex >= 0 && index < activeIndex;
          return (
            <div
              key={key}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                active && "border-primary bg-primary/5 text-primary",
                done && "bg-muted/60 text-muted-foreground",
                !active && !done && "text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-primary" : done ? "bg-muted-foreground" : "bg-border")} />
                <span className="font-medium">{LIFECYCLE_LABELS[key]}</span>
              </div>
            </div>
          );
        })}
      </div>
      {stage === "EXCEPTION" && (
        <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          当前对象存在阻塞风险，异常会覆盖在原生命周期上优先处理。
        </p>
      )}
    </section>
  );
}

export function ProductTicketTimeline({ ticket }: { ticket: ProductTicket }) {
  return (
    <div className="space-y-6">
      <MainLifecycleRail stage={ticket.lifecycleStage} />

      {ticket.subProcesses.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">子流程</h3>
            <span className="text-xs text-muted-foreground">物流、质检、上架、发货、结算</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ticket.subProcesses.map((process) => (
              <div key={`${process.type}-${process.currentStep}`} className="rounded-md border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{process.label}</p>
                  <span className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                    process.status === "blocked" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  )}>
                    {process.status === "blocked" ? "阻塞" : "进行中"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{process.currentStep}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">子流程时间线</h3>
          <span className="text-xs text-muted-foreground">{ticket.currentStatusLabel}</span>
        </div>
        <LifecycleTimeline events={ticket.lifecycle} />
      </section>
      {ticket.shipments.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">物流流转</h3>
          <ShipmentTimeline legs={ticket.shipments} />
        </section>
      )}
    </div>
  );
}
