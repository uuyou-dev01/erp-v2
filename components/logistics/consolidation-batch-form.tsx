"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createConsolidationBatchAction } from "@/app/actions/consolidations";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Plus } from "lucide-react";

type LocationOption = {
  id: string;
  name: string;
  code: string;
};

export function ConsolidationBatchForm({ locations }: { locations: LocationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createBatch = () => {
    startTransition(async () => {
      setError(null);
      try {
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
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "创建批次失败，请重试");
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
        创建批次
      </Button>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        closeDisabled={isPending}
        title="新建集运批次"
        description="先确定起运仓和目的仓，填写批次说明，再按实际装箱加入商品。"
      >
        <div className="grid gap-4">
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
              isPending ||
              Boolean(fromLocationId && toLocationId && fromLocationId === toLocationId)
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
      </ActionDialog>
    </>
  );
}
