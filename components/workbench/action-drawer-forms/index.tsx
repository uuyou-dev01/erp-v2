"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  Loader2,
  ShieldCheck,
  UserRound,
  Warehouse,
} from "lucide-react";
import type { WorkItemDetail } from "@/lib/application/workflow-queries";
import type { WorkItem } from "@/lib/application/next-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import { useCallback, useEffect, useState } from "react";
import {
  WorkbenchLocationSelect,
  findWorkbenchLocationId,
  type WorkbenchLocationOption,
} from "@/components/workbench/location-select";
import { updateQuickEntry } from "@/app/actions/quick-entries";
import { formatQuickEntryExceptionMessage, parseIncompleteReasons } from "@/lib/quick-entry-utils";
import { itemFunctionStatusOptions, usedItemGradeOptions } from "@/lib/inventory/item-condition";
import { getShippingTaskTiming } from "@/lib/application/shipping-task-timing";

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
  taskItem?: WorkItem | null;
  locations?: WorkbenchLocationOption[];
  consolidationBatches?: ConsolidationBatchOption[];
  pending: boolean;
  run: (
    fn: () => Promise<unknown>,
    options?: { keepOpen?: boolean; successMessage?: string }
  ) => void;
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
    purchaseTrackingNo:
      detail.actionContext.purchaseTrackingNo ?? detail.actionContext.trackingNo ?? "",
    shippedWithoutTracking: false,
    shippingCost: "",
    shippingCurrency:
      detail.actionContext.currency ?? detail.actionContext.purchaseCurrency ?? "CNY",
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
        <Label htmlFor="purchase-tracking-no">采购物流单号</Label>
        <Input
          id="purchase-tracking-no"
          value={form.purchaseTrackingNo}
          onChange={(event) =>
            setForm((value) => ({ ...value, purchaseTrackingNo: event.target.value }))
          }
          placeholder="购买地发出的物流单号"
          required={!form.shippedWithoutTracking}
        />
      </div>
      <Checkbox
        id="shipped-without-tracking"
        checked={form.shippedWithoutTracking}
        onChange={(event) =>
          setForm((value) => ({ ...value, shippedWithoutTracking: event.target.checked }))
        }
        label="暂无单号，确认已发货"
      />
      <p className="text-xs text-muted-foreground">
        无单号也会进入「待确认收货」，并标注「运单待补」。
      </p>
      <div className="space-y-2">
        <Label htmlFor="destination-location-id">预计到货位置 *</Label>
        <WorkbenchLocationSelect
          id="destination-location-id"
          value={form.destinationLocationId}
          locations={locations}
          onChange={(destinationLocationId) =>
            setForm((value) => ({ ...value, destinationLocationId }))
          }
          placeholder="请选择到货仓库或集运仓"
          required
        />
        <p className="text-xs text-muted-foreground">选择这批采购预计送达的仓库/集运仓（含地区）</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div className="space-y-2">
          <Label htmlFor="purchase-shipping-cost">本段邮费（可选）</Label>
          <Input
            id="purchase-shipping-cost"
            inputMode="decimal"
            value={form.shippingCost}
            onChange={(event) =>
              setForm((value) => ({ ...value, shippingCost: event.target.value }))
            }
            placeholder="实际支付金额"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="purchase-shipping-currency">币种</Label>
          <Input
            id="purchase-shipping-currency"
            value={form.shippingCurrency}
            maxLength={3}
            onChange={(event) =>
              setForm((value) => ({
                ...value,
                shippingCurrency: event.target.value.toUpperCase(),
              }))
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        邮费会记入采购物流成本，并进入费用明细和当月利润报表。
      </p>
      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea
          value={form.note}
          onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
        />
      </div>
      <SubmitButton pending={pending}>保存并进入待确认收货</SubmitButton>
    </form>
  );
}

export function ConfirmArrivalForm({ detail, locations, pending, run }: ActionFormProps) {
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
          <Input
            type="date"
            value={form.arrivedAt}
            onChange={(event) => setForm((value) => ({ ...value, arrivedAt: event.target.value }))}
          />
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
        <Checkbox
          checked={form.isComplete}
          onChange={(event) => setForm((value) => ({ ...value, isComplete: event.target.checked }))}
          label="完整到货"
        />
      </div>
      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea
          value={form.note}
          onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
        />
      </div>
      <SubmitButton pending={pending}>
        {detail.primaryAction === "receivePurchase" ? "确认收货并进入待分流" : "确认到货并处理库存"}
      </SubmitButton>
    </form>
  );
}

export function ShipmentArrivalProcessingForm({
  detail,
  locations,
  pending,
  run,
}: ActionFormProps) {
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
    conditionGrade: hasUsedLine ? "UNASSESSED" : "",
    functionStatus: hasUsedLine ? "UNTESTED" : "NORMAL",
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
          onChange={(event) =>
            setForm((value) => ({ ...value, result: event.target.checked ? "PASSED" : "FAILED" }))
          }
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
              onChange={(event) => {
                const conditionType = event.target.value;
                setForm((value) => ({
                  ...value,
                  conditionType,
                  conditionGrade: conditionType === "USED" ? "UNASSESSED" : "",
                  functionStatus: conditionType === "USED" ? "UNTESTED" : "NORMAL",
                }));
              }}
            >
              <option value="NEW">新品</option>
              <option value="USED">中古 / 二手</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>编号</Label>
            <Input
              value={form.serialNo}
              onChange={(event) => setForm((value) => ({ ...value, serialNo: event.target.value }))}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox
            checked={form.isNewSealed}
            onChange={(event) =>
              setForm((value) => ({ ...value, isNewSealed: event.target.checked }))
            }
            label="全新未拆 / 外箱正常"
          />
          <Checkbox
            checked={form.packageComplete}
            onChange={(event) =>
              setForm((value) => ({ ...value, packageComplete: event.target.checked }))
            }
            label="包装和配件完整"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>缺件 / 少件说明</Label>
            <Input
              value={form.missingParts}
              onChange={(event) =>
                setForm((value) => ({ ...value, missingParts: event.target.value }))
              }
            />
          </div>
          {form.conditionType === "USED" ? (
            <>
              <div className="space-y-2">
                <Label>中古品级</Label>
                <Select
                  value={form.conditionGrade}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, conditionGrade: event.target.value }))
                  }
                >
                  {usedItemGradeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} · {option.description}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>功能状态</Label>
                <Select
                  value={form.functionStatus}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, functionStatus: event.target.value }))
                  }
                >
                  {itemFunctionStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>划痕 / 黄化 / 盒况 / 异常描述</Label>
          <Textarea
            value={form.scratchNote}
            onChange={(event) =>
              setForm((value) => ({ ...value, scratchNote: event.target.value }))
            }
          />
        </div>
      </div>

      {form.result === "FAILED" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>异常 / 退货原因</Label>
            <Input
              value={form.returnReason}
              onChange={(event) =>
                setForm((value) => ({ ...value, returnReason: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>退货单号</Label>
            <Input
              value={form.trackingNo}
              onChange={(event) =>
                setForm((value) => ({ ...value, trackingNo: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>承运商</Label>
            <Input
              value={form.carrier}
              onChange={(event) => setForm((value) => ({ ...value, carrier: event.target.value }))}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>备注</Label>
        <Textarea
          value={form.note}
          onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
        />
      </div>
      <SubmitButton
        pending={pending}
        variant={form.result === "FAILED" ? "destructive" : "default"}
      >
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
        <Textarea
          value={form.note}
          onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))}
        />
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
  const defaultLocationId =
    detail.actionContext.destinationLocationId ||
    findWorkbenchLocationId(
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
    shippingCost: "",
    shippingCurrency: detail.actionContext.currency ?? "CNY",
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
      return run(() =>
        submitConsolidatePurchase(detail.entityType, detail.entityId, consolidationForm)
      );
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
          ["consolidate", "加入待集运"],
          ["transfer", "立即发起转仓"],
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
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">在已确认的收货位置入库</p>
            <p className="mt-1">{detail.actionContext.currentLocationText || "尚未登记收货位置"}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              入库不会改变商品所在仓库。要发往其他位置，请选择「立即发起转仓」。
            </p>
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={inboundForm.note}
              onChange={(event) =>
                setInboundForm((value) => ({ ...value, note: event.target.value }))
              }
            />
          </div>
          <SubmitButton pending={pending} disabled={!inboundForm.locationId}>
            确认入库
          </SubmitButton>
        </div>
      )}

      {mode === "consolidate" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            只加入待集运批次，不会立即发货；准备好后再在集运物流中统一发车。
          </p>
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
          <SubmitButton pending={pending}>加入待集运</SubmitButton>
        </div>
      )}

      {mode === "transfer" && (
        <div className="space-y-3">
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div>
              <p className="text-sm font-medium">部分发出或与其他采购混装</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                进入转运装箱页后，可从当前位置选择实际发出数量，并加入其他采购来源的库存。
              </p>
            </div>
            <Button asChild type="button" className="w-full">
              <Link
                href={`/logistics/transfers/new?fromLocationId=${encodeURIComponent(defaultLocationId)}&purchaseOrderId=${encodeURIComponent(detail.entityId)}`}
              >
                选择商品并创建转运包裹
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3 py-1" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">整张采购单快速发出</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            下方快捷操作会锁定该采购单当前可用的全部库存；目标位置仍需另行确认到货。
          </p>
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
                onChange={(event) =>
                  setTransferForm((value) => ({ ...value, trackingNo: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>承运商</Label>
              <Input
                value={transferForm.carrier}
                onChange={(event) =>
                  setTransferForm((value) => ({ ...value, carrier: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>预计到货日</Label>
              <Input
                type="date"
                value={transferForm.etaDate}
                onChange={(event) =>
                  setTransferForm((value) => ({ ...value, etaDate: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_92px]">
              <div className="space-y-2">
                <Label>转仓邮费</Label>
                <Input
                  inputMode="decimal"
                  value={transferForm.shippingCost}
                  onChange={(event) =>
                    setTransferForm((value) => ({ ...value, shippingCost: event.target.value }))
                  }
                  placeholder="可选"
                />
              </div>
              <div className="space-y-2">
                <Label>币种</Label>
                <Input
                  value={transferForm.shippingCurrency}
                  maxLength={3}
                  onChange={(event) =>
                    setTransferForm((value) => ({
                      ...value,
                      shippingCurrency: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            转仓邮费会跟随本次物流单进入物流成本台账和当月报表。
          </p>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={transferForm.note}
              onChange={(event) =>
                setTransferForm((value) => ({ ...value, note: event.target.value }))
              }
            />
          </div>
          <SubmitButton pending={pending}>整单确认发出并进入在途</SubmitButton>
        </div>
      )}

      {mode === "return" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>退货原因</Label>
            <Input
              value={returnForm.reason}
              onChange={(event) =>
                setReturnForm((value) => ({ ...value, reason: event.target.value }))
              }
              placeholder="卖家协商退货、商品不符、取消转卖..."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>退货物流单号</Label>
              <Input
                value={returnForm.trackingNo}
                onChange={(event) =>
                  setReturnForm((value) => ({ ...value, trackingNo: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>承运商</Label>
              <Input
                value={returnForm.carrier}
                onChange={(event) =>
                  setReturnForm((value) => ({ ...value, carrier: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              value={returnForm.note}
              onChange={(event) =>
                setReturnForm((value) => ({ ...value, note: event.target.value }))
              }
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
  const availablePlatformIds = detail.actionContext.availablePlatformIds
    ?.split(",")
    .filter(Boolean);
  const selectablePlatforms = availablePlatformIds?.length
    ? platforms.filter((platform) => availablePlatformIds.includes(platform.id))
    : platforms;

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
        {detail.actionContext.activeListingPlatformsText ? (
          <p className="text-xs text-muted-foreground">
            已上架：{detail.actionContext.activeListingPlatformsText}。下方仅显示仍待补充的平台。
          </p>
        ) : null}
        {selectablePlatforms.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            暂无平台，请先在「库存设置 → 销售平台配置」中添加销售平台。
          </p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
            {selectablePlatforms.map((platform) => (
              <label
                key={platform.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedIds.includes(platform.id)}
                  onChange={(event) => togglePlatform(platform.id, event.target.checked)}
                />
                <span className="min-w-0 flex-1 text-sm font-medium leading-tight">
                  {platform.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <SubmitButton
        pending={pending}
        disabled={selectedIds.length === 0 || selectablePlatforms.length === 0}
      >
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

const SHIPPING_METHOD_OPTIONS = ["平台上门取件", "快递寄送", "自送驿站", "仓库交承运商"] as const;

function quantityLabel(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, "");
}

function ShipmentFulfillmentSummary({
  detail,
  assigneeName,
}: {
  detail: WorkItemDetail;
  assigneeName: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const returnTo = `${pathname}${currentQuery ? `?${currentQuery}` : ""}`;
  const context = detail.fulfillmentContext;
  if (!context?.allocations.length || !context.isComplete) {
    return (
      <div
        role="alert"
        className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">尚未读取到完整的出库库存</p>
          <p className="mt-1 text-xs leading-5">
            请先到订单详情完成库存分配；在仓库和库存来源明确前不能确认发货。
          </p>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="shipment-source-title" className="overflow-hidden rounded-lg border">
      <div className="flex items-start justify-between gap-3 border-b bg-amber-50/60 px-3 py-3">
        <div>
          <h3 id="shipment-source-title" className="text-sm font-semibold text-foreground">
            先核对本次要发的货
          </h3>
          <p className="mt-0.5 text-xs text-amber-900/80">
            按商品图、SKU 和数量逐项取货，确认无误后再发出。
          </p>
        </div>
        <span className="shrink-0 text-base font-semibold tabular-nums">
          共 {quantityLabel(context.totalQuantity)} 件
        </span>
      </div>

      <div className="divide-y">
        {context.allocations.map((allocation) => (
          <div key={allocation.id} className="flex items-center gap-3 px-3 py-3 text-xs">
            {allocation.imageUrl ? (
              <a
                href={allocation.imageUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`查看 ${allocation.skuName} 商品原图`}
                className="shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={allocation.imageUrl}
                  alt={`${allocation.skuName} 商品图`}
                  className="h-20 w-20 rounded-md border bg-background object-cover"
                />
              </a>
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">
                暂无图片
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{allocation.skuName}</p>
              <p className="mt-1 text-muted-foreground">SKU {allocation.skuCode}</p>
              <p className="mt-1 text-muted-foreground">
                {allocation.inventoryReference} · {allocation.locationName}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold tabular-nums">
                × {quantityLabel(allocation.quantity)}
              </p>
              {allocation.remainingAfterShipment !== null ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  发出后余 {quantityLabel(allocation.remainingAfterShipment)}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t bg-muted/25 px-3 py-3 text-xs">
        {context.locations.map((location) => (
          <div key={location.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Warehouse className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                从 {location.name}（{location.code}）出库
              </span>
            </div>
            <Link
              href={`/inventory/locations/${location.id}?returnTo=${encodeURIComponent(returnTo)}`}
              className="inline-flex shrink-0 items-center gap-1 font-medium text-blue-700 hover:text-blue-900"
            >
              查看仓库
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserRound className="h-4 w-4" />
            <span>执行人</span>
          </div>
          <span className="font-medium">{assigneeName}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <span>提交校验</span>
          </div>
          <span className="font-medium text-emerald-700">按全部出库仓复核库存</span>
        </div>
      </div>
    </section>
  );
}

export function ShipOrderForm({
  detail,
  taskItem,
  assignmentPanel,
  pending,
  run,
}: ActionFormProps & { assignmentPanel?: ReactNode }) {
  const initialProof = proofFromDetail(detail);
  const initialShippingMethod = initialProof.shippingMethod ?? "";
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draftHint, setDraftHint] = useState(initialProof.updatedAt ? "已加载暂存内容" : "");
  const [shippingMethodChoice, setShippingMethodChoice] = useState(
    SHIPPING_METHOD_OPTIONS.includes(
      initialShippingMethod as (typeof SHIPPING_METHOD_OPTIONS)[number]
    )
      ? initialShippingMethod
      : initialShippingMethod
        ? "OTHER"
        : ""
  );
  const [shipmentChecked, setShipmentChecked] = useState(false);
  const [form, setForm] = useState({
    shipper: initialProof.shipper ?? "",
    shippingMethod: initialShippingMethod,
    trackingNo: detail.actionContext.trackingNo ?? "",
    pickupCode: initialProof.pickupCode ?? "",
    proofNote: initialProof.proofNote ?? "",
    imageUrls: initialProof.imageUrls ?? [],
  });

  const persistDraft = useCallback(
    (next: typeof form, options?: { successMessage?: string; silent?: boolean }) => {
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
            : (options?.successMessage ?? "已暂存。代发方可查看凭证，发出后再点「确认已发货」。"),
        }
      );
    },
    [detail.entityId, run]
  );

  const uploadProofFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      if (files.some((file) => !validTypes.includes(file.type))) {
        setUploadError("不支持的文件类型。仅支持 JPEG、PNG、GIF 和 WebP。");
        return;
      }

      if (files.some((file) => file.size > 5 * 1024 * 1024)) {
        setUploadError("文件过大，每张图片最大 5MB。");
        return;
      }

      setUploading(true);
      setUploadError(null);
      try {
        const urls = await Promise.all(
          files.map(async (file) => {
            const uploadFormData = new FormData();
            uploadFormData.append("file", file);
            uploadFormData.append("purpose", "BUSINESS_EVIDENCE");
            const response = await fetch("/api/upload", {
              method: "POST",
              body: uploadFormData,
            });
            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "上传失败");
            }
            const result = (await response.json()) as { url: string };
            return result.url;
          })
        );
        const next = { ...form, imageUrls: [...form.imageUrls, ...urls] };
        setForm(next);
        setDraftHint("凭证图片已上传并暂存，代发方现在可以查看");
        persistDraft(next, { successMessage: "发货凭证已上传并暂存，代发方现在可以查看。" });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "图片上传失败");
      } finally {
        setUploading(false);
      }
    },
    [form, persistDraft]
  );

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    await uploadProofFiles(files);
    event.target.value = "";
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (uploading) return;
      const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (!imageFiles.length) return;
      event.preventDefault();
      void uploadProofFiles(imageFiles);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [uploadProofFiles, uploading]);

  const payload = () => ({
    shipper: form.shipper,
    shippingMethod: form.shippingMethod,
    trackingNo: form.trackingNo,
    pickupCode: form.pickupCode,
    proofNote: form.proofNote,
    imageUrls: form.imageUrls,
  });

  const removeImage = (url: string) => {
    const next = {
      ...form,
      imageUrls: form.imageUrls.filter((item) => item !== url),
    };
    setForm(next);
    persistDraft(next, { silent: true });
  };

  const fulfillmentContext = detail.fulfillmentContext;
  const hasCompleteFulfillmentSource = Boolean(
    fulfillmentContext?.allocations.length && fulfillmentContext.isComplete
  );
  const assigneeName =
    taskItem?.taskAssignedToName ??
    detail.taskAssignedToName ??
    "未指派（提交人将记录为实际执行人）";
  const taskTiming = getShippingTaskTiming({
    createdAt: taskItem?.taskCreatedAt ?? detail.taskCreatedAt ?? detail.waitingSince,
    dueAt: taskItem?.taskDueAt ?? detail.taskDueAt,
    status: taskItem?.taskStatus ?? detail.taskStatus ?? detail.currentStatus,
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submitShipOrder(detail.entityId, payload()));
      }}
    >
      <section
        aria-label="发货时限"
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border px-3 py-3",
          taskTiming.tone === "overdue" && "border-destructive/30 bg-destructive/5",
          taskTiming.tone === "warning" && "border-amber-200 bg-amber-50/60"
        )}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <Clock3
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground",
              taskTiming.tone === "overdue" && "text-destructive",
              taskTiming.tone === "warning" && "text-amber-700"
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{taskTiming.scheduleLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{taskTiming.createdLabel}</p>
          </div>
        </div>
        <p
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            taskTiming.tone === "overdue" && "text-destructive",
            taskTiming.tone === "warning" && "text-amber-700"
          )}
        >
          {taskTiming.urgencyLabel}
        </p>
      </section>

      {draftHint ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-800">
          {draftHint}
        </p>
      ) : null}

      <ShipmentFulfillmentSummary detail={detail} assigneeName={assigneeName} />

      {assignmentPanel}

      <p className="text-xs text-muted-foreground">
        物流与凭证信息均为选填；最后只需完成一次发货核对。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="shipping-handoff-contact">现场交接联系人（选填）</Label>
          <Input
            id="shipping-handoff-contact"
            value={form.shipper}
            onChange={(event) => setForm((value) => ({ ...value, shipper: event.target.value }))}
            placeholder="如快递员、仓库现场联系人"
          />
          <p className="text-xs text-muted-foreground">任务执行人以上方指派记录为准。</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="shipping-method">发货方式（选填）</Label>
          <Select
            id="shipping-method"
            value={shippingMethodChoice}
            onChange={(event) => {
              const value = event.target.value;
              setShippingMethodChoice(value);
              setForm((current) => ({
                ...current,
                shippingMethod: value === "OTHER" ? "" : value,
              }));
            }}
          >
            <option value="">请选择发货方式</option>
            {SHIPPING_METHOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="OTHER">其他方式</option>
          </Select>
          {shippingMethodChoice === "OTHER" ? (
            <Input
              aria-label="其他发货方式"
              value={form.shippingMethod}
              onChange={(event) =>
                setForm((value) => ({ ...value, shippingMethod: event.target.value }))
              }
              placeholder="填写具体发货方式"
            />
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="shipping-tracking-no">运单号（选填）</Label>
        <Input
          id="shipping-tracking-no"
          value={form.trackingNo}
          onChange={(event) => setForm((value) => ({ ...value, trackingNo: event.target.value }))}
          placeholder="选填，代发完成后可补"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="shipping-pickup-code">取件码 / 交接码（选填）</Label>
        <Input
          id="shipping-pickup-code"
          value={form.pickupCode}
          onChange={(event) => setForm((value) => ({ ...value, pickupCode: event.target.value }))}
          placeholder="平台取件码、代收码、验证码等"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="shipping-proof-images">发货凭证图片（选填）</Label>
        <p className="text-xs text-muted-foreground">
          可上传平台二维码、便利店付款码或取件截图。上传后会立即暂存，代发方可查看原图。
        </p>
        {form.imageUrls.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {form.imageUrls.map((url) => (
              <div key={url} className="relative">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="查看发货凭证原图"
                  className="block rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="发货凭证"
                    className="h-20 w-20 rounded-md border object-cover"
                  />
                </a>
                <button
                  type="button"
                  className="absolute -right-1 -top-1 z-10 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground shadow"
                  aria-label="删除发货凭证"
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
        <div className="rounded-lg border border-dashed bg-muted/20 p-3">
          <Input
            id="shipping-proof-images"
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            disabled={pending || uploading}
            onChange={handleImageUpload}
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            也可以直接按 ⌘V / Ctrl+V 粘贴剪贴板中的图片
          </p>
        </div>
        {uploading ? <p className="text-xs text-muted-foreground">图片上传中...</p> : null}
        {uploadError ? (
          <p role="alert" className="text-xs text-destructive">
            {uploadError}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="shipping-proof-note">发货凭证备注（选填）</Label>
        <Textarea
          id="shipping-proof-note"
          value={form.proofNote}
          onChange={(event) => setForm((value) => ({ ...value, proofNote: event.target.value }))}
          placeholder="补充说明，如取件时间、联系人等"
        />
      </div>
      <div className="rounded-lg border bg-muted/25 p-3">
        <p className="mb-2 text-sm font-medium">发货确认（必选）</p>
        <Checkbox
          checked={shipmentChecked}
          onChange={(event) => setShipmentChecked(event.target.checked)}
          label="我已按商品图、SKU、数量和出库仓核对，确认货物已经发出"
        />
      </div>
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
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
          <SubmitButton
            pending={pending || uploading}
            disabled={!hasCompleteFulfillmentSource || !shipmentChecked}
          >
            确认已发货
          </SubmitButton>
        </div>
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
  const [confirmDeliveryOpen, setConfirmDeliveryOpen] = useState(false);
  const shippedAt = detail.actionContext.shippedAt
    ? new Date(detail.actionContext.shippedAt).toLocaleString("zh-CN")
    : null;

  const handleConfirmDelivery = () => {
    setConfirmDeliveryOpen(false);
    run(() => submitConfirmDelivery(detail.entityId));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
        {shippedAt ? <p>发货时间：{shippedAt}</p> : null}
        <p>运单号：{detail.actionContext.trackingNo?.trim() || "未填写"}</p>
        {proof.shipper ? <p>现场交接联系人：{proof.shipper}</p> : null}
        {proof.shippingMethod ? <p>发货方式：{proof.shippingMethod}</p> : null}
        {proof.pickupCode ? <p>取件码：{proof.pickupCode}</p> : null}
        {proof.proofNote ? (
          <p className="whitespace-pre-wrap text-muted-foreground">备注：{proof.proofNote}</p>
        ) : null}
        {proof.imageUrls && proof.imageUrls.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {proof.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
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

      <Button type="button" disabled={pending} onClick={() => setConfirmDeliveryOpen(true)}>
        确认妥投，进入待结算
      </Button>

      <OrderReturnSection detail={detail} pending={pending} run={run} />
      <ConfirmDialog
        open={confirmDeliveryOpen}
        title="确认妥投"
        description="确认买家已收到货物？确认后将进入待结算，用于录入实际手续费和利润。如发生退货，请先登记退货。"
        confirmText="确认妥投"
        cancelText="返回"
        loading={pending}
        onConfirm={handleConfirmDelivery}
        onCancel={() => setConfirmDeliveryOpen(false)}
      />
    </div>
  );
}

function OrderReturnSection({ detail, pending, run }: ActionFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
      setError("请填写退货说明");
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const confirmRegisterReturn = () => {
    setConfirmOpen(false);
    setError(null);
    run(() => submitRegisterReturn(detail.entityId, returnForm));
  };

  const returnConfirmDescription = () => {
    const restockHint =
      returnForm.restockMode === "AVAILABLE"
        ? "单品将直接回到可售库存。"
        : "单品将进入「退货检查」，需检验后再上架。";
    return `确认登记退货？${restockHint}批次库存将按原分配数量回滚到对应批次。`;
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
          onChange={(event) => {
            setError(null);
            setReturnForm((value) => ({ ...value, note: event.target.value }));
          }}
          placeholder="如：买家拒收、平台退款、发错货等"
          disabled={pending}
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
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
      <ConfirmDialog
        open={confirmOpen}
        title="确认登记退货"
        description={returnConfirmDescription()}
        confirmText="登记退货"
        cancelText="返回"
        tone="danger"
        loading={pending}
        onConfirm={confirmRegisterReturn}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export function CancelOrderSection({ detail, pending, run }: ActionFormProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (detail.primaryAction !== "shipOrder" && detail.primaryAction !== "confirmOrder") {
    return null;
  }

  const handleCancel = () => {
    if (!reason.trim()) {
      setError("请填写取消原因");
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const confirmCancel = () => {
    setConfirmOpen(false);
    setError(null);
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
          onChange={(event) => {
            setError(null);
            setReason(event.target.value);
          }}
          placeholder="如：买家取消、重复下单、信息有误"
          disabled={pending}
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={handleCancel}>
        取消订单并释放预留
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="确认取消订单"
        description="将释放已预留库存，不会扣减实物库存。取消后不可恢复为待发货。"
        confirmText="取消订单"
        cancelText="返回"
        tone="danger"
        loading={pending}
        onConfirm={confirmCancel}
        onCancel={() => setConfirmOpen(false)}
      />
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
  const currency = detail.actionContext.currency ?? "CNY";
  const baseCurrency = detail.actionContext.settlementBaseCurrency ?? "CNY";
  const originalSalePrice = detail.actionContext.totalPaid ?? detail.actionContext.subtotal ?? "0";
  const [form, setForm] = useState({
    actualSalePrice: "",
    platformFee: detail.actionContext.platformFee ?? "",
    shippingFee: detail.actionContext.shippingFee ?? "",
    fxRate:
      detail.actionContext.settlementFxRate ??
      detail.actionContext.suggestedSettlementFxRate ??
      (currency === baseCurrency ? "1" : ""),
  });
  const salePrice = Number(form.actualSalePrice || originalSalePrice || 0);
  const platformFee = Number(form.platformFee || 0);
  const shippingFee = Number(form.shippingFee || 0);
  const fxRate = Number(form.fxRate || 0);
  const netRevenue = salePrice - platformFee - shippingFee;
  const formatAmount = (amount: number, amountCurrency = currency) =>
    `${amountCurrency} ${Number.isFinite(amount) ? amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : "—"}`;
  const requiresFxRate = currency !== baseCurrency;
  const shippingFeeRequired = detail.actionContext.shippingFeeStatus === "PENDING";

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submitSettleOrder(detail.entityId, form));
      }}
    >
      <section className="overflow-hidden rounded-lg border" aria-labelledby="settlement-summary">
        <div className="border-b bg-muted/30 px-3 py-2.5">
          <h3 id="settlement-summary" className="text-sm font-semibold">
            待结算汇总
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            成交金额已从销售订单带入，本次主要核对费用与汇率。
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">已记录成交金额</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{formatAmount(salePrice)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">预计净入账</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{formatAmount(netRevenue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">平台手续费</dt>
            <dd className="mt-0.5 tabular-nums">{formatAmount(platformFee)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">实际邮费</dt>
            <dd className="mt-0.5 tabular-nums">{formatAmount(shippingFee)}</dd>
          </div>
          {fxRate > 0 ? (
            <div className="col-span-2 border-t pt-2">
              <dt className="text-xs text-muted-foreground">
                汇率快照 · 1 {currency} = {form.fxRate} {baseCurrency}
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                折合净入账 {formatAmount(netRevenue * fxRate, baseCurrency)}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <details className="rounded-lg border bg-background px-3 py-2.5">
        <summary className="cursor-pointer text-sm font-medium">修正已记录的成交金额</summary>
        <div className="mt-3 space-y-2">
          <Label>实际成交金额（选填）</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={form.actualSalePrice}
            onChange={(event) =>
              setForm((value) => ({ ...value, actualSalePrice: event.target.value }))
            }
            placeholder={`当前 ${formatAmount(Number(originalSalePrice || 0))}`}
          />
          <p className="text-xs text-muted-foreground">只有实际到账与原订单不一致时才需要填写。</p>
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>实际手续费（选填）</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.platformFee}
            onChange={(event) =>
              setForm((value) => ({ ...value, platformFee: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>实际邮费{shippingFeeRequired ? "（必填）" : "（选填）"}</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            required={shippingFeeRequired}
            value={form.shippingFee}
            onChange={(event) =>
              setForm((value) => ({ ...value, shippingFee: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>
            结算汇率（{currency} → {baseCurrency}
            {requiresFxRate ? "，必填" : "，无需填写"}）
          </Label>
          <Input
            type="number"
            min="0.00000001"
            step="0.00000001"
            required={requiresFxRate}
            disabled={!requiresFxRate}
            value={form.fxRate}
            onChange={(event) => setForm((value) => ({ ...value, fxRate: event.target.value }))}
            placeholder={`1 ${currency} 对应的 ${baseCurrency} 金额`}
          />
          <p className="text-xs text-muted-foreground">
            结算时会保存这次汇率快照，后续汇率变化不会改写本单。
          </p>
        </div>
      </div>
      <SubmitButton pending={pending} disabled={requiresFxRate && !form.fxRate.trim()}>
        完成结算
      </SubmitButton>

      <OrderReturnSection detail={detail} pending={pending} run={run} />
    </form>
  );
}

export function ConfirmOrderButton({ detail, pending, run }: ActionFormProps) {
  return (
    <Button
      disabled={pending}
      className="w-full"
      onClick={() => run(() => submitConfirmOrder(detail.entityId))}
    >
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      确认订单并进入待发货
    </Button>
  );
}

export function ResolveQuickEntryExceptionForm({
  detail,
  locations = [],
  pending,
  run,
}: ActionFormProps) {
  const storedReasonCodes = detail.metadata?.incompleteReasonCodes;
  const reasonSource =
    detail.actionContext.errorMessage ??
    (typeof storedReasonCodes === "string" ? storedReasonCodes : null) ??
    detail.exceptionMessage;
  const reasons = parseIncompleteReasons(reasonSource);
  const needsPurchasePrice = reasons.includes("missing_purchase_price");
  const needsLocation = reasons.includes("missing_location");
  const needsSalePrice = reasons.includes("missing_sale_price");
  const needsSkuConfirmation = reasons.includes("unconfirmed_sku");
  const [form, setForm] = useState({
    purchasePrice: detail.actionContext.purchasePrice ?? "",
    purchaseCurrency: detail.actionContext.purchaseCurrency ?? "CNY",
    salePrice: detail.actionContext.salePrice ?? "",
    saleCurrency: detail.actionContext.saleCurrency ?? "CNY",
    locationId: findWorkbenchLocationId(locations, detail.actionContext.currentLocationText),
    skuConfirmed: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const hasGuidedFields =
    needsPurchasePrice || needsLocation || needsSalePrice || needsSkuConfirmation;

  const positiveAmount = (value: string) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0;
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setFormError(null);

        if (needsPurchasePrice && !positiveAmount(form.purchasePrice)) {
          setFormError("请输入大于 0 的购入单价。");
          return;
        }
        if (needsLocation && !form.locationId) {
          setFormError("请选择商品当前所在的仓库位置。");
          return;
        }
        if (needsSalePrice && !positiveAmount(form.salePrice)) {
          setFormError("请输入大于 0 的售出单价。");
          return;
        }
        if (needsSkuConfirmation && !form.skuConfirmed) {
          setFormError("请先确认商品名称与规格信息正确。");
          return;
        }

        const location = locations.find((item) => item.id === form.locationId);
        run(async () => {
          const result = hasGuidedFields
            ? await updateQuickEntry(detail.entityId, {
                ...(needsPurchasePrice
                  ? {
                      purchasePrice: form.purchasePrice,
                      purchaseCurrency: form.purchaseCurrency,
                    }
                  : {}),
                ...(needsLocation
                  ? {
                      currentLocationText: location?.name ?? location?.code ?? form.locationId,
                    }
                  : {}),
                ...(needsSalePrice
                  ? {
                      salePrice: form.salePrice,
                      saleCurrency: form.saleCurrency,
                    }
                  : {}),
              })
            : await submitResolveException(detail.entityType, detail.entityId);

          if (
            result &&
            typeof result === "object" &&
            "success" in result &&
            result.success === true &&
            "status" in result &&
            result.status === "PARTIAL"
          ) {
            return {
              success: false as const,
              error: "仍有信息没有补齐，请检查表单后再处理。",
            };
          }
          return result;
        });
      }}
    >
      {hasGuidedFields ? (
        <div className="space-y-3">
          {needsPurchasePrice ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_132px]">
              <div className="space-y-2">
                <Label htmlFor="exception-purchase-price">购入单价 *</Label>
                <Input
                  id="exception-purchase-price"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.purchasePrice}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      purchasePrice: event.target.value,
                    }))
                  }
                  placeholder="例如：980"
                  aria-describedby="exception-purchase-price-help"
                />
                <p id="exception-purchase-price-help" className="text-xs text-muted-foreground">
                  用于生成采购明细和库存成本。
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exception-purchase-currency">币种</Label>
                <Select
                  id="exception-purchase-currency"
                  value={form.purchaseCurrency}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      purchaseCurrency: event.target.value,
                    }))
                  }
                >
                  <option value="CNY">CNY 人民币</option>
                  <option value="JPY">JPY 日元</option>
                  <option value="USD">USD 美元</option>
                  <option value="HKD">HKD 港币</option>
                </Select>
              </div>
            </div>
          ) : null}

          {needsLocation ? (
            <div className="space-y-2">
              <Label htmlFor="exception-location">预计到货位置 *</Label>
              <WorkbenchLocationSelect
                id="exception-location"
                value={form.locationId}
                locations={locations}
                onChange={(locationId) => setForm((value) => ({ ...value, locationId }))}
                placeholder="请选择这次采购预计送达的位置"
                required
              />
              {locations.length === 0 ? (
                <p className="text-xs text-destructive">
                  暂无可选位置，请先到“仓库位置”创建一个仓库。
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  这里只记录物流目的地；选择位置不会再被视为已经到货。
                </p>
              )}
            </div>
          ) : null}

          {needsSalePrice ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_132px]">
              <div className="space-y-2">
                <Label htmlFor="exception-sale-price">售出单价 *</Label>
                <Input
                  id="exception-sale-price"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.salePrice}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      salePrice: event.target.value,
                    }))
                  }
                  placeholder="例如：1280"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exception-sale-currency">币种</Label>
                <Select
                  id="exception-sale-currency"
                  value={form.saleCurrency}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      saleCurrency: event.target.value,
                    }))
                  }
                >
                  <option value="CNY">CNY 人民币</option>
                  <option value="JPY">JPY 日元</option>
                  <option value="USD">USD 美元</option>
                  <option value="HKD">HKD 港币</option>
                </Select>
              </div>
            </div>
          ) : null}

          {needsSkuConfirmation ? (
            <label className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
              <Checkbox
                checked={form.skuConfirmed}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    skuConfirmed: event.target.checked,
                  }))
                }
                aria-label="确认商品与规格信息"
              />
              <span className="text-sm">
                <span className="font-medium">商品与规格信息正确</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  确认当前名称与规格可以作为库存识别依据。
                </span>
              </span>
            </label>
          ) : null}
        </div>
      ) : (
        <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          {formatQuickEntryExceptionMessage(reasonSource)}
        </p>
      )}

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      {needsLocation && locations.length === 0 ? (
        <Button asChild variant="outline" className="w-full">
          <Link href="/inventory/locations">
            <ExternalLink className="mr-2 h-4 w-4" />
            前往创建仓库位置
          </Link>
        </Button>
      ) : (
        <SubmitButton pending={pending}>
          {hasGuidedFields ? "保存并继续处理" : "重新处理"}
        </SubmitButton>
      )}
    </form>
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
