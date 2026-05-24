"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { updateConsolidationStatus } from "@/app/actions/consolidations";
import { ConsolidationTimeline } from "./consolidation-timeline";

interface Batch {
  id: string;
  status: string;
  outboundTrackingNo: string | null;
  carrier: string | null;
  note: string | null;
  lines: Array<{ id: string; sourceType: string; sourceId: string; quantity: unknown }>;
  fromLocation?: { name: string } | null;
  toLocation?: { name: string } | null;
}

export function ConsolidationBatchDetail({ batch }: { batch: Batch }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [trackingNo, setTrackingNo] = useState(batch.outboundTrackingNo ?? "");
  const [carrier, setCarrier] = useState(batch.carrier ?? "");

  const run = (status: "SEALED" | "SHIPPED" | "RECEIVED") => {
    startTransition(async () => {
      await updateConsolidationStatus(batch.id, status, { outboundTrackingNo: trackingNo, carrier });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">集运批次 {batch.id.slice(0, 8)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[batch.fromLocation?.name, batch.toLocation?.name].filter(Boolean).join(" → ") || "未设置路线"}
          </p>
        </div>
        <Badge variant="outline">{batch.status}</Badge>
      </div>

      <ConsolidationTimeline status={batch.status} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">批次商品</h2>
          </div>
          <div className="divide-y">
            {batch.lines.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">暂无商品，可后续从工作台/采购明细加入。</p>
            ) : (
              batch.lines.map((line) => (
                <div key={line.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{line.sourceType} · {line.sourceId.slice(0, 10)}</span>
                  <span className="text-muted-foreground">x {String(line.quantity)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label>国际物流单号</Label>
            <Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>承运商</Label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" disabled={isPending || batch.status !== "OPEN"} onClick={() => run("SEALED")}>
              封箱
            </Button>
            <Button disabled={isPending || batch.status !== "SEALED"} onClick={() => run("SHIPPED")}>
              填写物流并发出
            </Button>
            <Button variant="secondary" disabled={isPending || batch.status !== "SHIPPED"} onClick={() => run("RECEIVED")}>
              确认到货
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
