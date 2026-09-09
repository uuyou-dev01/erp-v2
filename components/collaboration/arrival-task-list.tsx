"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MapPin, Package } from "lucide-react";
import { completeCollaborationArrivalTaskAction } from "@/app/actions/collaboration-tasks";
import type { CollaborationArrivalTask } from "@/lib/application/collaboration-arrival-tasks";
import { Button } from "@/components/ui/button";

export function ArrivalTaskList({ tasks }: { tasks: CollaborationArrivalTask[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!tasks.length) return null;

  const confirmArrival = (taskId: string) => {
    setActiveTaskId(taskId);
    setError(null);
    startTransition(async () => {
      const result = await completeCollaborationArrivalTaskAction(taskId);
      if (!result.success) {
        setError(result.error);
        setActiveTaskId(null);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="mb-6" aria-labelledby="arrival-tasks-title">
      <div className="mb-3">
        <h2 id="arrival-tasks-title" className="text-base font-semibold">
          待确认到货
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          集运已经发往你的仓库。核对内容物后，直接确认到货即可。
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="divide-y rounded-lg border">
        {tasks.map((task) => (
          <article key={task.id} className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">集运批次 {task.batch.id.slice(0, 8)}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {task.batch.fromLocation?.name ?? "起运仓"} →
                  {task.batch.toLocation?.name ?? "目的仓"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task.organizationName} · {task.batch.carrier || "未填写承运商"} ·
                  {task.batch.outboundTrackingNo || "未填写物流单号"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm tabular-nums text-muted-foreground">
                  共 {task.batch.totalQuantity} 件
                </span>
                <Button type="button" disabled={pending} onClick={() => confirmArrival(task.id)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {pending && activeTaskId === task.id ? "确认中…" : "确认已到货"}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {task.batch.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex min-w-0 items-center gap-3 rounded-md bg-muted/35 p-2"
                >
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.imageUrl}
                      alt={`${line.title} 商品图`}
                      className="h-12 w-12 shrink-0 rounded-md border bg-background object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-background">
                      <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {line.skuCode || "无 SKU 编码"} · × {line.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
