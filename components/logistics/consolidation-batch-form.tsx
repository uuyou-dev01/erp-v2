"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createConsolidationBatchAction } from "@/app/actions/consolidations";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LocationOption = {
  id: string;
  name: string;
  code: string;
};

export function ConsolidationBatchForm({ locations }: { locations: LocationOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createBatch = () => {
    startTransition(async () => {
      setError(null);
      const result = await createConsolidationBatchAction({
        fromLocationId: fromLocationId || undefined,
        toLocationId: toLocationId || undefined,
        note,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/logistics/consolidations/${result.id}`);
      router.refresh();
    });
  };

  return (
    <section className="mb-5 rounded-lg border bg-card p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">新建集运批次</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          先确定起运仓和目的仓，并填写易识别的批次说明，再从采购单或工作台加入商品。
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="consolidation-from">起运仓库</Label>
          <select
            id="consolidation-from"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={fromLocationId}
            onChange={(event) => setFromLocationId(event.target.value)}
          >
            <option value="">暂不设置</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}（{location.code}）
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="consolidation-to">目的仓库</Label>
          <select
            id="consolidation-to"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={toLocationId}
            onChange={(event) => setToLocationId(event.target.value)}
          >
            <option value="">暂不设置</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}（{location.code}）
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="consolidation-note">批次说明</Label>
          <Textarea
            id="consolidation-note"
            className="min-h-9 resize-none"
            rows={1}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：8 月东京仓 · 手办补货"
          />
        </div>
        <Button
          type="button"
          disabled={
            isPending || Boolean(fromLocationId && toLocationId && fromLocationId === toLocationId)
          }
          onClick={createBatch}
        >
          {isPending ? "创建中…" : "创建批次"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
