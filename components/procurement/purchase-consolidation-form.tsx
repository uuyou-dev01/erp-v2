"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPurchaseOrderToConsolidation,
  createConsolidationForPurchaseOrders,
} from "@/app/actions/consolidations";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LocationOption = { id: string; code: string; name: string };
type BatchOption = {
  id: string;
  fromLocationId: string | null;
  label: string;
};

export function PurchaseConsolidationForm({
  storeId,
  purchaseOrderId,
  arrivalLocationId,
  locations,
  batches,
}: {
  storeId: string;
  purchaseOrderId: string;
  arrivalLocationId: string;
  locations: LocationOption[];
  batches: BatchOption[];
}) {
  const router = useRouter();
  const compatibleBatches = batches.filter(
    (batch) => !batch.fromLocationId || batch.fromLocationId === arrivalLocationId,
  );
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"existing" | "new">(
    compatibleBatches.length > 0 ? "existing" : "new",
  );
  const [batchId, setBatchId] = useState(compatibleBatches[0]?.id ?? "");
  const [toLocationId, setToLocationId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    startTransition(async () => {
      setError(null);
      try {
        let destinationBatchId = batchId;
        if (mode === "new") {
          const result = await createConsolidationForPurchaseOrders({
            storeId,
            purchaseOrderIds: [purchaseOrderId],
            fromLocationId: arrivalLocationId,
            toLocationId: toLocationId || undefined,
            note: note || undefined,
          });
          destinationBatchId = result.batchId;
        } else {
          if (!batchId) throw new Error("请选择一个待集运批次");
          await addPurchaseOrderToConsolidation({ batchId, purchaseOrderId });
        }
        router.push(`/logistics/consolidations/${destinationBatchId}`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "加入集运失败，请重试");
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div>
        <p className="font-medium">下一步：加入待集运</p>
        <p className="text-sm text-muted-foreground">
          只移动已通过质检的商品；退供应商和待复检商品不会进入集运。
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="purchase-consolidation-mode">集运方式</Label>
          <select
            id="purchase-consolidation-mode"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={mode}
            onChange={(event) => setMode(event.target.value as "existing" | "new")}
          >
            <option value="existing" disabled={compatibleBatches.length === 0}>加入已有批次</option>
            <option value="new">创建新批次</option>
          </select>
        </div>
        {mode === "existing" ? (
          <div className="space-y-2">
            <Label htmlFor="purchase-consolidation-batch">待集运批次</Label>
            <select
              id="purchase-consolidation-batch"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={batchId}
              onChange={(event) => setBatchId(event.target.value)}
            >
              {compatibleBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="purchase-consolidation-to">目的仓库（可选）</Label>
            <select
              id="purchase-consolidation-to"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={toLocationId}
              onChange={(event) => setToLocationId(event.target.value)}
            >
              <option value="">稍后设置</option>
              {locations.filter((location) => location.id !== arrivalLocationId).map((location) => (
                <option key={location.id} value={location.id}>{location.name}（{location.code}）</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {mode === "new" ? (
        <div className="space-y-2">
          <Label htmlFor="purchase-consolidation-note">批次备注（可选）</Label>
          <Textarea id="purchase-consolidation-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      ) : null}
      <Button type="button" disabled={pending} onClick={submit}>
        {pending ? "处理中…" : "加入待集运"}
      </Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
