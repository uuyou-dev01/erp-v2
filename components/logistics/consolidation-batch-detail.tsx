"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  removeInventoryFromConsolidationBatchAction,
  repairConsolidationOriginInventoryAction,
  updateConsolidationDestinationAction,
  updateConsolidationStatusAction,
} from "@/app/actions/consolidations";
import type { TransferInventoryCandidate } from "@/app/actions/transfer-shipments";
import { ConsolidationTimeline } from "./consolidation-timeline";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Package,
  Trash2,
} from "lucide-react";
import { BackButton } from "@/components/shared/back-button";
import { ConsolidationInventoryEditor } from "./consolidation-inventory-editor";

interface Batch {
  id: string;
  status: string;
  outboundTrackingNo: string | null;
  carrier: string | null;
  storeCurrency: string;
  shippingCost: string | null;
  shippingCurrency: string;
  note: string | null;
  lines: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    quantity: string;
    displayTitle: string;
    skuCode: string | null;
    imageUrl: string | null;
    sourceReference: string;
    inventoryIssue: {
      code: string;
      currentLocationName: string;
      expectedLocationName: string;
      missingQuantity: string;
    } | null;
  }>;
  fromLocation?: { id: string; name: string } | null;
  toLocation?: { id: string; name: string } | null;
  arrivalCollaboration: {
    recipientName: string | null;
    taskStatus: string | null;
    completedAt: string | null;
  };
}

interface LocationOption {
  id: string;
  code: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "待装箱",
  SEALED: "已封箱",
  SHIPPED: "运输中",
  RECEIVED: "已到货",
};

const SOURCE_LABELS: Record<string, string> = {
  PURCHASE_LINE: "采购单",
  LOT: "批次库存",
  ITEM_UNIT: "单品库存",
};

export function ConsolidationBatchDetail({
  batch,
  locations,
  availableInventory,
}: {
  batch: Batch;
  locations: LocationOption[];
  availableInventory: TransferInventoryCandidate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [trackingNo, setTrackingNo] = useState(batch.outboundTrackingNo ?? "");
  const [carrier, setCarrier] = useState(batch.carrier ?? "");
  const [shippingCost, setShippingCost] = useState(batch.shippingCost ?? "");
  const [shippingCurrency, setShippingCurrency] = useState(
    batch.shippingCurrency || batch.storeCurrency
  );
  const [statusError, setStatusError] = useState<string | null>(null);
  const [toLocationId, setToLocationId] = useState(batch.toLocation?.id ?? "");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeMessage, setRouteMessage] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [confirmingRepair, setConfirmingRepair] = useState(false);
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);
  const [manifestCopied, setManifestCopied] = useState(false);
  const inventoryIssues = batch.lines.filter((line) => line.inventoryIssue);
  const routeEditable = batch.status === "OPEN" || batch.status === "SEALED";
  const routeReady = Boolean(batch.fromLocation && batch.toLocation);
  const manifestText = [
    `集运到仓清单 ${batch.id.slice(0, 8)}`,
    `路线：${batch.fromLocation?.name ?? "起运仓"} → ${batch.toLocation?.name ?? "目的仓"}`,
    trackingNo.trim() ? `物流单号：${trackingNo.trim()}` : null,
    carrier.trim() ? `承运商：${carrier.trim()}` : null,
    "内容物：",
    ...batch.lines.map(
      (line) => `- ${line.skuCode ? `${line.skuCode} ` : ""}${line.displayTitle} × ${line.quantity}`
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const copyManifest = async () => {
    setStatusError(null);
    try {
      await navigator.clipboard.writeText(manifestText);
      setManifestCopied(true);
      window.setTimeout(() => setManifestCopied(false), 1800);
    } catch {
      setStatusError("复制失败，请直接截图左侧的批次商品清单");
    }
  };

  const run = (status: "SEALED" | "SHIPPED" | "RECEIVED") => {
    startTransition(async () => {
      setStatusError(null);
      try {
        const result = await updateConsolidationStatusAction(batch.id, status, {
          outboundTrackingNo: trackingNo,
          carrier,
          shippingCost,
          shippingCurrency,
        });
        if (!result.success) {
          setStatusError(result.error);
          return;
        }

        router.refresh();
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "更新集运状态失败，请重试");
      }
    });
  };

  const saveDestination = () => {
    startTransition(async () => {
      setRouteError(null);
      setRouteMessage(null);
      setStatusError(null);
      try {
        const result = await updateConsolidationDestinationAction(batch.id, toLocationId);
        if (!result.success) {
          setRouteError(result.error);
          return;
        }
        setRouteMessage(`目的仓库已保存为${result.toLocationName}`);
        router.refresh();
      } catch (error) {
        setRouteError(error instanceof Error ? error.message : "保存目的仓库失败，请重试");
      }
    });
  };

  const repairOriginInventory = () => {
    startTransition(async () => {
      setStatusError(null);
      setRepairMessage(null);
      try {
        const result = await repairConsolidationOriginInventoryAction(batch.id);
        if (!result.success) {
          setStatusError(result.error);
          return;
        }
        setConfirmingRepair(false);
        setRepairMessage(
          result.repairedLines > 0
            ? `已为 ${result.repairedLines} 项商品补记转仓，库存已归集到起运仓。`
            : "起运仓库存已核对，无需补记转仓。"
        );
        router.refresh();
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "补记转仓失败，请重试");
      }
    });
  };

  const removeInventoryLine = (lineId: string) => {
    setRemovingLineId(lineId);
    startTransition(async () => {
      setStatusError(null);
      try {
        const result = await removeInventoryFromConsolidationBatchAction({
          batchId: batch.id,
          lineId,
        });
        if (!result.success) {
          setStatusError(result.error);
          return;
        }
        router.refresh();
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "移除集运商品失败，请重试");
      } finally {
        setRemovingLineId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <BackButton
            label=""
            fallbackHref="/logistics/consolidations"
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              集运批次 {batch.id.slice(0, 8)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[batch.fromLocation?.name, batch.toLocation?.name].filter(Boolean).join(" → ") ||
                "未设置路线"}
            </p>
          </div>
        </div>
        <Badge variant="outline">{STATUS_LABELS[batch.status] ?? "未知状态"}</Badge>
      </div>

      <ConsolidationTimeline status={batch.status} />

      {batch.status === "OPEN" && batch.fromLocation ? (
        <ConsolidationInventoryEditor
          batchId={batch.id}
          originName={batch.fromLocation.name}
          candidates={availableInventory}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">批次商品</h2>
          </div>
          <div className="divide-y">
            {batch.lines.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                暂无商品，可后续从工作台/采购明细加入。
              </p>
            ) : (
              batch.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {line.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={line.imageUrl}
                        alt={`${line.displayTitle} 商品图`}
                        className="h-12 w-12 shrink-0 rounded-md border bg-background object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                        <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{line.displayTitle}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {line.skuCode ? `SKU ${line.skuCode} · ` : ""}
                        {SOURCE_LABELS[line.sourceType] ?? "其他来源"} {line.sourceReference}
                      </p>
                      {line.inventoryIssue ? (
                        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-destructive">
                          <span>{line.inventoryIssue.currentLocationName}</span>
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          <span>{line.inventoryIssue.expectedLocationName}</span>
                          <span>· 缺 {line.inventoryIssue.missingQuantity} 件</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">× {line.quantity}</span>
                    {batch.status === "OPEN" &&
                    (line.sourceType === "LOT" || line.sourceType === "ITEM_UNIT") ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={isPending}
                        onClick={() => removeInventoryLine(line.id)}
                        aria-label={`移除 ${line.displayTitle}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">
                          {removingLineId === line.id ? "正在移除" : "移除"}
                        </span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-4 rounded-lg border p-4">
          <div className="space-y-3 border-b pb-4">
            <div>
              <p className="text-sm font-semibold">集运路线</p>
              <p className="mt-1 text-xs text-muted-foreground">
                起点：{batch.fromLocation?.name ?? "尚未设置"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="consolidationDestination">目的仓库</Label>
              <select
                id="consolidationDestination"
                value={toLocationId}
                disabled={!routeEditable || isPending}
                onChange={(event) => {
                  setToLocationId(event.target.value);
                  setRouteError(null);
                  setRouteMessage(null);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">请选择目的仓库</option>
                {locations
                  .filter((location) => location.id !== batch.fromLocation?.id)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} · {location.code}
                    </option>
                  ))}
              </select>
              {!batch.toLocation ? (
                <p className="text-xs leading-5 text-destructive">
                  当前批次缺少目的仓库，补充后才能封箱或发出。
                </p>
              ) : null}
            </div>
            {routeEditable ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={
                  isPending ||
                  !toLocationId ||
                  toLocationId === batch.fromLocation?.id ||
                  toLocationId === batch.toLocation?.id
                }
                onClick={saveDestination}
              >
                {batch.toLocation ? "保存目的仓库修改" : "补充目的仓库"}
              </Button>
            ) : null}
            {routeError ? (
              <p role="alert" className="text-sm text-destructive">
                {routeError}
              </p>
            ) : null}
            {routeMessage ? (
              <p role="status" className="text-sm text-emerald-700">
                {routeMessage}
              </p>
            ) : null}
          </div>
          <div className="space-y-3 border-b pb-4">
            <div>
              <p className="text-sm font-semibold">到仓协作</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {batch.status === "RECEIVED"
                  ? batch.arrivalCollaboration.taskStatus === "DONE" &&
                    batch.arrivalCollaboration.recipientName
                    ? `${batch.arrivalCollaboration.recipientName} 已完成到货确认。`
                    : "已完成到货确认。"
                  : batch.arrivalCollaboration.recipientName
                    ? batch.status === "SHIPPED"
                      ? `已通知 ${batch.arrivalCollaboration.recipientName}，等待对方核对并确认到货。`
                      : `发出后会自动通知 ${batch.arrivalCollaboration.recipientName} 确认到货。`
                    : "目的仓未绑定账号，可复制清单通过微信发送，收到回复后由你确认到货。"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={batch.lines.length === 0}
              onClick={copyManifest}
            >
              {manifestCopied ? (
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {manifestCopied ? "已复制，可发送给仓库" : "复制内容物清单"}
            </Button>
          </div>
          <div className="space-y-2">
            <Label>物流单号</Label>
            <Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>承运商</Label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_100px]">
            <div className="space-y-2">
              <Label htmlFor="consolidation-shipping-cost">集运邮费</Label>
              <Input
                id="consolidation-shipping-cost"
                inputMode="decimal"
                value={shippingCost}
                onChange={(event) => setShippingCost(event.target.value)}
                placeholder="可选，填实际支付金额"
                disabled={batch.status === "RECEIVED"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consolidation-shipping-currency">币种</Label>
              <Input
                id="consolidation-shipping-currency"
                value={shippingCurrency}
                onChange={(event) => setShippingCurrency(event.target.value.toUpperCase())}
                maxLength={3}
                disabled={batch.status === "RECEIVED"}
              />
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            发出时记入物流成本台账，并计入当月报表的集运物流费。
          </p>
          {inventoryIssues.length > 0 ? (
            <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">
                    {inventoryIssues.length} 项库存未到起运仓
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    系统会保留采购单的实际到货仓记录，并补记到
                    {batch.fromLocation?.name ?? "起运仓"}的仓间转移流水。
                  </p>
                </div>
              </div>
              {confirmingRepair ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs leading-5 text-muted-foreground">
                    确认后将生成可追溯的转出、转入记录；不会改写采购单的历史到货仓。
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={isPending}
                      onClick={() => setConfirmingRepair(false)}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      disabled={isPending}
                      onClick={repairOriginInventory}
                    >
                      确认补记
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isPending}
                  onClick={() => setConfirmingRepair(true)}
                >
                  处理库存不一致
                </Button>
              )}
            </div>
          ) : null}
          {repairMessage ? (
            <div
              role="status"
              className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{repairMessage}</p>
            </div>
          ) : null}
          {statusError ? (
            <div
              role="alert"
              className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{statusError}</p>
            </div>
          ) : null}
          <div>
            {batch.status === "OPEN" ? (
              <Button
                variant="outline"
                className="w-full"
                disabled={isPending || !routeReady}
                onClick={() => run("SEALED")}
              >
                封箱
              </Button>
            ) : null}
            {batch.status === "SEALED" ? (
              <Button
                className="w-full"
                disabled={isPending || !routeReady}
                onClick={() => run("SHIPPED")}
              >
                填写物流并发出
              </Button>
            ) : null}
            {batch.status === "SHIPPED" ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={isPending}
                onClick={() => run("RECEIVED")}
              >
                确认到货
              </Button>
            ) : null}
            {batch.status === "RECEIVED" ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                已完成到货确认
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
