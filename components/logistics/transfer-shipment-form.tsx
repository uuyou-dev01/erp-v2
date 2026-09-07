"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Box, CheckCircle2, PackageSearch, Plane, Search, Truck } from "lucide-react";
import {
  createTransferShipmentAction,
  type TransferInventoryCandidate,
  type TransferLocationOption,
} from "@/app/actions/transfer-shipments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatLocationRegion } from "@/lib/inventory/location-regions";

function locationLabel(location: TransferLocationOption | undefined) {
  if (!location) return "尚未选择";
  return [formatLocationRegion(location.region), location.name, location.code]
    .filter(Boolean)
    .join(" · ");
}

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function TransferShipmentForm({
  storeId,
  locations,
  candidates,
  initialFromLocationId,
  focusPurchaseOrderId,
  defaultCurrency,
}: {
  storeId: string;
  locations: TransferLocationOption[];
  candidates: TransferInventoryCandidate[];
  initialFromLocationId?: string;
  focusPurchaseOrderId?: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initialSource =
    locations.find((location) => location.id === initialFromLocationId)?.id ??
    locations.find((location) => candidates.some((item) => item.locationId === location.id))?.id ??
    "";
  const [fromLocationId, setFromLocationId] = useState(initialSource);
  const [toLocationId, setToLocationId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [transportMode, setTransportMode] = useState<
    "HAND_CARRY" | "CONSOLIDATOR" | "POSTAL" | "COURIER" | "FREIGHT" | "OTHER"
  >("COURIER");
  const [trackingNo, setTrackingNo] = useState("");
  const [carrier, setCarrier] = useState("");
  const [carriedBy, setCarriedBy] = useState("");
  const [etaDate, setEtaDate] = useState("");
  const [grossWeightKg, setGrossWeightKg] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [shippingCurrency, setShippingCurrency] = useState(defaultCurrency);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const source = locations.find((location) => location.id === fromLocationId);
  const destination = locations.find((location) => location.id === toLocationId);
  const sourceCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return candidates
      .filter((candidate) => candidate.locationId === fromLocationId)
      .filter((candidate) => {
        if (!normalizedQuery) return true;
        return [
          candidate.skuCode,
          candidate.skuName,
          candidate.unitCode,
          candidate.sourceReference,
        ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        const aFocused = a.purchaseOrderId === focusPurchaseOrderId ? 0 : 1;
        const bFocused = b.purchaseOrderId === focusPurchaseOrderId ? 0 : 1;
        return aFocused - bFocused || a.skuCode.localeCompare(b.skuCode);
      });
  }, [candidates, focusPurchaseOrderId, fromLocationId, query]);
  const selectedCandidates = candidates.filter(
    (candidate) => candidate.locationId === fromLocationId && numeric(selected[candidate.key]) > 0
  );
  const selectedQuantity = selectedCandidates.reduce(
    (sum, candidate) => sum + numeric(selected[candidate.key]),
    0
  );

  const toggleCandidate = (candidate: TransferInventoryCandidate, checked: boolean) => {
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

  const submit = () => {
    setError(null);
    if (!fromLocationId || !toLocationId) {
      setError("请先选择起运位置和目标位置");
      return;
    }
    if (selectedCandidates.length === 0) {
      setError("请至少选择一项要发出的库存");
      return;
    }
    const invalid = selectedCandidates.find((candidate) => {
      const quantity = numeric(selected[candidate.key]);
      return quantity <= 0 || quantity > numeric(candidate.availableQuantity);
    });
    if (invalid) {
      setError(`${invalid.skuCode} 的发出数量超过当前可用数量`);
      return;
    }

    startTransition(async () => {
      const result = await createTransferShipmentAction({
        storeId,
        fromLocationId,
        toLocationId,
        lines: selectedCandidates.map((candidate) => ({
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          quantity: selected[candidate.key],
        })),
        trackingNo,
        carrier,
        transportMode,
        carriedBy: transportMode === "HAND_CARRY" ? carriedBy : undefined,
        grossWeightKg,
        etaDate,
        shippingCost,
        shippingCurrency,
        note,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/logistics/transfers/${result.shipmentId}`);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="grid gap-4 border-b bg-muted/20 p-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="transfer-package-from">起运位置</Label>
              <Select
                id="transfer-package-from"
                value={fromLocationId}
                onChange={(event) => {
                  setFromLocationId(event.target.value);
                  setSelected({});
                  setError(null);
                  if (event.target.value === toLocationId) setToLocationId("");
                }}
              >
                <option value="">请选择库存所在位置</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {locationLabel(location)}
                  </option>
                ))}
              </Select>
            </div>
            <ArrowRight className="mb-3 hidden h-4 w-4 text-muted-foreground md:block" />
            <div className="space-y-2">
              <Label htmlFor="transfer-package-to">目标位置</Label>
              <Select
                id="transfer-package-to"
                value={toLocationId}
                onChange={(event) => {
                  setToLocationId(event.target.value);
                  setError(null);
                }}
              >
                <option value="">请选择收货位置</option>
                {locations
                  .filter((location) => location.id !== fromLocationId)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {locationLabel(location)}
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">选择本包裹实际装入的商品</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                可跨采购来源混装；只锁定本次填写的数量，未选部分继续留在起运位置。
              </p>
            </div>
            <label className="relative block w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索可转运库存"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="搜索 SKU、商品或采购单"
              />
            </label>
          </div>

          {!fromLocationId ? (
            <div className="flex flex-col items-center gap-2 border-t px-4 py-12 text-center">
              <PackageSearch className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">先选择起运位置</p>
              <p className="text-xs text-muted-foreground">系统会列出该位置可用于转运的库存。</p>
            </div>
          ) : sourceCandidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 border-t px-4 py-12 text-center">
              <Box className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">当前没有可转运库存</p>
              <p className="text-xs text-muted-foreground">
                已被销售占用、待复检或正在其他物流中的库存不会出现在这里。
              </p>
            </div>
          ) : (
            <div className="divide-y border-t">
              {sourceCandidates.map((candidate) => {
                const checked = numeric(selected[candidate.key]) > 0;
                const quantity = selected[candidate.key] ?? "";
                const remaining = Math.max(
                  0,
                  numeric(candidate.availableQuantity) - numeric(quantity)
                );
                return (
                  <div
                    key={candidate.key}
                    className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_9rem] sm:items-center"
                  >
                    <Checkbox
                      id={`select-${candidate.key.replaceAll(":", "-")}`}
                      checked={checked}
                      onChange={(event) => toggleCandidate(candidate, event.target.checked)}
                      aria-label={`选择 ${candidate.skuCode} ${candidate.skuName}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {candidate.skuCode} · {candidate.skuName}
                        </p>
                        {candidate.purchaseOrderId === focusPurchaseOrderId ? (
                          <Badge>当前采购</Badge>
                        ) : null}
                        {candidate.entityType === "ITEM_UNIT" ? (
                          <Badge variant="outline">单件 {candidate.unitCode}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {candidate.sourceReference} · 可发 {candidate.availableQuantity} 件
                      </p>
                    </div>
                    {candidate.entityType === "LOT" ? (
                      <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:block">
                        <Label
                          htmlFor={`quantity-${candidate.key.replaceAll(":", "-")}`}
                          className="text-xs text-muted-foreground"
                        >
                          本次发出
                        </Label>
                        <Input
                          id={`quantity-${candidate.key.replaceAll(":", "-")}`}
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
                      <p className="text-right text-xs text-muted-foreground">本次发出 1 件</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">发出信息</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              发出方确认后库存进入在途；目标位置仍需独立确认到货。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="transfer-transport-mode">运输方式</Label>
              <Select
                id="transfer-transport-mode"
                value={transportMode}
                onChange={(event) => setTransportMode(event.target.value as typeof transportMode)}
              >
                <option value="COURIER">快递 / 配送</option>
                <option value="CONSOLIDATOR">集运商 / 转运商</option>
                <option value="POSTAL">邮局寄送</option>
                <option value="FREIGHT">货运</option>
                <option value="HAND_CARRY">本人或朋友携带</option>
                <option value="OTHER">其他</option>
              </Select>
            </div>
            {transportMode === "HAND_CARRY" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="transfer-carried-by">携带人</Label>
                <Input
                  id="transfer-carried-by"
                  value={carriedBy}
                  onChange={(event) => setCarriedBy(event.target.value)}
                  placeholder="例如：本人、朋友小王"
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="transfer-tracking-no">物流单号</Label>
                  <Input
                    id="transfer-tracking-no"
                    value={trackingNo}
                    onChange={(event) => setTrackingNo(event.target.value)}
                    placeholder="可稍后在备注补充"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-carrier">承运商</Label>
                  <Input
                    id="transfer-carrier"
                    value={carrier}
                    onChange={(event) => setCarrier(event.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="transfer-eta">预计到货日</Label>
              <Input
                id="transfer-eta"
                type="date"
                value={etaDate}
                onChange={(event) => setEtaDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-weight">毛重（kg）</Label>
              <Input
                id="transfer-weight"
                inputMode="decimal"
                value={grossWeightKg}
                onChange={(event) => setGrossWeightKg(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-cost">本段邮费</Label>
              <Input
                id="transfer-cost"
                inputMode="decimal"
                value={shippingCost}
                onChange={(event) => setShippingCost(event.target.value)}
                placeholder="可选"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-currency">币种</Label>
              <Input
                id="transfer-currency"
                value={shippingCurrency}
                maxLength={3}
                onChange={(event) => setShippingCurrency(event.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="transfer-note">备注</Label>
              <Textarea
                id="transfer-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：国内采购发往东京集运仓，和 PO-002 混装"
              />
            </div>
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-lg border bg-card p-4 xl:sticky xl:top-6">
        <div>
          <p className="text-sm font-semibold">发出确认</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            路线不区分国内或国外，系统只认实际的起运位置与目标位置。
          </p>
        </div>
        <div className="space-y-3 rounded-md bg-muted/30 p-3">
          <div className="flex gap-2">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-[11px] text-muted-foreground">发出方</p>
              <p className="text-sm font-medium">{locationLabel(source)}</p>
            </div>
          </div>
          <div className="ml-2 h-5 border-l border-dashed" aria-hidden="true" />
          <div className="flex gap-2">
            <Plane className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-[11px] text-muted-foreground">收货方</p>
              <p className="text-sm font-medium">{locationLabel(destination)}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">已选明细</span>
            <span className="font-medium">{selectedCandidates.length} 项</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">发出总数</span>
            <span className="font-medium">
              {selectedQuantity.toLocaleString("zh-CN", { maximumFractionDigits: 4 })} 件
            </span>
          </div>
        </div>
        <div className="flex gap-2 rounded-md border bg-background p-3 text-xs leading-5 text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p>确认后只锁定所选数量；目标位置确认到货前，不计入目标仓库存。</p>
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full"
          disabled={pending || !fromLocationId || !toLocationId || selectedCandidates.length === 0}
          onClick={submit}
        >
          {pending ? "正在确认发出…" : "确认发出并进入在途"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() => router.push("/logistics/transfers")}
        >
          返回转运包裹
        </Button>
      </aside>
    </div>
  );
}
