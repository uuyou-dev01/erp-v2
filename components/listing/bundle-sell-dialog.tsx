"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { AlertCircle, Boxes, CircleDollarSign, PackageCheck, RotateCcw, X } from "lucide-react";
import { bundleSellListings, previewBundleSellEligibility } from "@/app/actions/listings";
import type { ListingOpsItem } from "@/components/listing/listing-ops-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductImage } from "@/components/ui/product-image";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  allocateBundleSaleAmounts,
  bundleAllocationDifference,
} from "@/lib/application/bundle-sale";
import { resolveBundleFulfillmentEligibility } from "@/lib/application/bundle-fulfillment-eligibility";
import { createClientId } from "@/lib/client-id";
import { FULFILLMENT_DESTINATIONS } from "@/lib/inventory/location-fulfillment";

interface BundleSellDialogProps {
  open: boolean;
  listings: ListingOpsItem[];
  onClose: () => void;
}

interface BundleFulfillmentPreviewState {
  status: "idle" | "loading" | "ready";
  eligible: boolean;
  commonLocations: Array<{
    locationId: string;
    code: string;
    name: string;
    region: string | null;
  }>;
  reasons: string[];
}

const EMPTY_FULFILLMENT_PREVIEW: BundleFulfillmentPreviewState = {
  status: "idle",
  eligible: false,
  commonLocations: [],
  reasons: [],
};

function numeric(value?: string | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimal(value?: string | null) {
  try {
    const parsed = new Decimal(value || 0);
    return parsed.isFinite() ? parsed : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

function money(currency: string, value: number) {
  return `${currency} ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
}

export function BundleSellDialog({ open, listings, onClose }: BundleSellDialogProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [allocationMode, setAllocationMode] = useState<"PROPORTIONAL" | "CUSTOM">("PROPORTIONAL");
  const [totalPrice, setTotalPrice] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [fulfillmentPreview, setFulfillmentPreview] =
    useState<BundleFulfillmentPreviewState>(EMPTY_FULFILLMENT_PREVIEW);
  const [form, setForm] = useState({
    platformFeeRate: "",
    platformFeeAmount: "",
    shippingFee: "",
    shipFromLocationId: "",
    shippingCountry: "",
    customerName: "散客",
    customerEmail: "",
    customerPhone: "",
    shippingAddress: "",
    externalOrderNo: "",
  });

  const currency = listings[0]?.currency || "CNY";
  const allocationBasis = useMemo(
    () =>
      listings.map((listing) => ({
        id: listing.id,
        referenceAmount: decimal(listing.listedPrice)
          .mul(decimal(quantities[listing.id] ?? "1"))
          .toString(),
      })),
    [listings, quantities]
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || listings.length === 0) return;
    const nextQuantities = Object.fromEntries(listings.map((listing) => [listing.id, "1"]));
    const referenceTotal = listings.reduce(
      (sum, listing) => sum.plus(decimal(listing.listedPrice)),
      new Decimal(0)
    );
    const nextTotal = referenceTotal.gt(0) ? referenceTotal.toFixed(2) : "";
    setQuantities(nextQuantities);
    setTotalPrice(nextTotal);
    setAmounts(
      nextTotal
        ? allocateBundleSaleAmounts(
            nextTotal,
            listings.map((listing) => ({
              id: listing.id,
              referenceAmount: listing.listedPrice,
            }))
          )
        : Object.fromEntries(listings.map((listing) => [listing.id, "0.00"]))
    );
    setAllocationMode("PROPORTIONAL");
    setFulfillmentPreview(EMPTY_FULFILLMENT_PREVIEW);
    setError("");
    setRequestId(createClientId());
    setForm({
      platformFeeRate: listings[0].platformFeeRate || "",
      platformFeeAmount: "",
      shippingFee: "",
      shipFromLocationId: "",
      shippingCountry: ["CN", "JP", "US", "EU"].includes(listings[0].platform.country || "")
        ? listings[0].platform.country || ""
        : "",
      customerName: "散客",
      customerEmail: "",
      customerPhone: "",
      shippingAddress: "",
      externalOrderNo: "",
    });
  }, [open, listings]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || allocationMode !== "PROPORTIONAL" || !totalPrice) return;
    setAmounts(allocateBundleSaleAmounts(totalPrice, allocationBasis));
  }, [open, totalPrice, allocationBasis, allocationMode]);

  const parcelEligibility = useMemo(() => {
    return resolveBundleFulfillmentEligibility({
      destinationMarket: form.shippingCountry,
      lines: listings.map((listing) => ({
        lineId: listing.skuName || listing.id,
        salesChannelAccountId: listing.salesChannelAccountId,
        currency: listing.currency,
        quantity: listing.listingType === "ITEM_UNIT" ? "1" : (quantities[listing.id] ?? "1"),
        candidatePhysicalLocations: listing.sellableLocations.map((location) => ({
          locationId: location.locationId,
          availableQuantity: location.qty,
          fulfillmentMarkets: location.fulfillableMarkets || [],
        })),
      })),
    });
  }, [listings, quantities, form.shippingCountry]);

  useEffect(() => {
    if (!open) return;
    if (listings.length < 2 || !form.shippingCountry) {
      setFulfillmentPreview(EMPTY_FULFILLMENT_PREVIEW);
      return;
    }

    let cancelled = false;
    setFulfillmentPreview({
      status: "loading",
      eligible: false,
      commonLocations: [],
      reasons: [],
    });

    const timer = window.setTimeout(async () => {
      try {
        const result = await previewBundleSellEligibility({
          lines: listings.map((listing) => ({
            listingId: listing.id,
            quantity: listing.listingType === "ITEM_UNIT" ? "1" : (quantities[listing.id] ?? "1"),
          })),
          shippingCountry: form.shippingCountry,
        });
        if (cancelled) return;

        if (!result.success) {
          setFulfillmentPreview({
            status: "ready",
            eligible: false,
            commonLocations: [],
            reasons: [result.error],
          });
          return;
        }

        setFulfillmentPreview({
          status: "ready",
          eligible: result.preview.eligible,
          commonLocations: result.preview.commonLocations.map((location) => ({
            locationId: location.id,
            code: location.code,
            name: location.name,
            region: location.region,
          })),
          reasons: result.preview.reasons.map((reason) => reason.message),
        });
      } catch (caught) {
        if (cancelled) return;
        setFulfillmentPreview({
          status: "ready",
          eligible: false,
          commonLocations: [],
          reasons: [caught instanceof Error ? caught.message : "共同发货仓校验失败，请重试"],
        });
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, listings, quantities, form.shippingCountry]);

  const commonLocations = fulfillmentPreview.commonLocations;

  useEffect(() => {
    if (!open) return;
    setForm((current) => {
      if (
        current.shipFromLocationId &&
        commonLocations.some((location) => location.locationId === current.shipFromLocationId)
      ) {
        return current;
      }
      return {
        ...current,
        shipFromLocationId: commonLocations.length === 1 ? commonLocations[0].locationId : "",
      };
    });
  }, [open, commonLocations]);

  if (!mounted || !open) return null;

  const allocationDifference = bundleAllocationDifference(totalPrice, Object.values(amounts));
  const subtotal = numeric(totalPrice);
  const platformFee = form.platformFeeAmount
    ? numeric(form.platformFeeAmount)
    : subtotal * numeric(form.platformFeeRate);
  const shippingFee = numeric(form.shippingFee);
  const estimatedNet = subtotal - platformFee - shippingFee;

  const redistribute = () => {
    if (!totalPrice) return;
    setAmounts(allocateBundleSaleAmounts(totalPrice, allocationBasis));
    setAllocationMode("PROPORTIONAL");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (allocationDifference !== "0.00") {
      setError(`明细分摊合计与成交价相差 ${allocationDifference}`);
      return;
    }
    if (fulfillmentPreview.status !== "ready" || !fulfillmentPreview.eligible) {
      setError(
        fulfillmentPreview.reasons[0] ||
          parcelEligibility.reasons[0]?.message ||
          "所选商品未通过共同发货仓校验"
      );
      return;
    }
    if (
      !form.shipFromLocationId ||
      !commonLocations.some((location) => location.locationId === form.shipFromLocationId)
    ) {
      setError(fulfillmentPreview.reasons[0] || "所选商品没有共同可发仓，不能合并为一个包裹");
      return;
    }

    setLoading(true);
    try {
      const result = await bundleSellListings({
        requestId,
        lines: listings.map((listing) => ({
          listingId: listing.id,
          quantity: quantities[listing.id],
          allocatedAmount: amounts[listing.id] || "0",
        })),
        totalPrice,
        platformFeeRate: form.platformFeeRate || undefined,
        platformFeeAmount: form.platformFeeAmount || undefined,
        shippingFee: form.shippingFee || undefined,
        shipFromLocationId: form.shipFromLocationId,
        shippingCountry: form.shippingCountry || undefined,
        customerName: form.customerName || undefined,
        customerEmail: form.customerEmail || undefined,
        customerPhone: form.customerPhone || undefined,
        shippingAddress: form.shippingAddress || undefined,
        externalOrderNo: form.externalOrderNo || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.push(`/sales/${result.orderId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "打包出售失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !loading && onClose()} />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="bundle-sell-title"
        className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-hidden"
      >
        <CardHeader className="border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle id="bundle-sell-title" className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-primary" />
                打包出售
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {listings[0]?.platform.name} · {listings.length} 款商品合成 1 张销售订单
              </p>
            </div>
            <button
              type="button"
              aria-label="关闭打包出售表单"
              onClick={() => !loading && onClose()}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <form onSubmit={handleSubmit}>
            <div className="max-h-[calc(92vh-188px)] space-y-6 overflow-y-auto px-6 py-5">
              {error ? (
                <p
                  role="alert"
                  className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              ) : null}

              <section className="space-y-3" aria-labelledby="bundle-lines-title">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 id="bundle-lines-title" className="text-sm font-semibold">
                      商品与成交价分摊
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      默认按各商品上架金额占比分摊，可按实际成交情况调整。
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={redistribute}
                    disabled={!totalPrice || loading}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    按上架价重新分摊
                  </Button>
                </div>

                <div className="overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[minmax(240px,1fr)_100px_150px] gap-3 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                    <span>商品</span>
                    <span>数量</span>
                    <span>分摊成交额</span>
                  </div>
                  {listings.map((listing) => (
                    <div
                      key={listing.id}
                      className="grid grid-cols-[minmax(240px,1fr)_100px_150px] items-center gap-3 border-t px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ProductImage
                          src={listing.imageUrl}
                          alt={listing.skuName}
                          size="sm"
                          className="shrink-0 rounded-md"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{listing.skuName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {listing.skuCode} · 上架价{" "}
                            {listing.listedPrice
                              ? money(currency, numeric(listing.listedPrice))
                              : "未定价"}
                          </p>
                        </div>
                      </div>
                      <Input
                        aria-label={`${listing.skuName} 数量`}
                        type="number"
                        min="1"
                        step="1"
                        value={
                          listing.listingType === "ITEM_UNIT"
                            ? "1"
                            : (quantities[listing.id] ?? "1")
                        }
                        disabled={listing.listingType === "ITEM_UNIT" || loading}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [listing.id]: event.target.value,
                          }))
                        }
                      />
                      <Input
                        aria-label={`${listing.skuName} 分摊成交额`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={amounts[listing.id] || ""}
                        disabled={loading}
                        onChange={(event) => {
                          setAllocationMode("CUSTOM");
                          setAmounts((current) => ({
                            ...current,
                            [listing.id]: event.target.value,
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-total-price">打包最终成交价 ({currency})</Label>
                    <Input
                      id="bundle-total-price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={totalPrice}
                      disabled={loading}
                      onChange={(event) => setTotalPrice(event.target.value)}
                      placeholder="例如 4500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-fee-rate">平台费率</Label>
                    <Input
                      id="bundle-fee-rate"
                      type="number"
                      min="0"
                      max="1"
                      step="0.0001"
                      value={form.platformFeeRate}
                      disabled={loading}
                      onChange={(event) =>
                        setForm({ ...form, platformFeeRate: event.target.value })
                      }
                      placeholder="例如 0.1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-fee-amount">平台实际手续费 ({currency})</Label>
                    <Input
                      id="bundle-fee-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.platformFeeAmount}
                      disabled={loading}
                      onChange={(event) =>
                        setForm({ ...form, platformFeeAmount: event.target.value })
                      }
                      placeholder="不填则按费率计算"
                    />
                  </div>
                </div>
                {allocationDifference !== "0.00" ? (
                  <p className="text-xs font-medium text-destructive">
                    分摊合计与成交价相差 {allocationDifference}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-700">明细合计已与打包成交价对齐</p>
                )}
              </section>

              <section
                className="space-y-3 border-t pt-5"
                aria-labelledby="bundle-fulfillment-title"
              >
                <div className="flex items-start gap-2">
                  <PackageCheck className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <h3 id="bundle-fulfillment-title" className="text-sm font-semibold">
                      一次打包与发货
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      所有商品必须在同一实际仓位；合包后的尺寸可能变化，邮费可在打包后核算。
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      提交时会再次核对实际库存池归属、合作协议有效期和仓库执行权限。
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-country">收货国家/地区</Label>
                    <Select
                      id="bundle-country"
                      required
                      value={form.shippingCountry}
                      disabled={loading}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          shippingCountry: event.target.value,
                          shipFromLocationId: "",
                        })
                      }
                    >
                      <option value="">请选择</option>
                      {FULFILLMENT_DESTINATIONS.filter((item) => item.code !== "GLOBAL").map(
                        (item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        )
                      )}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-location">共同发货仓</Label>
                    <Select
                      id="bundle-location"
                      required
                      value={form.shipFromLocationId}
                      disabled={
                        loading ||
                        fulfillmentPreview.status !== "ready" ||
                        !fulfillmentPreview.eligible ||
                        commonLocations.length === 0
                      }
                      onChange={(event) =>
                        setForm({ ...form, shipFromLocationId: event.target.value })
                      }
                    >
                      <option value="">
                        {fulfillmentPreview.status === "loading"
                          ? "正在校验..."
                          : commonLocations.length
                            ? "请选择"
                            : "没有共同可发仓"}
                      </option>
                      {commonLocations.map((location) => (
                        <option key={location.locationId} value={location.locationId}>
                          {location.code} · {location.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-shipping-fee">预估邮费（选填，{currency}）</Label>
                    <Input
                      id="bundle-shipping-fee"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.shippingFee}
                      disabled={loading}
                      onChange={(event) => setForm({ ...form, shippingFee: event.target.value })}
                      placeholder="留空则标记为待打包核算"
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      最终以包裹尺寸、重量和承运方式产生的实际费用为准。
                    </p>
                  </div>
                </div>
                {fulfillmentPreview.status === "loading" ? (
                  <p
                    role="status"
                    className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground"
                  >
                    正在核验销售账号、库存池权限、合作协议、仓库履约人员与实时可用库存…
                  </p>
                ) : fulfillmentPreview.status === "ready" && !fulfillmentPreview.eligible ? (
                  <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {fulfillmentPreview.reasons[0] || "当前选择不能从同一实际仓位合成一个包裹。"}
                  </p>
                ) : fulfillmentPreview.status === "idle" &&
                  !parcelEligibility.parcelEligible &&
                  listings.length >= 2 ? (
                  <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {parcelEligibility.reasons[0]?.message || "请先选择明确的收货国家/地区。"}
                  </p>
                ) : null}
              </section>

              <section className="space-y-3 border-t pt-5" aria-labelledby="bundle-customer-title">
                <h3 id="bundle-customer-title" className="text-sm font-semibold">
                  客户与平台订单
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-customer">客户名称</Label>
                    <Input
                      id="bundle-customer"
                      value={form.customerName}
                      disabled={loading}
                      onChange={(event) => setForm({ ...form, customerName: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-external-no">平台订单号</Label>
                    <Input
                      id="bundle-external-no"
                      value={form.externalOrderNo}
                      disabled={loading}
                      onChange={(event) =>
                        setForm({ ...form, externalOrderNo: event.target.value })
                      }
                      placeholder="建议填写，便于对账"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-phone">客户电话（选填）</Label>
                    <Input
                      id="bundle-phone"
                      type="tel"
                      value={form.customerPhone}
                      disabled={loading}
                      onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bundle-email">客户邮箱（选填）</Label>
                    <Input
                      id="bundle-email"
                      type="email"
                      value={form.customerEmail}
                      disabled={loading}
                      onChange={(event) => setForm({ ...form, customerEmail: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="bundle-address">收货地址 / 备注</Label>
                    <Textarea
                      id="bundle-address"
                      className="min-h-20"
                      value={form.shippingAddress}
                      disabled={loading}
                      onChange={(event) =>
                        setForm({ ...form, shippingAddress: event.target.value })
                      }
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="border-t bg-background px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span>
                    <span className="text-muted-foreground">成交总额 </span>
                    <strong>{money(currency, subtotal)}</strong>
                  </span>
                  <span>
                    <span className="text-muted-foreground">平台费 </span>
                    <strong className="text-destructive">-{money(currency, platformFee)}</strong>
                  </span>
                  <span>
                    <span className="text-muted-foreground">邮费 </span>
                    {form.shippingFee ? (
                      <strong className="text-destructive">-{money(currency, shippingFee)}</strong>
                    ) : (
                      <strong className="text-amber-700">待核算</strong>
                    )}
                  </span>
                  <span>
                    <span className="text-muted-foreground">
                      {form.shippingFee ? "预估到手 " : "未扣邮费到手 "}
                    </span>
                    <strong className="text-emerald-700">{money(currency, estimatedNet)}</strong>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
                    取消
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      loading ||
                      !requestId ||
                      fulfillmentPreview.status !== "ready" ||
                      !fulfillmentPreview.eligible ||
                      !form.shipFromLocationId ||
                      allocationDifference !== "0.00"
                    }
                  >
                    <CircleDollarSign className="mr-2 h-4 w-4" />
                    {loading ? "处理中..." : "确认打包出售"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}
