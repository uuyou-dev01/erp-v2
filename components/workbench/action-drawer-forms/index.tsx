"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { WorkItemDetail } from "@/lib/application/workflow-queries";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  submitConfirmArrival,
  submitConfirmDelivery,
  submitCancelOrder,
  submitConfirmOrder,
  submitCreateListing,
  submitFillLogistics,
  submitConsolidatePurchase,
  submitInbound,
  submitRegisterReturn,
  submitApproveReturnInspection,
  submitResolveException,
  submitReturnPurchase,
  submitSettleOrder,
  submitSaveShippingProof,
  submitShipOrder,
  submitShipmentArrivalProcessing,
  submitTransferPurchase,
} from "@/app/actions/workflow-actions";
import { parseShippingProof } from "@/lib/application/shipping-proof";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  WorkbenchLocationSelect,
  findWorkbenchLocationId,
  type WorkbenchLocationOption,
} from "@/components/workbench/location-select";

export type WorkbenchPlatformOption = {
  id: string;
  code: string;
  name: string;
  defaultCurrency: string | null;
  defaultFeeRate: string | null;
  defaultShippingFee: string | null;
  shippingRules: unknown;
};

interface ActionFormProps {
  detail: WorkItemDetail;
  locations?: WorkbenchLocationOption[];
  consolidationBatches?: ConsolidationBatchOption[];
  pending: boolean;
  run: (fn: () => Promise<unknown>, options?: { keepOpen?: boolean; successMessage?: string }) => void;
}

interface ConsolidationBatchOption {
  id: string;
  label: string;
  fromLocationId: string | null;
  toLocationId: string | null;
}

function SubmitButton({
  pending,
  disabled,
  children,
  variant,
}: {
  pending: boolean;
  disabled?: boolean;
  children: ReactNode;
  variant?: "default" | "destructive" | "outline";
}) {
  return (
    <Button type="submit" disabled={pending || disabled} variant={variant} className="w-full">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

export function FillLogisticsForm({ detail, locations, pending, run }: ActionFormProps) {
  const [form, setForm] = useState({
    destinationLocationId: findWorkbenchLocationId(
      locations,
      detail.actionContext.currentLocationText ?? detail.actionContext.location
    ),
    purchaseTrackingNo: detail.actionContext.purchaseTrackingNo ?? detail.actionContext.trackingNo ?? "",
    note: "",
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submitFillLogistics(detail.entityType, detail.entityId, form));
      }}
    >
      <p className="text-xs text-muted-foreground">
        登记卖家已发货：填写采购物流单号并选择预计到货位置，保存后进入待确认收货。
      </p>
      <div className="space-y-2">
        <Label>采购物流单号</Label>
        <Input
          value={form.purchaseTrackingNo}
          onChange={(event) => setForm((value) => ({ ...value, purchaseTrackingNo: event.target.value }))}
          placeholder="购买地发出的物流单号"
        />
      </div>
      <div className="space-y-2">
        <Label>预计到货位置 *</Label>
        <WorkbenchLocationSelect
          id="destinationLocationId"
          value={form.destinationLocationId}
          locations={locations}
          onChange={(destinationLocationId) => setForm((value) => ({ ...value, destinationLocationId }))}
          placeholder="请选择到货仓库或集运仓"
          required
        />
        <p className="text-xs text-muted-foreground">
          选择这批采购预计送达的仓库/集运仓（含地区）
        </p>
      </div>
      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} />
      </div>
      <SubmitButton pending={pending}>保存并进入待确认收货</SubmitButton>
    </form>
  );
}

export function ConfirmArrivalForm({
  detail,
  locations,
  pending,
  run,
}: ActionFormProps) {
  const [form, setForm] = useState({
    arrivedAt: todayDateValue(),
    arrivalLocationId: findWorkbenchLocationId(
      locations,
      detail.actionContext.currentLocationText ?? detail.actionContext.location
    ),
    isComplete: true,
    note: "",
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submitConfirmArrival(detail.entityType, detail.entityId, form));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>到货时间</Label>
          <Input type="date" value={form.arrivedAt} onChange={(event) => setForm((value) => ({ ...value, arrivedAt: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>到货位置</Label>
          <WorkbenchLocationSelect
            id="arrivalLocationId"
            value={form.arrivalLocationId}
            locations={locations}
            onChange={(arrivalLocationId) => setForm((value) => ({ ...value, arrivalLocationId }))}
            placeholder="请选择到货地区或仓库"
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Checkbox checked={form.isComplete} onChange={(event) => setForm((value) => ({ ...value, isComplete: event.target.checked }))} label="完整到货" />
      </div>
      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} />
      </div>
      <SubmitButton pending={pending}>
        {detail.primaryAction === "receivePurchase" ? "确认收货并进入待分流" : "确认到货并进入待分流"}
      </SubmitButton>
    </form>
  );
}

export function ShipmentArrivalProcessingForm({ detail, locations, pending, run }: ActionFormProps) {
  const defaultLocationId = findWorkbenchLocationId(
    locations,
    detail.actionContext.currentLocationText ?? detail.actionContext.location
  );
  const hasUsedLine = detail.lineItems?.some((line) =>
    /中古|二手|used/i.test(line.conditionType ?? "")
  );
  const [form, setForm] = useState({
    arrivedAt: todayDateValue(),
    inboundLocationId: defaultLocationId,
    isComplete: true,
    result: "PASSED" as "PASSED" | "FAILED",
    conditionType: hasUsedLine ? "USED" : "NEW",
    isNewSealed: !hasUsedLine,
    packageComplete: true,
    missingParts: "",
    conditionGrade: "",
    scratchNote: "",
    serialNo: "",
    returnReason: "",
    trackingNo: "",
    carrier: "",
    note: "",
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submitShipmentArrivalProcessing(detail.entityType, detail.entityId, form));
      }}
    >
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-semibold">运输到达处理</p>
        <p className="mt-1 text-xs text-muted-foreground">
          用于集运、转仓或跨境段到达后，确认检查并入可售库存。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>到达时间</Label>
          <Input
            type="date"
            value={form.arrivedAt}
            onChange={(event) => setForm((value) => ({ ...value, arrivedAt: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>入库 / 可售位置</Label>
          <WorkbenchLocationSelect
            id="shipmentArrivalInboundLocationId"
            value={form.inboundLocationId}
            locations={locations}
            onChange={(inboundLocationId) => setForm((value) => ({ ...value, inboundLocationId }))}
            placeholder="请选择实际入库或可售位置"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Checkbox
          checked={form.isComplete}
          onChange={(event) => setForm((value) => ({ ...value, isComplete: event.target.checked }))}
          label="完整到达"
        />
        <Checkbox
          checked={form.result === "PASSED"}
          onChange={(event) => setForm((value) => ({ ...value, result: event.target.checked ? "PASSED" : "FAILED" }))}
          label="检查通过"
        />
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-semibold">检查信息</p>
          <p className="mt-1 text-xs text-muted-foreground">
            新品可轻量确认；中古或异常商品请补充成色、划痕、盒况和编号。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>商品类型</Label>
            <Select
              value={form.conditionType}
              onChange={(event) => setForm((value) => ({ ...value, conditionType: event.target.value }))}
            >
              <option value="NEW">新品</option>
              <option value="USED">中古 / 二手</option>
              <option value="RISK">瑕疵 / 高风险</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>编号</Label>
            <Input value={form.serialNo} onChange={(event) => setForm((value) => ({ ...value, serialNo: event.target.value }))} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox
            checked={form.isNewSealed}
            onChange={(event) => setForm((value) => ({ ...value, isNewSealed: event.target.checked }))}
            label="全新未拆 / 外箱正常"
          />
          <Checkbox
            checked={form.packageComplete}
            onChange={(event) => setForm((value) => ({ ...value, packageComplete: event.target.checked }))}
            label="包装和配件完整"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>缺件 / 少件说明</Label>
            <Input value={form.missingParts} onChange={(event) => setForm((value) => ({ ...value, missingParts: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>成色</Label>
            <Input value={form.conditionGrade} onChange={(event) => setForm((value) => ({ ...value, conditionGrade: event.target.value }))} placeholder="A、B、C 或文字描述" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>划痕 / 黄化 / 盒况 / 异常描述</Label>
          <Textarea value={form.scratchNote} onChange={(event) => setForm((value) => ({ ...value, scratchNote: event.target.value }))} />
        </div>
      </div>

      {form.result === "FAILED" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>异常 / 退货原因</Label>
            <Input value={form.returnReason} onChange={(event) => setForm((value) => ({ ...value, returnReason: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>退货单号</Label>
            <Input value={form.trackingNo} onChange={(event) => setForm((value) => ({ ...value, trackingNo: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>承运商</Label>
            <Input value={form.carrier} onChange={(event) => setForm((value) => ({ ...value, carrier: event.target.value }))} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} />
      </div>
      <SubmitButton pending={pending} variant={form.result === "FAILED" ? "destructive" : "default"}>
        {form.result === "PASSED" ? "确认到达并入库" : "标记异常并终止"}
      </SubmitButton>
    </form>
  );
}

export function InboundForm({ detail, locations, pending, run }: ActionFormProps) {
  const [form, setForm] = useState({
    locationId: findWorkbenchLocationId(
      locations,
      detail.actionContext.currentLocationText ?? detail.actionContext.location
    ),
    note: "",
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submitInbound(detail.entityType, detail.entityId, form));
      }}
    >
      <div className="space-y-2">
        <Label>入库位置</Label>
        <WorkbenchLocationSelect
          id="inboundLocationId"
          value={form.locationId}
          locations={locations}
          onChange={(locationId) => setForm((value) => ({ ...value, locationId }))}
          placeholder="请选择入库地区或仓库"
        />
      </div>
      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} />
      </div>
      <SubmitButton pending={pending}>确认入库</SubmitButton>
    </form>
  );
}

export function DispositionForm({
  detail,
  locations,
  consolidationBatches = [],
  pending,
  run,
}: ActionFormProps) {
  const defaultLocationId = findWorkbenchLocationId(
    locations,
    detail.actionContext.currentLocationText ?? detail.actionContext.location
  );
  const [mode, setMode] = useState<"inbound" | "consolidate" | "transfer" | "return">("inbound");
  const [inboundForm, setInboundForm] = useState({ locationId: defaultLocationId, note: "" });
  const [consolidationForm, setConsolidationForm] = useState<{
    batchMode: "existing" | "new";
    batchId: string;
    fromLocationId: string;
    toLocationId: string;
    note: string;
  }>({
    batchMode: consolidationBatches.length > 0 ? "existing" : "new",
    batchId: consolidationBatches[0]?.id ?? "",
    fromLocationId: defaultLocationId,
    toLocationId: "",
    note: "",
  });
  const [transferForm, setTransferForm] = useState({
    toLocationId: "",
    trackingNo: "",
    carrier: "",
    etaDate: "",
    note: "",
  });
  const [returnForm, setReturnForm] = useState({
    reason: "",
    trackingNo: "",
    carrier: "",
    note: "",
  });

  const submit = () => {
    if (mode === "inbound") {
      return run(() => submitInbound(detail.entityType, detail.entityId, inboundForm));
    }
    if (mode === "consolidate") {
      return run(() => submitConsolidatePurchase(detail.entityType, detail.entityId, consolidationForm));
    }
    if (mode === "return") {
      return run(() => submitReturnPurchase(detail.entityType, detail.entityId, returnForm));
    }
    return run(() => submitTransferPurchase(detail.entityType, detail.entityId, transferForm));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        role="tablist"
        aria-label="分流操作"
        className="grid rounded-lg border bg-muted/30 p-1 text-sm sm:grid-cols-4"
      >
        {[
          ["inbound", "确认入库"],
          ["consolidate", "加入集运"],
          ["transfer", "发往其他位置"],
          ["return", "退货终止"],
        ].map(([value, label]) => (
          <Button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            variant={mode === value ? "default" : "ghost"}
            className={cn(
              "justify-center",
              mode !== value &&
                "text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
            )}
            onClick={() => setMode(value as typeof mode)}
          >
            {label}
          </Button>
        ))}
      </div>

      {mode === "inbound" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>入库位置</Label>
            <WorkbenchLocationSelect
              id="dispositionInboundLocationId"
              value={inboundForm.locationId}
              locations={locations}
              onChange={(locationId) => setInboundForm((value) => ({ ...value, locationId }))}
              placeholder="请选择入库地区或仓库"
            />
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={inboundForm.note}
              onChange={(event) => setInboundForm((value) => ({ ...value, note: event.target.value }))}
            />
          </div>
          <SubmitButton pending={pending}>确认入库</SubmitButton>
        </div>
      )}

      {mode === "consolidate" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>集运方式</Label>
            <Select
              value={consolidationForm.batchMode}
              onChange={(event) =>
                setConsolidationForm((value) => ({
                  ...value,
                  batchMode: event.target.value as "existing" | "new",
                }))
              }
            >
              <option value="existing" disabled={consolidationBatches.length === 0}>
                加入已有批次
              </option>
              <option value="new">创建新批次</option>
            </Select>
          </div>
          {consolidationForm.batchMode === "existing" ? (
            <div className="space-y-2">
              <Label>已有集运批次</Label>
              <Select
                value={consolidationForm.batchId}
                onChange={(event) =>
                  setConsolidationForm((value) => ({ ...value, batchId: event.target.value }))
                }
                required
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>起点位置</Label>
                <WorkbenchLocationSelect
                  id="consolidationFromLocationId"
                  value={consolidationForm.fromLocationId}
                  locations={locations}
                  onChange={(fromLocationId) =>
                    setConsolidationForm((value) => ({ ...value, fromLocationId }))
                  }
                  placeholder="请选择集运起点"
                />
              </div>
              <div className="space-y-2">
                <Label>目标位置</Label>
                <WorkbenchLocationSelect
                  id="consolidationToLocationId"
                  value={consolidationForm.toLocationId}
                  locations={locations}
                  onChange={(toLocationId) =>
                    setConsolidationForm((value) => ({ ...value, toLocationId }))
                  }
                  placeholder="请选择集运目标"
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={consolidationForm.note}
              onChange={(event) =>
                setConsolidationForm((value) => ({ ...value, note: event.target.value }))
              }
            />
          </div>
          <SubmitButton pending={pending}>加入集运</SubmitButton>
        </div>
      )}

      {mode === "transfer" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>目标位置</Label>
            <WorkbenchLocationSelect
              id="transferToLocationId"
              value={transferForm.toLocationId}
              locations={locations}
              onChange={(toLocationId) => setTransferForm((value) => ({ ...value, toLocationId }))}
              placeholder="请选择下一站位置"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>物流单号</Label>
              <Input
                value={transferForm.trackingNo}
                onChange={(event) => setTransferForm((value) => ({ ...value, trackingNo: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>承运商</Label>
              <Input
                value={transferForm.carrier}
                onChange={(event) => setTransferForm((value) => ({ ...value, carrier: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>预计到货日</Label>
              <Input
                type="date"
                value={transferForm.etaDate}
                onChange={(event) => setTransferForm((value) => ({ ...value, etaDate: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={transferForm.note}
              onChange={(event) => setTransferForm((value) => ({ ...value, note: event.target.value }))}
            />
          </div>
          <SubmitButton pending={pending}>发往其他位置</SubmitButton>
        </div>
      )}

      {mode === "return" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>退货原因</Label>
            <Input
              value={returnForm.reason}
              onChange={(event) => setReturnForm((value) => ({ ...value, reason: event.target.value }))}
              placeholder="卖家协商退货、商品不符、取消转卖..."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>退货物流单号</Label>
              <Input
                value={returnForm.trackingNo}
                onChange={(event) => setReturnForm((value) => ({ ...value, trackingNo: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>承运商</Label>
              <Input
                value={returnForm.carrier}
                onChange={(event) => setReturnForm((value) => ({ ...value, carrier: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={returnForm.note}
              onChange={(event) => setReturnForm((value) => ({ ...value, note: event.target.value }))}
            />
          </div>
          <Button type="submit" disabled={pending} variant="destructive" className="w-full">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            确认退货并结束
          </Button>
        </div>
      )}
    </form>
  );
}

export function CreateListingForm({
  detail,
  platforms,
  pending,
  run,
}: ActionFormProps & { platforms: WorkbenchPlatformOption[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const togglePlatform = (platformId: string, checked: boolean) => {
    setSelectedIds((ids) =>
      checked ? [...ids, platformId] : ids.filter((id) => id !== platformId)
    );
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          submitCreateListing(detail.entityType, detail.entityId, {
            platformIds: selectedIds,
          })
        );
      }}
    >
      <div className="space-y-2">
        <Label>平台（可多选）</Label>
        {platforms.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            暂无平台，请先在「库存设置 → 销售平台配置」中添加销售平台。
          </p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
            {platforms.map((platform) => (
              <label
                key={platform.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedIds.includes(platform.id)}
                  onChange={(event) => togglePlatform(platform.id, event.target.checked)}
                />
                <span className="min-w-0 flex-1 text-sm font-medium leading-tight">{platform.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <SubmitButton pending={pending} disabled={selectedIds.length === 0 || platforms.length === 0}>
        添加上架记录{selectedIds.length > 1 ? `（${selectedIds.length} 个平台）` : ""}
      </SubmitButton>
    </form>
  );
}

function proofFromDetail(detail: WorkItemDetail) {
  const json = detail.actionContext.shippingProofJson;
  if (!json) return parseShippingProof(null);
  try {
    return parseShippingProof(JSON.parse(json));
  } catch {
    return parseShippingProof(null);
  }
}

export function ShipOrderForm({ detail, pending, run }: ActionFormProps) {
  const initialProof = proofFromDetail(detail);
  const [uploading, setUploading] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [draftHint, setDraftHint] = useState(
    initialProof.updatedAt ? "已加载暂存内容" : ""
  );
  const [checks, setChecks] = useState({
    proofChecked: false,
    shipperChecked: false,
    shippedConfirmed: false,
  });
  const [form, setForm] = useState({
    shipper: initialProof.shipper ?? "",
    shippingMethod: initialProof.shippingMethod ?? "",
    trackingNo: detail.actionContext.trackingNo ?? "",
    pickupCode: initialProof.pickupCode ?? "",
    proofNote: initialProof.proofNote ?? "",
    imageUrls: initialProof.imageUrls ?? [],
  });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert("不支持的文件类型。仅支持 JPEG、PNG、GIF 和 WebP。");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("文件过大，最大 5MB。");
      return;
    }

    setUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "上传失败");
      }
      const { url } = await response.json();
      setForm((value) => ({ ...value, imageUrls: [...value.imageUrls, url] }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const payload = () => ({
    shipper: form.shipper,
    shippingMethod: form.shippingMethod,
    trackingNo: form.trackingNo,
    pickupCode: form.pickupCode,
    proofNote: form.proofNote,
    imageUrls: form.imageUrls,
  });

  const persistDraft = (
    next: typeof form,
    options?: { successMessage?: string; silent?: boolean }
  ) => {
    run(
      () =>
        submitSaveShippingProof(detail.entityId, {
          shipper: next.shipper,
          shippingMethod: next.shippingMethod,
          trackingNo: next.trackingNo,
          pickupCode: next.pickupCode,
          proofNote: next.proofNote,
          imageUrls: next.imageUrls,
        }),
      {
        keepOpen: true,
        successMessage: options?.silent
          ? undefined
          : options?.successMessage ??
            "已暂存。代发方可查看凭证，发出后再点「确认已发货」。",
      }
    );
  };

  const removeImage = (url: string) => {
    const next = {
      ...form,
      imageUrls: form.imageUrls.filter((item) => item !== url),
    };
    setForm(next);
    persistDraft(next, { silent: true });
  };

  const allChecksPassed =
    checks.proofChecked && checks.shipperChecked && checks.shippedConfirmed;

  const openConfirmStep = () => {
    setChecks({ proofChecked: false, shipperChecked: false, shippedConfirmed: false });
    setConfirmStep(true);
  };

  if (confirmStep) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">发货前请核对以下内容</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>发货人：{form.shipper.trim() || "未填写"}</li>
            <li>发货方式：{form.shippingMethod.trim() || "未填写"}</li>
            <li>取件码：{form.pickupCode.trim() || "未填写"}</li>
            <li>凭证图片：{form.imageUrls.length} 张</li>
            <li>运单号：{form.trackingNo.trim() || "未填写"}</li>
          </ul>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <Checkbox
            checked={checks.proofChecked}
            onChange={(event) =>
              setChecks((value) => ({ ...value, proofChecked: event.target.checked }))
            }
            label="我已核对取件码 / 二维码等发货凭证"
          />
          <Checkbox
            checked={checks.shipperChecked}
            onChange={(event) =>
              setChecks((value) => ({ ...value, shipperChecked: event.target.checked }))
            }
            label="我已核对发货人 / 发货方式信息"
          />
          <Checkbox
            checked={checks.shippedConfirmed}
            onChange={(event) =>
              setChecks((value) => ({ ...value, shippedConfirmed: event.target.checked }))
            }
            label="我确认货物已由发货方发出，同意扣减库存"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setConfirmStep(false)}
          >
            返回修改
          </Button>
          <Button
            type="button"
            disabled={pending || !allChecksPassed}
            onClick={() => run(() => submitShipOrder(detail.entityId, payload()))}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              "确认已发货"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        openConfirmStep();
      }}
    >
      {draftHint ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-800">
          {draftHint}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>发货人</Label>
          <Input
            value={form.shipper}
            onChange={(event) => setForm((value) => ({ ...value, shipper: event.target.value }))}
            placeholder="实际发货方 / 代发人"
          />
        </div>
        <div className="space-y-2">
          <Label>发货方式</Label>
          <Input
            value={form.shippingMethod}
            onChange={(event) =>
              setForm((value) => ({ ...value, shippingMethod: event.target.value }))
            }
            placeholder="如：平台上门取件、自送驿站"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>运单号</Label>
        <Input
          value={form.trackingNo}
          onChange={(event) => setForm((value) => ({ ...value, trackingNo: event.target.value }))}
          placeholder="选填，代发完成后可补"
        />
      </div>
      <div className="space-y-2">
        <Label>取件码 / 交接码</Label>
        <Input
          value={form.pickupCode}
          onChange={(event) => setForm((value) => ({ ...value, pickupCode: event.target.value }))}
          placeholder="平台取件码、代收码、验证码等"
        />
      </div>
      <div className="space-y-2">
        <Label>发货凭证图片</Label>
        <p className="text-xs text-muted-foreground">
          可上传平台二维码、取件截图等；可先暂存，发给代发方后再确认发货
        </p>
        {form.imageUrls.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {form.imageUrls.map((url) => (
              <div key={url} className="relative">
                <img
                  src={url}
                  alt="发货凭证"
                  className="h-20 w-20 rounded-md border object-cover"
                />
                <button
                  type="button"
                  className="absolute -right-1 -top-1 z-10 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground shadow"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeImage(url);
                  }}
                >
                  删
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <Input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
          disabled={pending || uploading}
          onChange={handleImageUpload}
        />
        {uploading ? (
          <p className="text-xs text-muted-foreground">图片上传中...</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>发货凭证备注</Label>
        <Textarea
          value={form.proofNote}
          onChange={(event) => setForm((value) => ({ ...value, proofNote: event.target.value }))}
          placeholder="补充说明，如取件时间、联系人等"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || uploading}
          onClick={() => {
            setDraftHint("已暂存，可继续编辑；代发方发出后再确认发货");
            persistDraft(form);
          }}
        >
          暂存
        </Button>
        <SubmitButton pending={pending || uploading}>确认已发货</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        「暂存」仅保存凭证，不扣库存；发货方实际发出后，再核对并确认发货。
      </p>

      <CancelOrderSection detail={detail} pending={pending} run={run} />
    </form>
  );
}

export function ShippedOrderForm({ detail, pending, run }: ActionFormProps) {
  const proof = proofFromDetail(detail);
  const shippedAt = detail.actionContext.shippedAt
    ? new Date(detail.actionContext.shippedAt).toLocaleString("zh-CN")
    : null;

  const handleConfirmDelivery = () => {
    const ok = confirm(
      "确认买家已收到货物？\n\n确认后将进入「待结算」，用于录入实际手续费和利润。\n如发生退货，请先登记退货。"
    );
    if (!ok) return;
    run(() => submitConfirmDelivery(detail.entityId));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
        {shippedAt ? <p>发货时间：{shippedAt}</p> : null}
        <p>运单号：{detail.actionContext.trackingNo?.trim() || "未填写"}</p>
        {proof.shipper ? <p>发货人：{proof.shipper}</p> : null}
        {proof.shippingMethod ? <p>发货方式：{proof.shippingMethod}</p> : null}
        {proof.pickupCode ? <p>取件码：{proof.pickupCode}</p> : null}
        {proof.proofNote ? (
          <p className="whitespace-pre-wrap text-muted-foreground">备注：{proof.proofNote}</p>
        ) : null}
        {proof.imageUrls && proof.imageUrls.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {proof.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt="发货凭证"
                  className="h-20 w-20 rounded-md border object-cover"
                />
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        「已发货」用于在途跟进：等待妥投，或在此登记退货。确认妥投后再进入待结算。
      </p>

      <Button type="button" disabled={pending} onClick={handleConfirmDelivery}>
        确认妥投，进入待结算
      </Button>

      <OrderReturnSection detail={detail} pending={pending} run={run} />
    </div>
  );
}

function OrderReturnSection({ detail, pending, run }: ActionFormProps) {
  const [returnForm, setReturnForm] = useState({
    note: "",
    returnTrackingNo: "",
    restockMode: "RETURN_CHECK" as "RETURN_CHECK" | "AVAILABLE",
    refundAmount: "",
    platformFeeReversal: "",
    shippingFeeReversal: "",
  });

  const handleRegisterReturn = () => {
    if (!returnForm.note.trim()) {
      alert("请填写退货说明");
      return;
    }

    const restockHint =
      returnForm.restockMode === "AVAILABLE"
        ? "单品将直接回到可售库存。"
        : "单品将进入「退货检查」，需检验后再上架。";
    const ok = confirm(
      `确认登记退货？\n\n${restockHint}\n批次库存将按原分配数量回滚到对应批次。`
    );
    if (!ok) return;

    run(() => submitRegisterReturn(detail.entityId, returnForm));
  };

  return (
    <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
      <div>
        <p className="text-sm font-medium text-destructive">登记退货</p>
        <p className="mt-1 text-xs text-muted-foreground">
          登记后订单变为「已退货」，并自动冲回发货时扣减的库存。
        </p>
      </div>

      <div className="space-y-2">
        <Label>退货说明 *</Label>
        <Textarea
          value={returnForm.note}
          onChange={(event) =>
            setReturnForm((value) => ({ ...value, note: event.target.value }))
          }
          placeholder="如：买家拒收、平台退款、发错货等"
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label>退货物流单号</Label>
        <Input
          value={returnForm.returnTrackingNo}
          onChange={(event) =>
            setReturnForm((value) => ({ ...value, returnTrackingNo: event.target.value }))
          }
          placeholder="选填"
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label>单品回库方式</Label>
        <Select
          value={returnForm.restockMode}
          onChange={(event) =>
            setReturnForm((value) => ({
              ...value,
              restockMode: event.target.value as "RETURN_CHECK" | "AVAILABLE",
            }))
          }
          disabled={pending}
        >
          <option value="RETURN_CHECK">退货待检（默认，检验后再售）</option>
          <option value="AVAILABLE">直接回可售</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          批次 SKU 库存始终按数量回滚到原批次；此选项仅影响中古单品。
        </p>
      </div>

      <div className="space-y-2 rounded-md border bg-background/80 p-3">
        <p className="text-sm font-medium">财务冲回（选填）</p>
        <p className="text-xs text-muted-foreground">
          登记退货时可同步录入平台退款与手续费冲回，写入订单财务快照，便于后续对账。
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>平台退款金额</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={returnForm.refundAmount}
              onChange={(event) =>
                setReturnForm((value) => ({ ...value, refundAmount: event.target.value }))
              }
              placeholder="退回买家"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label>手续费冲回</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={returnForm.platformFeeReversal}
              onChange={(event) =>
                setReturnForm((value) => ({
                  ...value,
                  platformFeeReversal: event.target.value,
                }))
              }
              placeholder="平台退还"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label>邮费冲回</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={returnForm.shippingFeeReversal}
              onChange={(event) =>
                setReturnForm((value) => ({
                  ...value,
                  shippingFeeReversal: event.target.value,
                }))
              }
              placeholder="邮费退还"
              disabled={pending}
            />
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={pending}
        onClick={handleRegisterReturn}
      >
        登记退货并回滚库存
      </Button>
    </div>
  );
}

export function CancelOrderSection({ detail, pending, run }: ActionFormProps) {
  const [reason, setReason] = useState("");

  if (detail.primaryAction !== "shipOrder" && detail.primaryAction !== "confirmOrder") {
    return null;
  }

  const handleCancel = () => {
    if (!reason.trim()) {
      alert("请填写取消原因");
      return;
    }
    const ok = confirm(
      "确认取消订单？\n\n将释放已预留库存，不会扣减实物库存。取消后不可恢复为待发货。"
    );
    if (!ok) return;
    run(() => submitCancelOrder(detail.entityId, { reason }));
  };

  return (
    <div className="space-y-3 rounded-lg border border-muted bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium">取消订单（未发货）</p>
        <p className="mt-1 text-xs text-muted-foreground">
          适用于买家取消、重复下单等场景。会释放库存预留，不走退货冲回逻辑。
        </p>
      </div>
      <div className="space-y-2">
        <Label>取消原因 *</Label>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="如：买家取消、重复下单、信息有误"
          disabled={pending}
        />
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={handleCancel}>
        取消订单并释放预留
      </Button>
    </div>
  );
}

export function ReturnInspectionForm({ detail, pending, run }: ActionFormProps) {
  const [note, setNote] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
        <p>仓位：{detail.actionContext.location ?? "-"}</p>
        <p>成色：{detail.actionContext.conditionGrade ?? "未标注"}</p>
        {detail.actionContext.notes ? (
          <p className="whitespace-pre-wrap text-muted-foreground">
            备注：{detail.actionContext.notes}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        检验通过后单品回到可售库存，可重新添加上架记录。
      </p>
      <div className="space-y-2">
        <Label>检验备注</Label>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="如：包装完好、配件齐全"
          disabled={pending}
        />
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={() => run(() => submitApproveReturnInspection(detail.entityId, { note }))}
      >
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        检验放行，回到可售
      </Button>
    </div>
  );
}

export function SettleOrderForm({ detail, pending, run }: ActionFormProps) {
  const [form, setForm] = useState({
    actualSalePrice: "",
    platformFee: detail.actionContext.platformFee ?? "",
    shippingFee: detail.actionContext.shippingFee ?? "",
    actualReceived: "",
    fxRate: "",
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submitSettleOrder(detail.entityId, form));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>实际售价</Label>
          <Input type="number" value={form.actualSalePrice} onChange={(event) => setForm((value) => ({ ...value, actualSalePrice: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>实际到账</Label>
          <Input type="number" value={form.actualReceived} onChange={(event) => setForm((value) => ({ ...value, actualReceived: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>实际手续费</Label>
          <Input type="number" value={form.platformFee} onChange={(event) => setForm((value) => ({ ...value, platformFee: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>实际邮费</Label>
          <Input type="number" value={form.shippingFee} onChange={(event) => setForm((value) => ({ ...value, shippingFee: event.target.value }))} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>汇率</Label>
          <Input type="number" value={form.fxRate} onChange={(event) => setForm((value) => ({ ...value, fxRate: event.target.value }))} />
        </div>
      </div>
      <SubmitButton pending={pending}>完成结算</SubmitButton>

      <OrderReturnSection detail={detail} pending={pending} run={run} />
    </form>
  );
}

export function ConfirmOrderButton({ detail, pending, run }: ActionFormProps) {
  return (
    <Button disabled={pending} className="w-full" onClick={() => run(() => submitConfirmOrder(detail.entityId))}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      确认订单并进入待发货
    </Button>
  );
}

export function ResolveExceptionButton({ detail, pending, run }: ActionFormProps) {
  return (
    <Button disabled={pending} className="w-full" onClick={() => run(() => submitResolveException(detail.entityType, detail.entityId))}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      重新处理
    </Button>
  );
}

export function OpenDetailLink({ detail }: { detail: WorkItemDetail }) {
  return (
    <Link
      href={detail.detailHref ?? "/workbench"}
      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"
    >
      <ExternalLink className="h-4 w-4" />
      打开完整详情
    </Link>
  );
}
