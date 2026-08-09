"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, Loader2, PackagePlus, X } from "lucide-react";
import {
  dispatchSkuLocationStockTransferAction,
  recordOtherLocationStockAction,
  transferSkuLocationStockAction,
  type SkuLocationStocktakeRow,
  type TransferableInventoryRow,
} from "@/app/actions/stocktake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface StockOption {
  id: string;
  code: string;
  name: string;
}

interface ExistingStockLocation {
  skuId: string;
  locationId: string;
}

interface StockMaintenanceActionsProps {
  storeId: string;
  rows: SkuLocationStocktakeRow[];
  transferRows: TransferableInventoryRow[];
  locations: StockOption[];
  skus: StockOption[];
  existingStockLocations: ExistingStockLocation[];
  defaultCurrency: string;
  defaultMode?: "TRANSFER";
  onCompleted: (message: string) => void;
}

type DialogMode = "ENTRY" | "TRANSFER" | null;

const ENTRY_REASONS = [
  { value: "MISSED_ENTRY", label: "历史漏录" },
  { value: "STOCK_GAIN", label: "盘盈补录" },
  { value: "HISTORICAL_BACKFILL", label: "历史数据补齐" },
  { value: "OTHER", label: "其他" },
] as const;

export function StockMaintenanceActions({
  storeId,
  rows,
  transferRows,
  locations,
  skus,
  existingStockLocations,
  defaultCurrency,
  defaultMode,
  onCompleted,
}: StockMaintenanceActionsProps) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<DialogMode>(defaultMode ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preferredSkuId = useMemo(() => {
    const uniqueSkuIds = Array.from(new Set(rows.map((row) => row.skuId)));
    return uniqueSkuIds.length === 1 ? uniqueSkuIds[0] : (skus[0]?.id ?? "");
  }, [rows, skus]);

  const [entrySkuId, setEntrySkuId] = useState(preferredSkuId);
  const [entryLocationId, setEntryLocationId] = useState("");
  const [entryQuantity, setEntryQuantity] = useState("1");
  const [entryUnitCost, setEntryUnitCost] = useState("");
  const [entryCurrency, setEntryCurrency] = useState(defaultCurrency);
  const [entryReason, setEntryReason] =
    useState<(typeof ENTRY_REASONS)[number]["value"]>("MISSED_ENTRY");
  const [entryNotes, setEntryNotes] = useState("");

  const [sourceKey, setSourceKey] = useState(transferRows[0]?.key ?? "");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [transferMode, setTransferMode] = useState<"TRANSIT" | "IMMEDIATE">("TRANSIT");
  const [transferTrackingNo, setTransferTrackingNo] = useState("");
  const [transferCarrier, setTransferCarrier] = useState("");
  const [transferEtaDate, setTransferEtaDate] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transportMode, setTransportMode] = useState<
    "HAND_CARRY" | "CONSOLIDATOR" | "POSTAL" | "COURIER" | "FREIGHT" | "OTHER"
  >("HAND_CARRY");
  const [carriedBy, setCarriedBy] = useState("");

  const occupiedKeys = useMemo(
    () => new Set(existingStockLocations.map((item) => `${item.skuId}:${item.locationId}`)),
    [existingStockLocations]
  );

  const entryLocations = useMemo(
    () => locations.filter((location) => !occupiedKeys.has(`${entrySkuId}:${location.id}`)),
    [entrySkuId, locations, occupiedKeys]
  );

  const sourceRow = transferRows.find((row) => row.key === sourceKey) ?? transferRows[0] ?? null;
  const destinationLocations = useMemo(
    () => (sourceRow ? locations.filter((location) => location.id !== sourceRow.locationId) : []),
    [locations, sourceRow]
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) setMode(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loading, mode]);

  useEffect(() => {
    if (!skus.some((sku) => sku.id === entrySkuId)) {
      setEntrySkuId(preferredSkuId);
    }
  }, [entrySkuId, preferredSkuId, skus]);

  useEffect(() => {
    const validLocation = entryLocations.some((location) => location.id === entryLocationId);
    if (!validLocation) {
      setEntryLocationId(entryLocations[0]?.id ?? "");
    }

    const referenceRow = rows.find((row) => row.skuId === entrySkuId);
    setEntryUnitCost(referenceRow?.bookUnitCost ?? "");
    setEntryCurrency(referenceRow?.currency ?? defaultCurrency);
  }, [defaultCurrency, entryLocations, entryLocationId, entrySkuId, rows]);

  useEffect(() => {
    if (!sourceRow) {
      setSourceKey("");
      setDestinationLocationId("");
      return;
    }
    const key = sourceRow.key;
    if (key !== sourceKey) setSourceKey(key);
    if (sourceRow.entityType === "ITEM_UNIT" && transferQuantity !== "1") {
      setTransferQuantity("1");
    }
    if (!destinationLocations.some((location) => location.id === destinationLocationId)) {
      setDestinationLocationId(destinationLocations[0]?.id ?? "");
    }
  }, [destinationLocationId, destinationLocations, sourceKey, sourceRow, transferQuantity]);

  const openEntry = () => {
    setError(null);
    setEntrySkuId(preferredSkuId);
    setEntryQuantity("1");
    setEntryReason("MISSED_ENTRY");
    setEntryNotes("");
    setMode("ENTRY");
  };

  const openTransfer = () => {
    setError(null);
    const preferredSource =
      transferRows.find((row) => row.skuId === preferredSkuId) ?? transferRows[0] ?? null;
    setSourceKey(preferredSource?.key ?? "");
    setTransferQuantity("1");
    setTransferMode("TRANSIT");
    setTransferTrackingNo("");
    setTransferCarrier("");
    setTransferEtaDate("");
    setTransferNotes("");
    setTransportMode("HAND_CARRY");
    setCarriedBy("");
    setMode("TRANSFER");
  };

  const close = () => {
    if (loading) return;
    setError(null);
    setMode(null);
  };

  const submitEntry = async () => {
    const quantity = Number(entryQuantity);
    if (!entrySkuId || !entryLocationId) {
      setError("请选择 SKU 和目标仓位");
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("录入数量必须是正整数");
      return;
    }
    if (entryUnitCost.trim() === "") {
      setError("请填写单位成本");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await recordOtherLocationStockAction({
        storeId,
        skuId: entrySkuId,
        locationId: entryLocationId,
        quantity,
        unitCost: entryUnitCost,
        currency: entryCurrency,
        reason: entryReason,
        notes: entryNotes.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMode(null);
      onCompleted(`已录入其他仓库库存 ${result.entry.quantity} 件`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "录入失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const submitTransfer = async () => {
    const quantity = Number(transferQuantity);
    if (!sourceRow || !destinationLocationId) {
      setError("请选择调出库存和调入仓位");
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("调拨数量必须是正整数");
      return;
    }
    if (quantity > sourceRow.bookQty) {
      setError(`调拨数量不能超过账面库存 ${sourceRow.bookQty}`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        storeId,
        skuId: sourceRow.skuId,
        fromLocationId: sourceRow.locationId,
        toLocationId: destinationLocationId,
        quantity,
        itemUnitId: sourceRow.itemUnitId,
        notes: transferNotes.trim() || undefined,
      };
      const result =
        transferMode === "TRANSIT"
          ? await dispatchSkuLocationStockTransferAction({
              ...payload,
              trackingNo: transferTrackingNo.trim() || undefined,
              carrier: transferCarrier.trim() || undefined,
              etaDate: transferEtaDate || undefined,
              transportMode,
              carriedBy: transportMode === "HAND_CARRY" ? carriedBy.trim() || undefined : undefined,
            })
          : await transferSkuLocationStockAction(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMode(null);
      onCompleted(
        transferMode === "TRANSIT"
          ? `物流转仓已发出，共 ${result.transfer.quantity} 件；目标仓签收后自动调入库存`
          : `即时调拨已完成，共移动 ${result.transfer.quantity} 件`
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "调拨失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={loading || skus.length === 0} onClick={openEntry}>
          <PackagePlus className="h-4 w-4" />
          录入其他仓库库存
        </Button>
        <Button
          variant="outline"
          disabled={loading || transferRows.length === 0 || locations.length < 2}
          onClick={openTransfer}
        >
          <ArrowRightLeft className="h-4 w-4" />
          仓间调拨
        </Button>
      </div>

      {mounted && mode
        ? createPortal(
            <div className="fixed inset-0 z-[950] flex items-end justify-center p-3 sm:items-center sm:p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/45"
                aria-label="关闭弹窗"
                onClick={close}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="stock-maintenance-dialog-title"
                className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-xl"
              >
                <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                  <div>
                    <h2 id="stock-maintenance-dialog-title" className="text-base font-semibold">
                      {mode === "ENTRY" ? "录入其他仓库库存" : "仓间调拨"}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {mode === "ENTRY"
                        ? "仅用于当前账面尚未出现该 SKU 的仓位，保存后记录 ADJUST 流水。"
                        : "物流转仓会保留在途和签收环节；即时调拨仅用于实物已经搬完的补记。"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={close}
                    disabled={loading}
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4 px-5 py-5">
                  {mode === "ENTRY" ? (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="entry-sku">
                          SKU
                        </label>
                        <Select
                          id="entry-sku"
                          value={entrySkuId}
                          onChange={(event) => setEntrySkuId(event.target.value)}
                        >
                          {skus.map((sku) => (
                            <option key={sku.id} value={sku.id}>
                              {sku.code} · {sku.name}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="entry-location">
                          目标仓位
                        </label>
                        <Select
                          id="entry-location"
                          value={entryLocationId}
                          onChange={(event) => setEntryLocationId(event.target.value)}
                          disabled={entryLocations.length === 0}
                        >
                          {entryLocations.length === 0 ? (
                            <option value="">没有可新增的仓位</option>
                          ) : null}
                          {entryLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.code} · {location.name}
                            </option>
                          ))}
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          已有该 SKU 的仓位请关闭弹窗，直接修改表格中的调整后数量。
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium" htmlFor="entry-quantity">
                            数量
                          </label>
                          <Input
                            id="entry-quantity"
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={entryQuantity}
                            onChange={(event) => setEntryQuantity(event.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium" htmlFor="entry-reason">
                            录入原因
                          </label>
                          <Select
                            id="entry-reason"
                            value={entryReason}
                            onChange={(event) =>
                              setEntryReason(
                                event.target.value as (typeof ENTRY_REASONS)[number]["value"]
                              )
                            }
                          >
                            {ENTRY_REASONS.map((reason) => (
                              <option key={reason.value} value={reason.value}>
                                {reason.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium" htmlFor="entry-unit-cost">
                            单位成本
                          </label>
                          <Input
                            id="entry-unit-cost"
                            type="number"
                            min={0}
                            step={0.01}
                            value={entryUnitCost}
                            onChange={(event) => setEntryUnitCost(event.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium" htmlFor="entry-currency">
                            币种
                          </label>
                          <Input
                            id="entry-currency"
                            value={entryCurrency}
                            maxLength={3}
                            onChange={(event) => setEntryCurrency(event.target.value.toUpperCase())}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="entry-notes">
                          备注
                        </label>
                        <Textarea
                          id="entry-notes"
                          rows={3}
                          value={entryNotes}
                          onChange={(event) => setEntryNotes(event.target.value)}
                          placeholder="例如：历史入库漏录，核对仓库实物后补记"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="transfer-mode">
                          调拨方式
                        </label>
                        <Select
                          id="transfer-mode"
                          value={transferMode}
                          onChange={(event) =>
                            setTransferMode(event.target.value as "TRANSIT" | "IMMEDIATE")
                          }
                        >
                          <option value="TRANSIT">物流转仓（先在途，目标仓再签收）</option>
                          <option value="IMMEDIATE">即时调拨（实物已经搬完）</option>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="transfer-source">
                          调出库存
                        </label>
                        <Select
                          id="transfer-source"
                          value={sourceKey}
                          onChange={(event) => setSourceKey(event.target.value)}
                          disabled={transferRows.length === 0}
                        >
                          {transferRows.map((row) => (
                            <option key={row.key} value={row.key}>
                              {row.skuCode} · {row.locationCode} ·{" "}
                              {row.entityType === "ITEM_UNIT"
                                ? `单件 ${row.unitCode}`
                                : `可调 ${row.bookQty}`}
                            </option>
                          ))}
                        </Select>
                        {sourceRow ? (
                          <p className="text-xs text-muted-foreground">
                            {sourceRow.skuName} · {sourceRow.locationName}
                            {sourceRow.entityType === "ITEM_UNIT"
                              ? ` · 一物一单 ${sourceRow.unitCode}`
                              : " · 批量库存"}
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-xl border bg-muted/30 p-3">
                        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
                          <div>
                            <p className="text-xs text-muted-foreground">调出</p>
                            <p className="mt-1 text-sm font-medium">
                              {sourceRow?.locationCode ?? "—"}
                            </p>
                          </div>
                          <ArrowRightLeft className="mb-1 h-4 w-4 text-muted-foreground" />
                          <div className="space-y-1.5">
                            <label
                              className="text-xs text-muted-foreground"
                              htmlFor="transfer-destination"
                            >
                              调入
                            </label>
                            <Select
                              id="transfer-destination"
                              value={destinationLocationId}
                              onChange={(event) => setDestinationLocationId(event.target.value)}
                            >
                              {destinationLocations.map((location) => (
                                <option key={location.id} value={location.id}>
                                  {location.code} · {location.name}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="transfer-quantity">
                          调拨数量
                        </label>
                        <Input
                          id="transfer-quantity"
                          type="number"
                          min={1}
                          max={sourceRow?.bookQty}
                          step={1}
                          inputMode="numeric"
                          value={transferQuantity}
                          disabled={sourceRow?.entityType === "ITEM_UNIT"}
                          onChange={(event) => setTransferQuantity(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {sourceRow?.entityType === "ITEM_UNIT"
                            ? "该商品按单件管理，本次只移动上方标识的这一件。"
                            : "页面显示的是账面数量；若其中已有订单占用，保存时会按实际可调量校验。"}
                        </p>
                      </div>

                      {transferMode === "TRANSIT" ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5 sm:col-span-2">
                            <label
                              className="text-sm font-medium"
                              htmlFor="transfer-transport-mode"
                            >
                              这一段怎么运输
                            </label>
                            <Select
                              id="transfer-transport-mode"
                              value={transportMode}
                              onChange={(event) =>
                                setTransportMode(event.target.value as typeof transportMode)
                              }
                            >
                              <option value="HAND_CARRY">我或朋友随身带</option>
                              <option value="CONSOLIDATOR">集运商 / 转运商</option>
                              <option value="POSTAL">邮局寄送</option>
                              <option value="COURIER">快递 / 配送</option>
                              <option value="FREIGHT">货运</option>
                              <option value="OTHER">其他</option>
                            </Select>
                          </div>
                          {transportMode === "HAND_CARRY" ? (
                            <div className="space-y-1.5 sm:col-span-2">
                              <label className="text-sm font-medium" htmlFor="transfer-carried-by">
                                由谁携带
                              </label>
                              <Input
                                id="transfer-carried-by"
                                value={carriedBy}
                                onChange={(event) => setCarriedBy(event.target.value)}
                                placeholder="例如：我本人、朋友小王"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="space-y-1.5">
                                <label
                                  className="text-sm font-medium"
                                  htmlFor="transfer-tracking-no"
                                >
                                  物流单号
                                </label>
                                <Input
                                  id="transfer-tracking-no"
                                  value={transferTrackingNo}
                                  onChange={(event) => setTransferTrackingNo(event.target.value)}
                                  placeholder="可稍后补充"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-sm font-medium" htmlFor="transfer-carrier">
                                  承运商
                                </label>
                                <Input
                                  id="transfer-carrier"
                                  value={transferCarrier}
                                  onChange={(event) => setTransferCarrier(event.target.value)}
                                />
                              </div>
                            </>
                          )}
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-sm font-medium" htmlFor="transfer-eta-date">
                              预计到货日
                            </label>
                            <Input
                              id="transfer-eta-date"
                              type="date"
                              value={transferEtaDate}
                              onChange={(event) => setTransferEtaDate(event.target.value)}
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="transfer-notes">
                          备注
                        </label>
                        <Textarea
                          id="transfer-notes"
                          rows={3}
                          value={transferNotes}
                          onChange={(event) => setTransferNotes(event.target.value)}
                          placeholder="例如：从日本转运仓移至日本西家仓"
                        />
                      </div>
                    </>
                  )}

                  {error ? (
                    <p
                      role="alert"
                      className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                    >
                      {error}
                    </p>
                  ) : null}
                </div>

                <div className="flex justify-end gap-2 border-t bg-muted/20 px-5 py-4">
                  <Button variant="outline" onClick={close} disabled={loading}>
                    取消
                  </Button>
                  <Button
                    onClick={mode === "ENTRY" ? submitEntry : submitTransfer}
                    disabled={
                      loading ||
                      (mode === "ENTRY" ? !entryLocationId : !sourceRow || !destinationLocationId)
                    }
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        保存中...
                      </>
                    ) : mode === "ENTRY" ? (
                      "确认录入"
                    ) : transferMode === "TRANSIT" ? (
                      "确认发出"
                    ) : (
                      "确认调拨"
                    )}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
