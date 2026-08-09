"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inspectPurchaseReceiptQuantitiesAction } from "@/app/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InspectionLine = {
  id: string;
  skuCode: string;
  skuName: string;
  quantity: string;
  trackingMode: string;
};

export function PurchaseReceiptInspectionForm({
  purchaseOrderId,
  lines,
}: {
  purchaseOrderId: string;
  lines: InspectionLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(() => lines.map((line) => ({
    purchaseLineId: line.id,
    passedQty: line.quantity,
    failedQty: "0",
    pendingQty: "0",
  })));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalsValid = useMemo(() => rows.every((row, index) => {
    const total = Number(row.passedQty || 0) + Number(row.failedQty || 0) + Number(row.pendingQty || 0);
    const expected = Number(lines[index].quantity);
    const integerRequired = lines[index].trackingMode === "ITEM_UNIT";
    return Number.isFinite(total) && total === expected &&
      (!integerRequired || [row.passedQty, row.failedQty, row.pendingQty].every((value) => Number.isInteger(Number(value || 0))));
  }), [lines, rows]);

  const update = (index: number, key: "passedQty" | "failedQty" | "pendingQty", value: string) => {
    setError(null);
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };

  const submit = () => {
    setError(null);
    if (!totalsValid) {
      setError("每行的通过、退供应商和待复检数量合计必须等于收货数量；一物一单必须填写整数。");
      return;
    }
    startTransition(() => {
      void (async () => {
        const result = await inspectPurchaseReceiptQuantitiesAction({
          purchaseOrderId,
          lines: rows,
          note: note.trim() || undefined,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      })();
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">按实际结果分流库存</p>
        <p className="text-sm text-muted-foreground">
          通过的商品进入可售库存；不合格商品标记为退供应商；暂不确定的商品进入待复检。
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">商品</th>
              <th className="px-3 py-2 font-medium">收货</th>
              <th className="px-3 py-2 font-medium">通过</th>
              <th className="px-3 py-2 font-medium">退供应商</th>
              <th className="px-3 py-2 font-medium">待复检</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td className="px-3 py-3">
                  <p className="font-medium">{line.skuName}</p>
                  <p className="text-xs text-muted-foreground">{line.skuCode} · {line.trackingMode === "ITEM_UNIT" ? "一物一单" : "按数量"}</p>
                </td>
                <td className="px-3 py-3">{line.quantity}</td>
                {(["passedQty", "failedQty", "pendingQty"] as const).map((key) => (
                  <td key={key} className="px-3 py-3">
                    <Input
                      aria-label={`${line.skuName}${key === "passedQty" ? "通过" : key === "failedQty" ? "退供应商" : "待复检"}数量`}
                      type="number"
                      min="0"
                      step={line.trackingMode === "ITEM_UNIT" ? "1" : "0.0001"}
                      value={rows[index][key]}
                      onChange={(event) => update(index, key, event.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <Label htmlFor="inspection-note">质检说明（选填）</Label>
        <Textarea
          id="inspection-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：2 件镀层划伤退供应商，1 件待复检"
        />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "正在提交质检结果…" : "确认质检并分流库存"}
      </Button>
    </div>
  );
}
