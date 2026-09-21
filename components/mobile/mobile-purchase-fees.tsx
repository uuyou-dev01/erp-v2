"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  allocatePurchaseOrderCostsAction,
  type AllocatePurchaseCostsInput,
} from "@/app/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const labels: Record<string, string> = {
  SHIPPING_COST: "邮费",
  TAX: "税费",
  INSPECTION: "质检费",
  PACKING_FEE: "包材费",
  OTHER: "其他",
};
export function MobilePurchaseFees({
  orderId,
  expectedUpdatedAt,
  currency,
  total,
  lines,
  fees,
}: {
  orderId: string;
  expectedUpdatedAt: string;
  currency: string;
  total: string;
  lines: { purchaseLineId: string; amount: string }[];
  fees: { feeType: string; amount: string; currency: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(fees);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const supported = rows.every((r) => r.feeType in labels);
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer py-1 text-sm font-semibold">
        邮费与采购费用 · 已登记 {fees.length} 笔
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-xs leading-5 text-slate-500">
          这里编辑整单费用总清单，保存后更新采购成本，不会再创建一笔付款。原有费用已带入，请勿重复添加。
        </p>
        {rows.map((row, i) => (
          <div key={i} className="space-y-2 rounded-lg bg-slate-50 p-3">
            <label className="block text-xs">
              费用类别
              <select
                aria-label={`费用 ${i + 1} 类别`}
                value={row.feeType}
                onChange={(e) =>
                  setRows(rows.map((r, j) => (j === i ? { ...r, feeType: e.target.value } : r)))
                }
                className="mt-1 h-11 w-full rounded border bg-white px-2"
              >
                {!(row.feeType in labels) && <option value={row.feeType}>{row.feeType}</option>}
                {Object.entries(labels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Input
                aria-label={`费用 ${i + 1} 金额`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={row.amount}
                onChange={(e) =>
                  setRows(rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))
                }
                className="h-11"
              />
              <select
                aria-label={`费用 ${i + 1} 币种`}
                value={row.currency}
                onChange={(e) =>
                  setRows(rows.map((r, j) => (j === i ? { ...r, currency: e.target.value } : r)))
                }
                className="rounded border px-2"
              >
                {Array.from(
                  new Set([row.currency, currency, "CNY", "JPY", "USD", "HKD", "EUR"])
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() => setRows([...rows, { feeType: "SHIPPING_COST", amount: "", currency }])}
        >
          添加一笔费用
        </Button>
        {!supported && (
          <p className="text-sm text-amber-800">含特殊费用，请到完整订单处理，避免覆盖原记录。</p>
        )}
        {message && (
          <p role="status" className="text-sm text-blue-700">
            {message}
          </p>
        )}
        <Button
          className="w-full"
          disabled={
            pending ||
            JSON.stringify(rows) === JSON.stringify(fees) ||
            !supported ||
            rows.some(
              (r) => !r.amount.trim() || !Number.isFinite(Number(r.amount)) || Number(r.amount) < 0
            )
          }
          onClick={() => {
            setMessage("");
            start(async () => {
              try {
                const result = await allocatePurchaseOrderCostsAction({
                  purchaseOrderId: orderId,
                  expectedUpdatedAt,
                  totalProductCost: total,
                  method: "MANUAL",
                  manualLineAmounts: lines,
                  fees: rows as AllocatePurchaseCostsInput["fees"],
                });
                if (!result.success) {
                  setMessage(result.error);
                  return;
                }
                setMessage("费用已更新");
                router.refresh();
              } catch {
                setMessage("保存失败，请重试");
              }
            });
          }}
        >
          {pending ? "保存中…" : "保存整单费用"}
        </Button>
      </div>
    </details>
  );
}
