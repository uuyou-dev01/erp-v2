"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  submitSkuLocationStocktakeAdjustmentsAction,
  type SkuLocationStocktakeRow,
  type TransferableInventoryRow,
} from "@/app/actions/stocktake";
import { StockMaintenanceActions } from "@/components/inventory/stock-maintenance-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function MobileInventory(props: {
  storeId: string;
  rows: SkuLocationStocktakeRow[];
  transferRows: TransferableInventoryRow[];
  locations: { id: string; code: string; name: string }[];
  skus: { id: string; code: string; name: string }[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-4">
      <StockMaintenanceActions
        {...props}
        existingStockLocations={props.transferRows.map((r) => ({
          skuId: r.skuId,
          locationId: r.locationId,
        }))}
        onCompleted={(text) => {
          setMessage(text);
          router.refresh();
        }}
      />
      {message && (
        <p role="status" className="text-sm text-blue-700">
          {message}
        </p>
      )}
      <p className="text-xs text-slate-500">
        批量库存 {props.rows.length} 项 · 单件及可转仓库存 {props.transferRows.length} 项
      </p>
      {!props.rows.length && (
        <p className="py-8 text-center text-sm text-slate-500">没有匹配的批量库存</p>
      )}
      {props.rows.map((row) => (
        <StockRow
          key={`${row.skuId}:${row.locationId}:${row.bookQty}`}
          row={row}
          storeId={props.storeId}
        />
      ))}
    </div>
  );
}
function StockRow({ row, storeId }: { row: SkuLocationStocktakeRow; storeId: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [qty, setQty] = useState(String(row.bookQty));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const valid = /^\d+$/.test(qty) && Number.isSafeInteger(Number(qty));
  const diff = Number(qty) - row.bookQty;
  return (
    <article className="space-y-3 rounded-xl border p-4">
      <h2 className="text-sm font-semibold">{row.skuName}</h2>
      <p className="break-all text-xs text-slate-500">
        {row.skuCode} · {row.locationName}
      </p>
      <div className="flex items-center justify-between">
        <p className="text-sm">
          账面 <strong className="text-xl">{row.bookQty}</strong> 件
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setEdit(!edit);
            setConfirm(false);
          }}
        >
          核对数量
        </Button>
      </div>
      {edit && (
        <div className="space-y-3 border-t pt-3">
          <label className="block text-sm">
            实盘数量
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setConfirm(false);
              }}
              className="mt-1 h-11"
            />
          </label>
          <label className="block text-sm">
            差异原因
            <Input
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setConfirm(false);
              }}
              placeholder="如：盘亏、破损、漏录"
              className="mt-1 h-11"
            />
          </label>
          <p className="text-sm">
            {valid ? `差异 ${diff > 0 ? "+" : ""}${diff} 件` : "请输入非负整数"}
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {confirm && (
            <p className="text-sm text-amber-800">
              将 {row.locationName} 的库存从 {row.bookQty} 调整为 {qty} 件。
            </p>
          )}
          <Button
            disabled={pending || !valid || diff === 0 || !reason.trim()}
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              setError("");
              start(async () => {
                try {
                  const result = await submitSkuLocationStocktakeAdjustmentsAction({
                    storeId,
                    items: [
                      {
                        skuId: row.skuId,
                        locationId: row.locationId,
                        countedQty: Number(qty),
                        notes: reason,
                      },
                    ],
                  });
                  if (!result.success) {
                    setError(result.error);
                    return;
                  }
                  setEdit(false);
                  router.refresh();
                } catch {
                  setError("保存失败，请重试");
                }
              });
            }}
          >
            {pending ? "保存中…" : confirm ? "确认调整" : "检查差异"}
          </Button>
        </div>
      )}
    </article>
  );
}
