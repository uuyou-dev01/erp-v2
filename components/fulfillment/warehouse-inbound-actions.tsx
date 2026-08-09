"use client";

import { useState, useTransition } from "react";
import {
  inspectExternalPurchaseReceiptAction,
  inspectPurchaseReceiptQuantitiesAction,
  receivePurchaseOrderAction,
} from "@/app/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WarehouseInboundActions({
  id,
  locationId,
  status,
  inspectionPending,
  lines,
}: {
  id: string;
  locationId: string;
  status: string;
  inspectionPending: boolean;
  lines: Array<{ id: string; quantity: string; sku: { code: string; name: string } }>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [serviceFee, setServiceFee] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [showPartial, setShowPartial] = useState(false);
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(lines.map((line) => [line.id, { passed: line.quantity, failed: "0", pending: "0" }])),
  );
  const run = (task: () => Promise<{ success: boolean; error?: string }>) => startTransition(async () => {
    const result = await task(); setMessage(result.success ? "已更新" : (result.error ?? "操作失败"));
  });
  return <div className="space-y-2">
    {status === "RECEIVED" && inspectionPending ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input className="h-8 w-36" type="number" min="0" step="0.01" value={serviceFee} onChange={(event) => setServiceFee(event.target.value)} placeholder="检查服务费（选填）" />
        <Input className="h-8 w-20" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="币种" />
      </div>
    ) : null}
    <div className="flex flex-wrap items-center justify-end gap-2">
    {["ORDERED", "SHIPPED"].includes(status) ? <Button size="sm" disabled={pending} onClick={() => run(() => receivePurchaseOrderAction({ purchaseOrderId: id, locationId, receivedAt: new Date() }))}>登记收货</Button> : null}
    {status === "RECEIVED" && inspectionPending ? <><Button size="sm" disabled={pending} onClick={() => run(() => inspectExternalPurchaseReceiptAction({ purchaseOrderId: id, result: "PASSED", note: "检查通过", serviceFee, currency }))}>检查通过</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => inspectExternalPurchaseReceiptAction({ purchaseOrderId: id, result: "FAILED", note: window.prompt("检查异常说明") || "检查未通过", serviceFee, currency }))}>检查异常</Button></> : null}
    {status === "RECEIVED" && inspectionPending ? <Button size="sm" variant="outline" disabled={pending} onClick={() => setShowPartial((value) => !value)}>部分通过 / 退货 / 待复检</Button> : null}
    {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
    {showPartial ? (
      <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
        <p className="font-medium">逐条填写数量（合计必须等于收货数量）</p>
        {lines.map((line) => (
          <div key={line.id} className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_90px_90px_90px] md:items-center">
            <span>{line.sku.name} × {line.quantity}</span>
            {(["passed", "failed", "pending"] as const).map((key) => (
              <Input
                key={key}
                className="h-8"
                type="number"
                min="0"
                step="1"
                aria-label={key === "passed" ? "通过数量" : key === "failed" ? "退货数量" : "待复检数量"}
                value={quantities[line.id]?.[key] ?? "0"}
                onChange={(event) => setQuantities({
                  ...quantities,
                  [line.id]: { ...quantities[line.id], [key]: event.target.value },
                })}
                placeholder={key === "passed" ? "通过" : key === "failed" ? "退货" : "待复检"}
              />
            ))}
          </div>
        ))}
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => inspectPurchaseReceiptQuantitiesAction({
            purchaseOrderId: id,
            lines: lines.map((line) => ({
              purchaseLineId: line.id,
              passedQty: quantities[line.id]?.passed ?? "0",
              failedQty: quantities[line.id]?.failed ?? "0",
              pendingQty: quantities[line.id]?.pending ?? "0",
            })),
            note: "按数量质检",
          }))}
        >提交部分质检</Button>
      </div>
    ) : null}
  </div>;
}
