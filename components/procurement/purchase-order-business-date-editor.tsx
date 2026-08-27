"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Info } from "lucide-react";
import { updatePurchaseOrderBusinessDateAction } from "@/app/actions/purchase-orders";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function toDateInputValue(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function PurchaseOrderBusinessDateEditor({
  purchaseOrderId,
  orderedAt,
  costAllocationStatus,
}: {
  purchaseOrderId: string;
  orderedAt?: string | Date | null;
  costAllocationStatus: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(toDateInputValue(orderedAt));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    if (!date) {
      setError("请填写采购日期");
      return;
    }

    startTransition(async () => {
      const result = await updatePurchaseOrderBusinessDateAction(purchaseOrderId, date);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => {
          setDate(toDateInputValue(orderedAt));
          setError(null);
          setOpen(true);
        }}
      >
        修改
      </Button>

      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title="修改采购业务日期"
        description="录入时间属于审计记录，不会改变；这里修改的是采购事实发生日期。"
        size="sm"
        closeDisabled={isPending}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="purchase-business-date" className="text-sm font-medium">
              采购日期
            </label>
            <div className="relative mt-1.5">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="purchase-business-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="pl-9"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              快速录入生成的记录会同步采购单、来源记录、库存批次与入库流水。
              {costAllocationStatus === "PENDING"
                ? "成本尚未确认时，系统会按新日期更新可用汇率。"
                : "成本已经确认，已采用的汇率和金额将保留，避免历史利润被静默改写。"}
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="button" onClick={handleSave} disabled={isPending || !date}>
              {isPending ? "保存中..." : "保存日期"}
            </Button>
          </div>
        </div>
      </ActionDialog>
    </>
  );
}
