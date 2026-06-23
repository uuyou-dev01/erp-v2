"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Loader2 } from "lucide-react";
import {
  submitSkuLocationStocktakeAdjustmentsAction,
  type SkuLocationStocktakeRow,
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
  onlyDiff?: boolean;
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

export function StocktakeGrid({ storeId, rows, onlyDiff }: StocktakeGridProps) {
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
      setError("没有需要提交的数量差异");
      return;
    }
    const invalidUnitCostRow = qtyChangedRows.find((row) => {
      const draft = drafts[rowKey(row)];
      if (!draft) return false;
      return !parseStocktakeUnitCostInput(draft.countedUnitCost, row.bookUnitCost).valid;
    });
    if (invalidUnitCostRow) {
      setError(`${invalidUnitCostRow.skuCode} 的盘点单价格式无效`);
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
      setMessage(`提交成功，已写入 ${result.adjustments.length} 条调整流水`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        当前筛选条件下没有可盘点的 SKU。
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          共 {rows.length} 个 SKU，待提交数量差异 {qtyChangedRows.length} 条
        </p>
        <Button disabled={loading} onClick={openConfirm}>
          提交盘点差异
        </Button>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {confirmOpen ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="mb-3 text-sm font-medium">确认提交以下数量调整？</p>
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
                "确认提交"
              )}
            </Button>
            <Button variant="outline" disabled={loading} onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>仓位</TableHead>
            <TableHead>账面数量</TableHead>
            <TableHead>实盘数量</TableHead>
            <TableHead>差异</TableHead>
            <TableHead>账面单价</TableHead>
            <TableHead>盘点单价</TableHead>
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
    </div>
  );
}
