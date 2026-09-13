"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkItem, WorkQueue } from "@/lib/application/next-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  bulkConsolidatePurchases,
  bulkConfirmArrivals,
  bulkInboundPurchases,
  bulkReturnPurchases,
  bulkTransferPurchases,
  bulkUpdatePurchaseOrderLogistics,
} from "@/app/actions/workbench";
import { AlertCircle, CheckCircle2, Loader2, PackageCheck, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  describeBulkActionResult,
  type BulkActionNotice,
} from "@/lib/application/bulk-action-result";
import {
  WorkbenchLocationSelect,
  type WorkbenchLocationOption,
} from "@/components/workbench/location-select";

interface BulkActionToolbarProps {
  queue: WorkQueue | "all";
  items: WorkItem[];
  locations: WorkbenchLocationOption[];
  consolidationBatches: Array<{
    id: string;
    label: string;
    fromLocationId: string | null;
    toLocationId: string | null;
  }>;
  selectedIds: string[];
  onClear: () => void;
  onQueueChange?: (queue: WorkQueue) => void;
}

export function BulkActionToolbar({
  queue,
  items,
  locations,
  consolidationBatches,
  selectedIds,
  onClear,
  onQueueChange,
}: BulkActionToolbarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [purchaseTrackingNo, setPurchaseTrackingNo] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [logisticsNote, setLogisticsNote] = useState("");
  const [bulkPurchaseShippingCost, setBulkPurchaseShippingCost] = useState("");
  const [bulkPurchaseShippingCurrency, setBulkPurchaseShippingCurrency] = useState("CNY");
  const [shippedWithoutTracking, setShippedWithoutTracking] = useState(false);
  const [bulkBatchMode, setBulkBatchMode] = useState<"existing" | "new">(
    consolidationBatches.length > 0 ? "existing" : "new"
  );
  const [bulkBatchId, setBulkBatchId] = useState(consolidationBatches[0]?.id ?? "");
  const [bulkConsolidationToLocationId, setBulkConsolidationToLocationId] = useState("");
  const [bulkTransferToLocationId, setBulkTransferToLocationId] = useState("");
  const [bulkTransferTrackingNo, setBulkTransferTrackingNo] = useState("");
  const [bulkTransferCarrier, setBulkTransferCarrier] = useState("");
  const [bulkTransferEtaDate, setBulkTransferEtaDate] = useState("");
  const [bulkTransferShippingCost, setBulkTransferShippingCost] = useState("");
  const [bulkTransferShippingCurrency, setBulkTransferShippingCurrency] = useState("CNY");
  const [bulkTransferNote, setBulkTransferNote] = useState("");
  const [bulkDispositionMode, setBulkDispositionMode] = useState<
    "inbound" | "consolidate" | "transfer" | "return"
  >("inbound");
  const [bulkReturnReason, setBulkReturnReason] = useState("");
  const [bulkReturnTrackingNo, setBulkReturnTrackingNo] = useState("");
  const [bulkReturnCarrier, setBulkReturnCarrier] = useState("");
  const [bulkReturnNote, setBulkReturnNote] = useState("");
  const [notice, setNotice] = useState<BulkActionNotice | null>(null);
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const purchaseOrderIds = selectedItems
    .filter((item) => item.entityType === "purchaseOrder")
    .map((item) => item.entityId);
  const shipmentIds = selectedItems
    .filter((item) => item.entityType === "shipment")
    .map((item) => item.entityId);
  const consolidationBatchIds = Array.from(
    new Set(
      selectedItems
        .map((item) => item.metadata?.consolidationBatchId)
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    )
  );

  const inboundLocations = Array.from(
    new Set(
      selectedItems
        .filter((item) => item.entityType === "purchaseOrder")
        .map((item) => String(item.metadata?.destinationLocationName || "尚未登记收货位置"))
    )
  );
  const missingInboundLocation = selectedItems.some(
    (item) => item.entityType === "purchaseOrder" && !item.metadata?.destinationLocationId
  );

  if (selectedIds.length === 0) return null;

  const run = (fn: () => Promise<unknown>, nextQueue?: WorkQueue) => {
    startTransition(async () => {
      try {
        setNotice(null);
        const result = await fn();
        const bulkNotice = describeBulkActionResult(result);
        if (bulkNotice) {
          setNotice(bulkNotice);
          if (bulkNotice.shouldClearSelection) {
            onClear();
            if (nextQueue) onQueueChange?.(nextQueue);
          }
          if (bulkNotice.shouldRefresh) router.refresh();
          return;
        }
        onClear();
        router.refresh();
      } catch (error) {
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "批量操作失败",
          shouldRefresh: false,
          shouldClearSelection: false,
        });
      }
    });
  };

  const clearSelection = () => {
    setNotice(null);
    onClear();
  };

  return (
    <div className="mb-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">已选择 {selectedIds.length} 项</p>
        <Button variant="ghost" size="sm" onClick={clearSelection}>
          清空
        </Button>
      </div>
      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
            notice.tone === "error"
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          )}
        >
          {notice.tone === "error" ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>{notice.message}</span>
        </p>
      ) : null}

      {queue === "missingLogistics" && (
        <div className="mt-3 space-y-3 rounded-md border border-dashed bg-background/80 p-3">
          <div>
            <p className="text-sm font-medium">登记卖家发货 · 进入在途</p>
            <p className="mt-1 text-xs text-muted-foreground">
              为所选采购单填写<strong>采购物流单号</strong>，并选择
              <strong>预计到货的仓库/集运仓</strong>。
              保存后采购单变为「已发货」，进入待确认收货；与单条「填写物流」操作一致。
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="bulk-purchase-tracking">
                采购物流单号
              </Label>
              <Input
                id="bulk-purchase-tracking"
                value={purchaseTrackingNo}
                onChange={(e) => setPurchaseTrackingNo(e.target.value)}
                placeholder="卖家/平台发出的快递单号"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="bulk-destination-location">
                预计到货位置 *
              </Label>
              <WorkbenchLocationSelect
                id="bulk-destination-location"
                value={destinationLocationId}
                locations={locations}
                onChange={setDestinationLocationId}
                placeholder="请选择到货仓库或集运仓"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                货物将送达的位置（含地区），可在「设置 → 仓库位置」维护
              </p>
            </div>
          </div>
          <Checkbox
            id="bulk-shipped-without-tracking"
            checked={shippedWithoutTracking}
            onChange={(event) => setShippedWithoutTracking(event.target.checked)}
            label="暂无单号，确认已发货"
          />
          <p className="text-xs text-muted-foreground">
            保存成功后自动打开「待确认收货」；无单号的订单会标注「运单待补」。
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_100px]">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="bulk-purchase-shipping-cost">
                每张采购单邮费（选填）
              </Label>
              <Input
                id="bulk-purchase-shipping-cost"
                inputMode="decimal"
                value={bulkPurchaseShippingCost}
                onChange={(event) => setBulkPurchaseShippingCost(event.target.value)}
                placeholder="所选订单将分别记录该金额"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="bulk-purchase-shipping-currency">
                币种
              </Label>
              <Input
                id="bulk-purchase-shipping-currency"
                value={bulkPurchaseShippingCurrency}
                maxLength={3}
                onChange={(event) =>
                  setBulkPurchaseShippingCurrency(event.target.value.toUpperCase())
                }
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="bulk-logistics-note">
                备注（选填）
              </Label>
              <Input
                id="bulk-logistics-note"
                value={logisticsNote}
                onChange={(e) => setLogisticsNote(e.target.value)}
                placeholder="如：合箱发货、代签收人"
              />
            </div>
            <Button
              className="self-end"
              disabled={
                pending ||
                purchaseOrderIds.length === 0 ||
                !destinationLocationId ||
                (!purchaseTrackingNo.trim() && !shippedWithoutTracking)
              }
              onClick={() =>
                run(
                  () =>
                    bulkUpdatePurchaseOrderLogistics(purchaseOrderIds, {
                      purchaseTrackingNo,
                      shippedWithoutTracking,
                      destinationLocationId,
                      shippingCost: bulkPurchaseShippingCost,
                      shippingCurrency: bulkPurchaseShippingCurrency,
                      note: logisticsNote,
                    }),
                  "pendingArrival"
                )
              }
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
              批量补物流
            </Button>
          </div>
        </div>
      )}

      {queue === "pendingArrival" && (
        <div className="mt-3">
          <Button
            disabled={pending || (shipmentIds.length === 0 && purchaseOrderIds.length === 0)}
            onClick={() =>
              run(
                () => bulkConfirmArrivals({ shipmentIds, purchaseOrderIds }),
                "pendingDisposition"
              )
            }
          >
            <PackageCheck className="h-4 w-4" />
            批量确认到货
          </Button>
        </div>
      )}

      {queue === "inTransit" && consolidationBatchIds.length === 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            所选任务属于同一集运批次，请在批次中统一登记国际单号、发出和确认到货。
          </p>
          <Button
            variant="outline"
            onClick={() => router.push(`/logistics/consolidations/${consolidationBatchIds[0]}`)}
          >
            打开集运批次
          </Button>
        </div>
      )}

      {queue === "inTransit" && consolidationBatchIds.length === 0 && (
        <div className="mt-3">
          <Button
            disabled={pending || (shipmentIds.length === 0 && purchaseOrderIds.length === 0)}
            onClick={() => run(() => bulkConfirmArrivals({ shipmentIds, purchaseOrderIds }))}
          >
            <PackageCheck className="h-4 w-4" />
            批量确认到货
          </Button>
        </div>
      )}

      {queue === "pendingDisposition" && (
        <div className="mt-3 space-y-3">
          <div className="grid rounded-md border bg-muted/30 p-1 sm:grid-cols-4">
            {[
              ["inbound", "确认入库"],
              ["consolidate", "加入待集运"],
              ["transfer", "立即发起转仓"],
              ["return", "退货终止"],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={bulkDispositionMode === value ? "default" : "ghost"}
                className={cn(
                  "justify-center",
                  bulkDispositionMode !== value &&
                    "text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
                )}
                onClick={() => setBulkDispositionMode(value as typeof bulkDispositionMode)}
              >
                {label}
              </Button>
            ))}
          </div>

          {bulkDispositionMode === "inbound" && (
            <div className="space-y-3">
              <div className="rounded-md border bg-background p-3 text-sm">
                <p className="font-medium">按各单已确认的收货位置入库</p>
                <p className="mt-1 text-muted-foreground">{inboundLocations.join("、")}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  入库不会改变商品所在仓库。要发往其他位置，请选择「立即发起转仓」。
                </p>
              </div>
              {missingInboundLocation ? (
                <p role="alert" className="text-xs text-destructive">
                  部分采购单尚未登记收货位置，请先打开采购单确认。
                </p>
              ) : null}
              <Button
                disabled={pending || purchaseOrderIds.length === 0 || missingInboundLocation}
                onClick={() => run(() => bulkInboundPurchases({ purchaseOrderIds }))}
              >
                批量确认入库
              </Button>
            </div>
          )}

          {bulkDispositionMode === "consolidate" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">集运方式</Label>
                <Select
                  value={bulkBatchMode}
                  onChange={(event) => setBulkBatchMode(event.target.value as "existing" | "new")}
                >
                  <option value="existing" disabled={consolidationBatches.length === 0}>
                    加入已有批次
                  </option>
                  <option value="new">创建新批次</option>
                </Select>
              </div>
              {bulkBatchMode === "existing" ? (
                <div className="space-y-1">
                  <Label className="text-xs">集运批次</Label>
                  <Select
                    value={bulkBatchId}
                    onChange={(event) => setBulkBatchId(event.target.value)}
                  >
                    <option value="">请选择集运批次</option>
                    {consolidationBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">新批次目标位置</Label>
                  <Select
                    value={bulkConsolidationToLocationId}
                    onChange={(event) => setBulkConsolidationToLocationId(event.target.value)}
                  >
                    <option value="">请选择目标位置</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} · {loc.code}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <Button
                className="self-end"
                disabled={
                  pending ||
                  purchaseOrderIds.length === 0 ||
                  (bulkBatchMode === "existing" ? !bulkBatchId : !bulkConsolidationToLocationId)
                }
                onClick={() =>
                  run(() =>
                    bulkConsolidatePurchases({
                      purchaseOrderIds,
                      batchMode: bulkBatchMode,
                      batchId: bulkBatchMode === "existing" ? bulkBatchId : undefined,
                      toLocationId:
                        bulkBatchMode === "new" ? bulkConsolidationToLocationId : undefined,
                    })
                  )
                }
              >
                批量加入待集运
              </Button>
            </div>
          )}

          {bulkDispositionMode === "transfer" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">下一站位置</Label>
                <Select
                  value={bulkTransferToLocationId}
                  onChange={(event) => setBulkTransferToLocationId(event.target.value)}
                >
                  <option value="">请选择目标位置</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} · {loc.code}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">物流单号</Label>
                <Input
                  value={bulkTransferTrackingNo}
                  onChange={(event) => setBulkTransferTrackingNo(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">承运商</Label>
                <Input
                  value={bulkTransferCarrier}
                  onChange={(event) => setBulkTransferCarrier(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">预计到货日</Label>
                <Input
                  type="date"
                  value={bulkTransferEtaDate}
                  onChange={(event) => setBulkTransferEtaDate(event.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs">备注</Label>
                <Input
                  value={bulkTransferNote}
                  onChange={(event) => setBulkTransferNote(event.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:col-span-3 sm:grid-cols-[1fr_100px]">
                <div className="space-y-1">
                  <Label className="text-xs">每张转仓单邮费（选填）</Label>
                  <Input
                    inputMode="decimal"
                    value={bulkTransferShippingCost}
                    onChange={(event) => setBulkTransferShippingCost(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">币种</Label>
                  <Input
                    value={bulkTransferShippingCurrency}
                    maxLength={3}
                    onChange={(event) =>
                      setBulkTransferShippingCurrency(event.target.value.toUpperCase())
                    }
                  />
                </div>
              </div>
              <Button
                className="self-end"
                disabled={pending || purchaseOrderIds.length === 0 || !bulkTransferToLocationId}
                onClick={() =>
                  run(() =>
                    bulkTransferPurchases({
                      purchaseOrderIds,
                      toLocationId: bulkTransferToLocationId,
                      trackingNo: bulkTransferTrackingNo,
                      carrier: bulkTransferCarrier,
                      shippingCost: bulkTransferShippingCost,
                      shippingCurrency: bulkTransferShippingCurrency,
                      etaDate: bulkTransferEtaDate,
                      note: bulkTransferNote,
                    })
                  )
                }
              >
                批量立即发起转仓
              </Button>
            </div>
          )}

          {bulkDispositionMode === "return" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">退货原因</Label>
                <Input
                  value={bulkReturnReason}
                  onChange={(event) => setBulkReturnReason(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">退货物流单号</Label>
                <Input
                  value={bulkReturnTrackingNo}
                  onChange={(event) => setBulkReturnTrackingNo(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">承运商</Label>
                <Input
                  value={bulkReturnCarrier}
                  onChange={(event) => setBulkReturnCarrier(event.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs">备注</Label>
                <Input
                  value={bulkReturnNote}
                  onChange={(event) => setBulkReturnNote(event.target.value)}
                />
              </div>
              <Button
                className="self-end"
                variant="destructive"
                disabled={pending || purchaseOrderIds.length === 0}
                onClick={() =>
                  run(() =>
                    bulkReturnPurchases({
                      purchaseOrderIds,
                      reason: bulkReturnReason,
                      trackingNo: bulkReturnTrackingNo,
                      carrier: bulkReturnCarrier,
                      note: bulkReturnNote,
                    })
                  )
                }
              >
                批量退货终止
              </Button>
            </div>
          )}
        </div>
      )}

      {queue === "pendingListing" && (
        <div className="mt-3">
          <Button onClick={() => router.push("/inventory/sellable?unlisted=1")}>
            进入可售库存
          </Button>
        </div>
      )}
    </div>
  );
}
