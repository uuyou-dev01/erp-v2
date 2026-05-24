"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkItem, WorkQueue } from "@/lib/application/next-actions";
import { Button } from "@/components/ui/button";
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
import { Loader2, PackageCheck, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkActionToolbarProps {
  queue: WorkQueue | "all";
  items: WorkItem[];
  locations: Array<{ id: string; code: string; name: string; type: string }>;
  consolidationBatches: Array<{ id: string; label: string; fromLocationId: string | null; toLocationId: string | null }>;
  selectedIds: string[];
  onClear: () => void;
}

export function BulkActionToolbar({
  queue,
  items,
  locations,
  consolidationBatches,
  selectedIds,
  onClear,
}: BulkActionToolbarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tracking, setTracking] = useState("");
  const [location, setLocation] = useState("");
  const [bulkInboundLocationId, setBulkInboundLocationId] = useState("");
  const [bulkBatchMode, setBulkBatchMode] = useState<"existing" | "new">(
    consolidationBatches.length > 0 ? "existing" : "new"
  );
  const [bulkBatchId, setBulkBatchId] = useState(consolidationBatches[0]?.id ?? "");
  const [bulkConsolidationToLocationId, setBulkConsolidationToLocationId] = useState("");
  const [bulkTransferToLocationId, setBulkTransferToLocationId] = useState("");
  const [bulkTransferTrackingNo, setBulkTransferTrackingNo] = useState("");
  const [bulkTransferCarrier, setBulkTransferCarrier] = useState("");
  const [bulkTransferEtaDate, setBulkTransferEtaDate] = useState("");
  const [bulkTransferNote, setBulkTransferNote] = useState("");
  const [bulkDispositionMode, setBulkDispositionMode] = useState<"inbound" | "consolidate" | "transfer" | "return">("inbound");
  const [bulkReturnReason, setBulkReturnReason] = useState("");
  const [bulkReturnTrackingNo, setBulkReturnTrackingNo] = useState("");
  const [bulkReturnCarrier, setBulkReturnCarrier] = useState("");
  const [bulkReturnNote, setBulkReturnNote] = useState("");
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const purchaseOrderIds = selectedItems
    .filter((item) => item.entityType === "purchaseOrder")
    .map((item) => item.entityId);
  const shipmentIds = selectedItems
    .filter((item) => item.entityType === "shipment")
    .map((item) => item.entityId);

  if (selectedIds.length === 0) return null;

  const run = (fn: () => Promise<unknown>) => {
    startTransition(async () => {
      try {
        await fn();
        onClear();
        router.refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : "批量操作失败");
      }
    });
  };

  return (
    <div className="mb-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">已选择 {selectedIds.length} 项</p>
        <Button variant="ghost" size="sm" onClick={onClear}>清空</Button>
      </div>

      {queue === "missingLogistics" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs">物流单号/批次备注</Label>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">当前位置/目的地</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <Button
            className="self-end"
            disabled={pending || purchaseOrderIds.length === 0}
            onClick={() => run(() => bulkUpdatePurchaseOrderLogistics(purchaseOrderIds, {
              purchaseTrackingNo: tracking,
              note: location,
            }))}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
            批量补物流
          </Button>
        </div>
      )}

      {(queue === "inTransit" || queue === "pendingArrival") && (
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
              ["consolidate", "加入集运"],
              ["transfer", "发往其他位置"],
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
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">批量入库位置</Label>
                <Select
                  value={bulkInboundLocationId}
                  onChange={(event) => setBulkInboundLocationId(event.target.value)}
                >
                  <option value="">请选择入库位置</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} · {loc.code}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                className="self-end"
                disabled={pending || purchaseOrderIds.length === 0 || !bulkInboundLocationId}
                onClick={() => run(() => bulkInboundPurchases({
                  purchaseOrderIds,
                  locationId: bulkInboundLocationId,
                }))}
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
                  <option value="existing" disabled={consolidationBatches.length === 0}>加入已有批次</option>
                  <option value="new">创建新批次</option>
                </Select>
              </div>
              {bulkBatchMode === "existing" ? (
                <div className="space-y-1">
                  <Label className="text-xs">集运批次</Label>
                  <Select value={bulkBatchId} onChange={(event) => setBulkBatchId(event.target.value)}>
                    <option value="">请选择集运批次</option>
                    {consolidationBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>{batch.label}</option>
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
                onClick={() => run(() => bulkConsolidatePurchases({
                  purchaseOrderIds,
                  batchMode: bulkBatchMode,
                  batchId: bulkBatchMode === "existing" ? bulkBatchId : undefined,
                  toLocationId: bulkBatchMode === "new" ? bulkConsolidationToLocationId : undefined,
                }))}
              >
                批量加入集运
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
                <Input value={bulkTransferTrackingNo} onChange={(event) => setBulkTransferTrackingNo(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">承运商</Label>
                <Input value={bulkTransferCarrier} onChange={(event) => setBulkTransferCarrier(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">预计到货日</Label>
                <Input type="date" value={bulkTransferEtaDate} onChange={(event) => setBulkTransferEtaDate(event.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs">备注</Label>
                <Input value={bulkTransferNote} onChange={(event) => setBulkTransferNote(event.target.value)} />
              </div>
              <Button
                className="self-end"
                disabled={pending || purchaseOrderIds.length === 0 || !bulkTransferToLocationId}
                onClick={() => run(() => bulkTransferPurchases({
                  purchaseOrderIds,
                  toLocationId: bulkTransferToLocationId,
                  trackingNo: bulkTransferTrackingNo,
                  carrier: bulkTransferCarrier,
                  etaDate: bulkTransferEtaDate,
                  note: bulkTransferNote,
                }))}
              >
                批量发往其他位置
              </Button>
            </div>
          )}

          {bulkDispositionMode === "return" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">退货原因</Label>
                <Input value={bulkReturnReason} onChange={(event) => setBulkReturnReason(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">退货物流单号</Label>
                <Input value={bulkReturnTrackingNo} onChange={(event) => setBulkReturnTrackingNo(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">承运商</Label>
                <Input value={bulkReturnCarrier} onChange={(event) => setBulkReturnCarrier(event.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs">备注</Label>
                <Input value={bulkReturnNote} onChange={(event) => setBulkReturnNote(event.target.value)} />
              </div>
              <Button
                className="self-end"
                variant="destructive"
                disabled={pending || purchaseOrderIds.length === 0}
                onClick={() => run(() => bulkReturnPurchases({
                  purchaseOrderIds,
                  reason: bulkReturnReason,
                  trackingNo: bulkReturnTrackingNo,
                  carrier: bulkReturnCarrier,
                  note: bulkReturnNote,
                }))}
              >
                批量退货终止
              </Button>
            </div>
          )}
        </div>
      )}

      {queue === "pendingListing" && (
        <div className="mt-3">
          <Button onClick={() => router.push("/listing")}>进入批量上架入口</Button>
        </div>
      )}
    </div>
  );
}
