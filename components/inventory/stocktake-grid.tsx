"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Loader2 } from "lucide-react";
import {
  submitSkuLocationStocktakeAdjustmentsAction,
  type SkuLocationStocktakeRow,
  type TransferableInventoryRow,
} from "@/app/actions/stocktake";
import {
  isStocktakeDraftChanged,
  parseStocktakeIntegerInput,
  parseStocktakeUnitCostInput,
} from "@/lib/application/stocktake-form";
import { formatCurrency } from "@/lib/decimal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StockMaintenanceActions } from "@/components/inventory/stock-maintenance-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StocktakeGridProps {
  storeId: string;
  rows: SkuLocationStocktakeRow[];
  transferRows: TransferableInventoryRow[];
  locations: Array<{ id: string; code: string; name: string }>;
  skus: Array<{ id: string; code: string; name: string }>;
  existingStockLocations: Array<{ skuId: string; locationId: string }>;
  defaultCurrency: string;
  onlyDiff?: boolean;
  defaultMaintenanceMode?: "TRANSFER";
}

interface DraftRow {
  countedQty: string;
  countedUnitCost: string;
  notes: string;
}

function rowKey(row: SkuLocationStocktakeRow) {
  return `${row.skuId}:${row.locationId}`;
}

function formatIntegerDiff(diff: number) {
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : String(diff);
}

export function StocktakeGrid({
  storeId,
  rows,
  transferRows,
  locations,
  skus,
  existingStockLocations,
  defaultCurrency,
  onlyDiff,
  defaultMaintenanceMode,
}: StocktakeGridProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>(() =>
    Object.fromEntries(
      rows.map((row) => [
        rowKey(row),
        {
          countedQty: String(row.bookQty),
          countedUnitCost: new Decimal(row.bookUnitCost).toFixed(2),
          notes: "",
        },
      ])
    )
  );

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        rows.map((row) => [
          rowKey(row),
          {
            countedQty: String(row.bookQty),
            countedUnitCost: new Decimal(row.bookUnitCost).toFixed(2),
            notes: "",
          },
        ])
      )
    );
  }, [rows]);

  const setDraft = (key: string, next: Partial<DraftRow>) => {
    setDrafts((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          ...next,
        },
      };
    });
  };

  const changedRows = useMemo(() => {
    return rows.filter((row) => {
      const draft = drafts[rowKey(row)];
      if (!draft) return false;
      return isStocktakeDraftChanged(draft, row.bookQty, row.bookUnitCost);
    });
  }, [drafts, rows]);

  const qtyChangedRows = useMemo(() => {
    return changedRows.filter((row) => {
      const draft = drafts[rowKey(row)];
      if (!draft) return false;
      return parseStocktakeIntegerInput(draft.countedQty, row.bookQty) !== row.bookQty;
    });
  }, [changedRows, drafts]);

  const visibleRows = onlyDiff ? changedRows : rows;

  const buildSubmitItems = () =>
    qtyChangedRows.map((row) => {
      const draft = drafts[rowKey(row)];
      if (!draft) throw new Error("盘点行不存在");
      return {
        skuId: row.skuId,
        locationId: row.locationId,
        countedQty: parseStocktakeIntegerInput(draft.countedQty, row.bookQty),
        countedUnitCost: parseStocktakeUnitCostInput(
          draft.countedUnitCost,
          row.bookUnitCost
        ).decimal.toFixed(2),
        notes: draft.notes.trim() || undefined,
      };
    });

  const openConfirm = () => {
    setError(null);
    setMessage(null);
    if (qtyChangedRows.length === 0) {
      setError("没有需要保存的库存调整");
      return;
    }
    const invalidUnitCostRow = qtyChangedRows.find((row) => {
      const draft = drafts[rowKey(row)];
      if (!draft) return false;
      return !parseStocktakeUnitCostInput(draft.countedUnitCost, row.bookUnitCost).valid;
    });
    if (invalidUnitCostRow) {
      setError(`${invalidUnitCostRow.skuCode} 的调整单价格式无效`);
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const items = buildSubmitItems();
      const result = await submitSkuLocationStocktakeAdjustmentsAction({
        storeId,
        items,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      setMessage(`保存成功，已写入 ${result.adjustments.length} 条调整流水`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          共 {rows.length} 个 SKU，待保存调整 {qtyChangedRows.length} 条
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <StockMaintenanceActions
            storeId={storeId}
            rows={rows}
            transferRows={transferRows}
            locations={locations}
            skus={skus}
            existingStockLocations={existingStockLocations}
            defaultCurrency={defaultCurrency}
            defaultMode={defaultMaintenanceMode}
            onCompleted={(nextMessage) => {
              setError(null);
              setMessage(nextMessage);
              router.refresh();
            }}
          />
          <Button disabled={loading || rows.length === 0} onClick={openConfirm}>
            保存库存调整
          </Button>
        </div>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {confirmOpen ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="mb-3 text-sm font-medium">确认保存以下库存调整？</p>
          <ul className="mb-4 space-y-2 text-sm">
            {qtyChangedRows.map((row) => {
              const draft = drafts[rowKey(row)];
              const countedQty = parseStocktakeIntegerInput(draft?.countedQty ?? "", row.bookQty);
              const diff = countedQty - row.bookQty;
              return (
                <li key={rowKey(row)} className="flex flex-wrap gap-x-2 gap-y-1">
                  <span className="font-mono">{row.skuCode}</span>
                  <span className="text-muted-foreground">{row.locationCode}</span>
                  <span>
                    账面 {row.bookQty} → 实盘 {countedQty}（{formatIntegerDiff(diff)}）
                  </span>
                  {draft?.notes.trim() ? (
                    <span className="text-muted-foreground">备注: {draft.notes.trim()}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button disabled={loading} onClick={submit}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : (
                "确认保存"
              )}
            </Button>
            <Button variant="outline" disabled={loading} onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : null}

      {visibleRows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "当前筛选条件下没有现有批次库存，仍可使用上方“录入其他仓库库存”。"
            : "当前没有尚未保存的库存差异。"}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>仓位</TableHead>
              <TableHead>账面数量</TableHead>
              <TableHead>调整后数量</TableHead>
              <TableHead>差异</TableHead>
              <TableHead>账面单价</TableHead>
              <TableHead>调整单价</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const key = rowKey(row);
              const draft = drafts[key];
              if (!draft) return null;
              const countedQty = parseStocktakeIntegerInput(draft.countedQty, row.bookQty);
              const diff = countedQty - row.bookQty;
              return (
                <TableRow key={key}>
                  <TableCell>
                    <p className="font-mono text-sm">{row.skuCode}</p>
                    <p className="text-xs text-muted-foreground">{row.skuName}</p>
                    {row.lotIds.length > 1 ? (
                      <p className="text-xs text-muted-foreground">含 {row.lotIds.length} 个批次</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{row.locationCode}</p>
                    <p className="text-xs text-muted-foreground">{row.locationName}</p>
                  </TableCell>
                  <TableCell>{row.bookQty}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={draft.countedQty}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value.includes(".")) return;
                        setDraft(key, { countedQty: value });
                      }}
                    />
                  </TableCell>
                  <TableCell
                    className={diff === 0 ? "" : diff > 0 ? "text-green-600" : "text-red-600"}
                  >
                    {formatIntegerDiff(diff)}
                  </TableCell>
                  <TableCell>{formatCurrency(row.bookUnitCost, row.currency)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={draft.countedUnitCost}
                      onChange={(event) => setDraft(key, { countedUnitCost: event.target.value })}
                    />
                  </TableCell>
                  <TableCell className="min-w-48">
                    <Textarea
                      value={draft.notes}
                      onChange={(event) => setDraft(key, { notes: event.target.value })}
                      rows={2}
                      placeholder="漏录、报损、盘盈等"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
