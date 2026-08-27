"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getListingFifoShipFromLocation, quickSellListing } from "@/app/actions/listings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StockLocationBreakdown } from "@/lib/application/inventory";
import { FULFILLMENT_DESTINATIONS } from "@/lib/inventory/location-fulfillment";
import {
  AlertCircle,
  BellRing,
  ChevronDown,
  CircleDollarSign,
  PackageCheck,
  ShoppingCart,
  UserRound,
  X,
} from "lucide-react";

const FEE_RATE_PRESETS = [
  { value: "0", label: "0%" },
  { value: "0.05", label: "5%" },
  { value: "0.088", label: "8.8%" },
  { value: "0.1", label: "10%" },
  { value: "0.15", label: "15%" },
] as const;

function feeRatePercent(value: string) {
  const rate = Number(value);
  return Number.isFinite(rate) ? String(Number((rate * 100).toFixed(4))) : "";
}

interface QuickSellButtonProps {
  listingId: string;
  listingType: "SKU" | "ITEM_UNIT";
  status: string;
  productLabel: string;
  listedPrice?: string | null;
  currency?: string | null;
  platformName?: string | null;
  platformCountry?: string | null;
  platformFeeRate?: string | null;
  defaultShippingFee?: string | null;
  /** 卡片行内紧凑样式 */
  compact?: boolean;
  sellableLocations?: StockLocationBreakdown[];
}

export function QuickSellButton({
  listingId,
  listingType,
  status,
  productLabel,
  listedPrice,
  currency,
  platformName,
  platformCountry,
  platformFeeRate,
  defaultShippingFee,
  compact = false,
  sellableLocations = [],
}: QuickSellButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fifoDefaultLocationId, setFifoDefaultLocationId] = useState<string | null>(null);
  const [customFeeRate, setCustomFeeRate] = useState(false);
  const [feeAmountMode, setFeeAmountMode] = useState<"RATE" | "AMOUNT">("RATE");
  const [formData, setFormData] = useState({
    quantity: "1",
    unitPrice: listedPrice || "",
    platformFeeRate: platformFeeRate || "",
    platformFeeAmount: "",
    shippingFee: defaultShippingFee || "",
    shipFromLocationId: "",
    customerName: "散客",
    customerEmail: "",
    customerPhone: "",
    shippingAddress: "",
    shippingCountry:
      platformCountry && ["CN", "JP", "US", "EU"].includes(platformCountry) ? platformCountry : "",
    externalOrderNo: "",
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      unitPrice: listedPrice || prev.unitPrice,
      platformFeeRate: platformFeeRate || prev.platformFeeRate,
      shippingFee: defaultShippingFee || prev.shippingFee,
      shippingCountry:
        prev.shippingCountry ||
        (platformCountry && ["CN", "JP", "US", "EU"].includes(platformCountry)
          ? platformCountry
          : ""),
    }));
  }, [listedPrice, platformFeeRate, defaultShippingFee, platformCountry]);

  const eligibleLocations = sellableLocations.filter((location) => {
    if (!formData.shippingCountry) return true;
    const markets = location.fulfillableMarkets ?? [];
    return (
      markets.includes("GLOBAL") || markets.some((market) => market === formData.shippingCountry)
    );
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || listingType !== "SKU") return;

    let cancelled = false;
    void getListingFifoShipFromLocation(listingId).then(({ locationId }) => {
      if (cancelled || !locationId) return;
      setFifoDefaultLocationId(locationId);
      setFormData((prev) =>
        prev.shipFromLocationId ? prev : { ...prev, shipFromLocationId: locationId }
      );
    });

    return () => {
      cancelled = true;
    };
  }, [open, listingId, listingType]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (status !== "ACTIVE") return null;

  const handleOpen = () => {
    setFifoDefaultLocationId(null);
    setCustomFeeRate(false);
    setFeeAmountMode(formData.platformFeeAmount ? "AMOUNT" : "RATE");
    setError("");
    setFormData((prev) => ({ ...prev, shipFromLocationId: "" }));
    setOpen(true);
  };

  const handleClose = () => {
    if (loading) return;
    setOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await quickSellListing({
        listingId,
        quantity: listingType === "ITEM_UNIT" ? "1" : formData.quantity,
        unitPrice: formData.unitPrice || undefined,
        platformFeeRate: formData.platformFeeRate || undefined,
        platformFeeAmount: formData.platformFeeAmount || undefined,
        shippingFee: formData.shippingFee || undefined,
        shipFromLocationId:
          listingType === "SKU" ? formData.shipFromLocationId || undefined : undefined,
        customerName: formData.customerName || undefined,
        customerEmail: formData.customerEmail || undefined,
        customerPhone: formData.customerPhone || undefined,
        shippingAddress: formData.shippingAddress || undefined,
        shippingCountry: formData.shippingCountry || undefined,
        externalOrderNo: formData.externalOrderNo || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.push(`/sales/${result.orderId}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "登记售出失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const quantity = listingType === "ITEM_UNIT" ? 1 : Number(formData.quantity || 0);
  const unitPrice = Number(formData.unitPrice || 0);
  const grossAmount = quantity * unitPrice;
  const feeRate = Number(formData.platformFeeRate || 0);
  const calculatedPlatformFee = grossAmount * feeRate;
  const platformFee = formData.platformFeeAmount
    ? Number(formData.platformFeeAmount || 0)
    : calculatedPlatformFee;
  const shippingFee = Number(formData.shippingFee || 0);
  const estimatedNet = grossAmount - platformFee - shippingFee;
  const money = (value: number) =>
    `${currency || ""} ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`.trim();
  const platformRateIsPreset = FEE_RATE_PRESETS.some((preset) => preset.value === platformFeeRate);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={compact ? "h-7 px-2.5 text-xs" : undefined}
        onClick={handleOpen}
      >
        <ShoppingCart className={compact ? "mr-1 h-3 w-3" : "mr-2 h-4 w-4"} />
        {compact ? "售出" : "登记售出"}
      </Button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
            <Card
              role="dialog"
              aria-modal="true"
              aria-labelledby={`quick-sell-title-${listingId}`}
              className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-hidden"
            >
              <CardHeader className="border-b px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle id={`quick-sell-title-${listingId}`}>登记售出</CardTitle>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{productLabel}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {platformName ? <span>平台：{platformName}</span> : null}
                      <span>币种：{currency || "未设置"}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={loading}
                    aria-label="关闭登记售出表单"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <form onSubmit={handleSubmit}>
                  <div className="max-h-[calc(90vh-220px)] space-y-5 overflow-y-auto px-6 py-5">
                    {error ? (
                      <p
                        role="alert"
                        className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        {error}
                      </p>
                    ) : null}

                    <section aria-labelledby={`sale-section-${listingId}`} className="space-y-3">
                      <div className="flex items-start gap-2">
                        <CircleDollarSign className="mt-0.5 h-4 w-4 text-primary" />
                        <div>
                          <h3 id={`sale-section-${listingId}`} className="text-sm font-semibold">
                            成交与费用
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            先确认成交金额，费用默认沿用平台设置。
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`quantity-${listingId}`}>数量</Label>
                          <Input
                            id={`quantity-${listingId}`}
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            value={listingType === "ITEM_UNIT" ? "1" : formData.quantity}
                            disabled={listingType === "ITEM_UNIT" || loading}
                            onChange={(event) =>
                              setFormData({ ...formData, quantity: event.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`unitPrice-${listingId}`}>
                            最终售出单价 {currency ? `(${currency})` : ""}
                          </Label>
                          <Input
                            id={`unitPrice-${listingId}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.unitPrice}
                            onChange={(event) =>
                              setFormData({ ...formData, unitPrice: event.target.value })
                            }
                            placeholder="最终成交单价"
                            disabled={loading}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`platformFeeRate-${listingId}`}>平台费率</Label>
                          <Select
                            id={`platformFeeRate-${listingId}`}
                            value={customFeeRate ? "__custom" : formData.platformFeeRate}
                            onChange={(event) => {
                              if (event.target.value === "__custom") {
                                setCustomFeeRate(true);
                                return;
                              }
                              setCustomFeeRate(false);
                              setFormData({ ...formData, platformFeeRate: event.target.value });
                            }}
                            disabled={loading}
                          >
                            <option value="">使用平台默认费率</option>
                            {platformFeeRate && !platformRateIsPreset ? (
                              <option value={platformFeeRate}>
                                {feeRatePercent(platformFeeRate)}%（平台默认）
                              </option>
                            ) : null}
                            {FEE_RATE_PRESETS.map((preset) => (
                              <option key={preset.value} value={preset.value}>
                                {preset.label}
                                {preset.value === platformFeeRate ? "（平台默认）" : ""}
                              </option>
                            ))}
                            <option value="__custom">其他费率…</option>
                          </Select>
                          {customFeeRate ? (
                            <div className="relative">
                              <Input
                                aria-label="自定义平台费率（%）"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={feeRatePercent(formData.platformFeeRate)}
                                onChange={(event) => {
                                  const percent = Number(event.target.value);
                                  setFormData({
                                    ...formData,
                                    platformFeeRate:
                                      event.target.value === "" || !Number.isFinite(percent)
                                        ? ""
                                        : String(percent / 100),
                                  });
                                }}
                                placeholder="输入百分比"
                                disabled={loading}
                                className="pr-8"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                %
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`platformFeeMode-${listingId}`}>手续费计算方式</Label>
                          <Select
                            id={`platformFeeMode-${listingId}`}
                            value={feeAmountMode}
                            onChange={(event) => {
                              const mode = event.target.value as "RATE" | "AMOUNT";
                              setFeeAmountMode(mode);
                              if (mode === "RATE") {
                                setFormData({ ...formData, platformFeeAmount: "" });
                              }
                            }}
                            disabled={loading}
                          >
                            <option value="RATE">
                              按费率自动计算（{money(calculatedPlatformFee)}）
                            </option>
                            <option value="AMOUNT">填写平台实际扣费</option>
                          </Select>
                        </div>
                        {feeAmountMode === "AMOUNT" ? (
                          <div className="space-y-1.5">
                            <Label htmlFor={`platformFeeAmount-${listingId}`}>
                              平台实际手续费 {currency ? `(${currency})` : ""}
                            </Label>
                            <Input
                              id={`platformFeeAmount-${listingId}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.platformFeeAmount}
                              onChange={(event) =>
                                setFormData({
                                  ...formData,
                                  platformFeeAmount: event.target.value,
                                })
                              }
                              placeholder="平台实际扣费金额"
                              disabled={loading}
                            />
                          </div>
                        ) : null}
                        <div className="space-y-1.5">
                          <Label htmlFor={`shippingFee-${listingId}`}>
                            邮费成本 {currency ? `(${currency})` : ""}
                          </Label>
                          <Input
                            id={`shippingFee-${listingId}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.shippingFee}
                            onChange={(event) =>
                              setFormData({ ...formData, shippingFee: event.target.value })
                            }
                            placeholder="实际邮费，未知可暂不填"
                            disabled={loading}
                          />
                        </div>
                      </div>
                    </section>

                    <section
                      aria-labelledby={`fulfillment-section-${listingId}`}
                      className="space-y-3 border-t pt-5"
                    >
                      <div className="flex items-start gap-2">
                        <PackageCheck className="mt-0.5 h-4 w-4 text-primary" />
                        <div>
                          <h3
                            id={`fulfillment-section-${listingId}`}
                            className="text-sm font-semibold"
                          >
                            发货安排
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            收货地决定可选仓库，系统优先选择符合 FIFO 的库存位置。
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[minmax(170px,0.7fr)_minmax(0,1.6fr)]">
                        <div className="space-y-1.5">
                          <Label htmlFor={`shippingCountry-${listingId}`}>收货国家/地区</Label>
                          <Select
                            id={`shippingCountry-${listingId}`}
                            value={formData.shippingCountry}
                            onChange={(event) =>
                              setFormData({
                                ...formData,
                                shippingCountry: event.target.value,
                                shipFromLocationId: "",
                              })
                            }
                            disabled={loading}
                            required
                          >
                            <option value="">请选择</option>
                            {FULFILLMENT_DESTINATIONS.filter(
                              (destination) => destination.code !== "GLOBAL"
                            ).map((destination) => (
                              <option key={destination.code} value={destination.code}>
                                {destination.label}
                              </option>
                            ))}
                          </Select>
                        </div>

                        {listingType === "SKU" ? (
                          <div className="space-y-1.5">
                            <Label htmlFor={`shipFromLocationId-${listingId}`}>
                              发货方 / 发货仓
                            </Label>
                            <Select
                              id={`shipFromLocationId-${listingId}`}
                              value={formData.shipFromLocationId}
                              onChange={(event) =>
                                setFormData({
                                  ...formData,
                                  shipFromLocationId: event.target.value,
                                })
                              }
                              disabled={loading || eligibleLocations.length === 0}
                              required
                            >
                              {eligibleLocations.length === 0 ? (
                                <option value="">暂无可履约仓位</option>
                              ) : (
                                eligibleLocations.map((location) => (
                                  <option key={location.locationId} value={location.locationId}>
                                    {location.code} · {location.name}（可发 {location.qty}）
                                    {location.locationId === fifoDefaultLocationId
                                      ? " · FIFO 默认"
                                      : ""}
                                  </option>
                                ))
                              )}
                            </Select>
                          </div>
                        ) : (
                          <div className="flex items-end pb-2 text-sm text-muted-foreground">
                            发货仓由当前单件库存位置自动确定。
                          </div>
                        )}
                      </div>

                      <div className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
                        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                        <p>
                          确认登记后会创建仓库发货任务，并通知所选仓库中具备发货权限的账号；库存将在确认发货时扣减。
                        </p>
                      </div>
                    </section>

                    <section
                      aria-labelledby={`customer-section-${listingId}`}
                      className="space-y-3 border-t pt-5"
                    >
                      <div className="flex items-start gap-2">
                        <UserRound className="mt-0.5 h-4 w-4 text-primary" />
                        <div>
                          <h3
                            id={`customer-section-${listingId}`}
                            className="text-sm font-semibold"
                          >
                            客户与平台订单
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            高频只需填写客户称呼和平台订单号，联系方式按需补充。
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`customerName-${listingId}`}>客户名称</Label>
                          <Input
                            id={`customerName-${listingId}`}
                            value={formData.customerName}
                            onChange={(event) =>
                              setFormData({ ...formData, customerName: event.target.value })
                            }
                            placeholder="未填写时记为散客"
                            disabled={loading}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`externalOrderNo-${listingId}`}>平台订单号</Label>
                          <Input
                            id={`externalOrderNo-${listingId}`}
                            value={formData.externalOrderNo}
                            onChange={(event) =>
                              setFormData({ ...formData, externalOrderNo: event.target.value })
                            }
                            placeholder="建议填写，便于平台对账"
                            disabled={loading}
                          />
                        </div>
                      </div>

                      <details className="group rounded-md border bg-muted/15">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium marker:content-none">
                          更多客户信息（选填）
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="grid gap-3 border-t px-3 py-3 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`customerPhone-${listingId}`}>客户电话</Label>
                            <Input
                              id={`customerPhone-${listingId}`}
                              type="tel"
                              value={formData.customerPhone}
                              onChange={(event) =>
                                setFormData({ ...formData, customerPhone: event.target.value })
                              }
                              placeholder="选填"
                              disabled={loading}
                              autoComplete="tel"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`customerEmail-${listingId}`}>客户邮箱</Label>
                            <Input
                              id={`customerEmail-${listingId}`}
                              type="email"
                              value={formData.customerEmail}
                              onChange={(event) =>
                                setFormData({ ...formData, customerEmail: event.target.value })
                              }
                              placeholder="选填"
                              disabled={loading}
                              autoComplete="email"
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <Label htmlFor={`shippingAddress-${listingId}`}>收货地址 / 备注</Label>
                            <Textarea
                              id={`shippingAddress-${listingId}`}
                              value={formData.shippingAddress}
                              onChange={(event) =>
                                setFormData({
                                  ...formData,
                                  shippingAddress: event.target.value,
                                })
                              }
                              placeholder="选填：收货地址或本单备注"
                              disabled={loading}
                              autoComplete="street-address"
                              className="min-h-20 resize-y"
                            />
                          </div>
                        </div>
                      </details>
                    </section>
                  </div>

                  <div className="border-t bg-background px-6 py-4 shadow-[0_-8px_20px_-18px_rgba(15,23,42,0.45)]">
                    <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">成交总额</p>
                        <p className="mt-0.5 font-medium tabular-nums">{money(grossAmount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">平台手续费</p>
                        <p className="mt-0.5 font-medium tabular-nums text-destructive">
                          -{money(platformFee)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">邮费成本</p>
                        <p className="mt-0.5 font-medium tabular-nums text-destructive">
                          -{money(shippingFee)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium">预估到手</p>
                        <p className="mt-0.5 font-semibold tabular-nums text-emerald-700">
                          {money(estimatedNet)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleClose}
                        disabled={loading}
                      >
                        取消
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          loading || (listingType === "SKU" && eligibleLocations.length === 0)
                        }
                      >
                        {loading ? "处理中..." : "确认登记并创建发货任务"}
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>,
          document.body
        )}
    </>
  );
}
