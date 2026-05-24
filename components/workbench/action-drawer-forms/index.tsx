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
  submitConfirmOrder,
  submitCreateListing,
  submitFillLogistics,
  submitConsolidatePurchase,
  submitInbound,
  submitResolveException,
  submitReturnPurchase,
  submitSettleOrder,
  submitShipOrder,
  submitShipmentArrivalProcessing,
  submitTransferPurchase,
} from "@/app/actions/workflow-actions";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  locations?: LocationOption[];
  consolidationBatches?: ConsolidationBatchOption[];
  pending: boolean;
  run: (fn: () => Promise<unknown>) => void;
}

interface LocationOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface ConsolidationBatchOption {
  id: string;
  label: string;
  fromLocationId: string | null;
  toLocationId: string | null;
}

const LOCATION_TYPE_LABELS: Record<string, string> = {
  WAREHOUSE: "仓库",
  FORWARDER: "转运仓 / 地区",
  TRANSIT: "中转位置",
  PERSON: "人员 / 代收",
};

function findDefaultLocationId(locations: LocationOption[] = [], locationText?: string | null) {
  const text = locationText?.trim();
  if (!text) return locations.length === 1 ? locations[0]?.id ?? "" : "";
  return locations.find((location) => location.id === text || location.name === text || location.code === text)?.id ?? "";
}

function LocationSelect({
  id,
  value,
  locations = [],
  onChange,
  placeholder = "请选择位置",
}: {
  id: string;
  value: string;
  locations?: LocationOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const groups = locations.reduce<Record<string, LocationOption[]>>((acc, location) => {
    const key = location.type || "OTHER";
    acc[key] = [...(acc[key] ?? []), location];
    return acc;
  }, {});

  return (
    <Select id={id} value={value} onChange={(event) => onChange(event.target.value)} required>
      <option value="">{placeholder}</option>
      {Object.entries(groups).map(([type, options]) => (
        <optgroup key={type} label={LOCATION_TYPE_LABELS[type] ?? type}>
          {options.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name} · {location.code}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
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
    carrier: detail.actionContext.carrier ?? "",
    etaDate: detail.actionContext.etaDate?.slice(0, 10) ?? "",
    destinationLocationId: findDefaultLocationId(
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>物流方式 / 承运商</Label>
          <Input value={form.carrier} onChange={(event) => setForm((value) => ({ ...value, carrier: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>预计到货日</Label>
          <Input type="date" value={form.etaDate} onChange={(event) => setForm((value) => ({ ...value, etaDate: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>预计到货位置</Label>
          <LocationSelect
            id="destinationLocationId"
            value={form.destinationLocationId}
            locations={locations}
            onChange={(destinationLocationId) => setForm((value) => ({ ...value, destinationLocationId }))}
            placeholder="请选择到货地区或仓库"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>采购物流单号</Label>
        <Input
          value={form.purchaseTrackingNo}
          onChange={(event) => setForm((value) => ({ ...value, purchaseTrackingNo: event.target.value }))}
          placeholder="购买地发出的物流单号"
        />
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
    arrivalLocationId: findDefaultLocationId(
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
          <LocationSelect
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
  const defaultLocationId = findDefaultLocationId(
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
          <LocationSelect
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
    locationId: findDefaultLocationId(
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
        <LocationSelect
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
  const defaultLocationId = findDefaultLocationId(
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
            <LocationSelect
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
                <LocationSelect
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
                <LocationSelect
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
            <LocationSelect
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
            暂无平台，请先在「设置 → 平台与上架」中添加销售平台。
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
        创建 Listing{selectedIds.length > 1 ? `（${selectedIds.length} 个平台）` : ""}
      </SubmitButton>
    </form>
  );
}

export function ShipOrderForm({ detail, pending, run }: ActionFormProps) {
  const [form, setForm] = useState({
    shipper: "",
    shippingMethod: "",
    trackingNo: detail.actionContext.trackingNo ?? "",
    proofNote: "",
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submitShipOrder(detail.entityId, form));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>发货人</Label>
          <Input value={form.shipper} onChange={(event) => setForm((value) => ({ ...value, shipper: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>发货方式</Label>
          <Input value={form.shippingMethod} onChange={(event) => setForm((value) => ({ ...value, shippingMethod: event.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>运单号</Label>
        <Input value={form.trackingNo} onChange={(event) => setForm((value) => ({ ...value, trackingNo: event.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>发货凭证备注</Label>
        <Textarea value={form.proofNote} onChange={(event) => setForm((value) => ({ ...value, proofNote: event.target.value }))} />
      </div>
      <SubmitButton pending={pending}>确认已发货</SubmitButton>
    </form>
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
