"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Box, CheckCircle2, ChevronDown, PackagePlus, Search } from "lucide-react";
import { addInventoryToConsolidationBatchAction } from "@/app/actions/consolidations";
import type { TransferInventoryCandidate } from "@/app/actions/transfer-shipments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ConsolidationInventoryEditor({
  batchId,
  originName,
  candidates,
}: {
  batchId: string;
  originName: string;
  candidates: TransferInventoryCandidate[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return candidates;
    return candidates.filter((candidate) =>
      [candidate.skuCode, candidate.skuName, candidate.unitCode, candidate.sourceReference].some(
        (value) => value?.toLocaleLowerCase().includes(normalizedQuery)
      )
    );
  }, [candidates, query]);
  const selectedCandidates = candidates.filter((candidate) => numeric(selected[candidate.key]) > 0);
  const selectedQuantity = selectedCandidates.reduce(
    (total, candidate) => total + numeric(selected[candidate.key]),
    0
  );

  const toggleCandidate = (candidate: TransferInventoryCandidate, checked: boolean) => {
    setError(null);
    setMessage(null);
    setSelected((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[candidate.key];
        return next;
      }
      return {
        ...current,
        [candidate.key]: candidate.entityType === "ITEM_UNIT" ? "1" : candidate.availableQuantity,
      };
    });
  };

  const addSelected = () => {
    setError(null);
    setMessage(null);
    if (selectedCandidates.length === 0) {
      setError("请至少选择一项要装入的库存");
      return;
    }
    const invalid = selectedCandidates.find((candidate) => {
      const quantity = numeric(selected[candidate.key]);
      return quantity <= 0 || quantity > numeric(candidate.availableQuantity);
    });
    if (invalid) {
      setError(`${invalid.skuCode} 的装箱数量超过当前可用数量`);
      return;
    }

    startTransition(async () => {
      const result = await addInventoryToConsolidationBatchAction({
        batchId,
        lines: selectedCandidates.map((candidate) => ({
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          quantity: selected[candidate.key],
        })),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSelected({});
      setQuery("");
      setExpanded(false);
      setMessage(`已加入 ${result.added} 项，共 ${selectedQuantity.toLocaleString("zh-CN")} 件`);
      router.refresh();
    });
  };

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((current) => !current);
          setError(null);
        }}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">按实际装箱添加商品</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              从 {originName} 选择部分数量，也可以混合不同采购来源
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {candidates.length} 项可用
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {message ? (
        <div
          role="status"
          className="flex items-center gap-2 border-t bg-emerald-50 px-4 py-2 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {message}
        </div>
      ) : null}

      {expanded ? (
        <div className="border-t">
          <div className="flex flex-col gap-3 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">本批次实际装入的库存</p>
              <p className="mt-1 text-xs text-muted-foreground">
                系统仅锁定所填数量；同一库存的剩余部分仍留在原位置。
              </p>
            </div>
            <label className="relative block w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索可装箱库存"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="搜索 SKU、商品或采购单"
              />
            </label>
          </div>

          {visibleCandidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Box className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">没有可加入的库存</p>
              <p className="text-xs text-muted-foreground">
                已占用、在途、待复检或已加入其他集运批次的库存不会显示。
              </p>
            </div>
          ) : (
            <div className="max-h-[28rem] divide-y overflow-y-auto border-y">
              {visibleCandidates.map((candidate) => {
                const checked = numeric(selected[candidate.key]) > 0;
                const quantity = selected[candidate.key] ?? "";
                const remaining = Math.max(
                  0,
                  numeric(candidate.availableQuantity) - numeric(quantity)
                );
                const inputId = `consolidation-${candidate.key.replaceAll(":", "-")}`;
                return (
                  <div
                    key={candidate.key}
                    className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_9rem] sm:items-center"
                  >
                    <Checkbox
                      id={`${inputId}-selected`}
                      checked={checked}
                      onChange={(event) => toggleCandidate(candidate, event.target.checked)}
                      aria-label={`选择 ${candidate.skuCode} ${candidate.skuName}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {candidate.skuCode} · {candidate.skuName}
                        </p>
                        {candidate.entityType === "ITEM_UNIT" ? (
                          <Badge variant="outline">单件 {candidate.unitCode}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {candidate.sourceReference} · 可装 {candidate.availableQuantity} 件
                      </p>
                    </div>
                    {candidate.entityType === "LOT" ? (
                      <div>
                        <Label
                          htmlFor={`${inputId}-quantity`}
                          className="text-xs text-muted-foreground"
                        >
                          本次装入
                        </Label>
                        <Input
                          id={`${inputId}-quantity`}
                          type="number"
                          min="0"
                          max={candidate.availableQuantity}
                          step="0.0001"
                          value={quantity}
                          disabled={!checked}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [candidate.key]: event.target.value,
                            }))
                          }
                          className="mt-1 text-right"
                        />
                        {checked ? (
                          <p className="mt-1 text-right text-[11px] text-muted-foreground">
                            原位剩余{" "}
                            {remaining.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-right text-xs text-muted-foreground">本次装入 1 件</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              已选 {selectedCandidates.length} 项，共 {selectedQuantity.toLocaleString("zh-CN")} 件
            </p>
            <Button
              type="button"
              disabled={pending || selectedCandidates.length === 0}
              onClick={addSelected}
            >
              {pending ? "正在加入…" : "加入本集运批次"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="border-t px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
