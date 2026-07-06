"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createListing } from "@/app/actions/listings";
import { getPlatforms } from "@/app/actions/platforms";
import { getSKUs } from "@/app/actions/skus";
import { getItemUnits } from "@/app/actions/item-units";
import { getSkuStockBreakdownMap } from "@/app/actions/inventory-lots";
import type { SkuStockBreakdown } from "@/lib/application/inventory";
import { Calculator, CheckCircle, Truck, AlertTriangle } from "lucide-react";

interface ListingFormProps {
  storeId: string;
  initialSkuId?: string;
  initialItemUnitId?: string;
  initialPlatformId?: string;
  initialListingType?: "SKU" | "ITEM_UNIT";
  returnHref?: string;
}

interface PlatformData {
  id: string;
  name: string;
  code: string;
  country: string | null;
  defaultFeeRate: unknown;
  shippingRules?: unknown;
  defaultCurrency: string | null;
}

interface SKU {
  id: string;
  code: string;
  name: string;
  catalogRole?: string | null;
  parentSkuId?: string | null;
  childSkus?: { id: string }[];
}

interface ItemUnit {
  id: string;
  status: string;
  conditionGrade: string | null;
  sku: {
    code: string;
  };
}

export function ListingForm({
  storeId,
  initialSkuId = "",
  initialItemUnitId = "",
  initialPlatformId = "",
  initialListingType,
  returnHref = "/inventory/sellable",
}: ListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<PlatformData[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [itemUnits, setItemUnits] = useState<ItemUnit[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, SkuStockBreakdown>>({});
  const resolvedListingType =
    initialListingType ?? (initialItemUnitId ? "ITEM_UNIT" : "SKU");
  const [formData, setFormData] = useState({
    platformId: initialPlatformId,
    listingType: resolvedListingType,
    skuId: initialSkuId,
    itemUnitId: initialItemUnitId,
    listedPrice: "",
    currency: "CNY",
    feeRateOverride: "",
    shippingFeeOverride: "",
  });

  useEffect(() => {
    const loadData = async () => {
      const [platformsData, skusData, itemUnitsData, stockData] = await Promise.all([
        getPlatforms(storeId),
        getSKUs(storeId),
        getItemUnits(storeId),
        getSkuStockBreakdownMap(storeId),
      ]);
      setPlatforms(platformsData as unknown as PlatformData[]);
      setSkus(skusData);
      setItemUnits(itemUnitsData.filter((item) => item.status === "AVAILABLE"));
      setStockMap(stockData);

      if (initialPlatformId) {
        const selected = (platformsData as unknown as PlatformData[]).find(
          (platform) => platform.id === initialPlatformId
        );
        if (selected?.defaultCurrency) {
          setFormData((prev) => ({
            ...prev,
            currency: selected.defaultCurrency || prev.currency,
          }));
        }
      }
    };
    loadData();
  }, [storeId, initialPlatformId]);

  const selectedPlatform = useMemo(
    () => platforms.find((p) => p.id === formData.platformId),
    [platforms, formData.platformId]
  );

  const estimatedNet = useMemo(() => {
    const price = parseFloat(formData.listedPrice);
    if (!price || !selectedPlatform) return null;

    const feeRate = formData.feeRateOverride
      ? parseFloat(formData.feeRateOverride)
      : selectedPlatform.defaultFeeRate
        ? Number(selectedPlatform.defaultFeeRate)
        : 0;

    const shippingAmount = formData.shippingFeeOverride
      ? parseFloat(formData.shippingFeeOverride)
      : 0;

    const net = price * (1 - feeRate) - shippingAmount;
    return isNaN(net) ? null : net;
  }, [formData.listedPrice, formData.feeRateOverride, formData.shippingFeeOverride, selectedPlatform]);

  const handlePlatformChange = (platformId: string) => {
    const platform = platforms.find((p) => p.id === platformId);
    setSubmitError(null);
    setFormData({
      ...formData,
      platformId,
      currency: platform?.defaultCurrency || formData.currency,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSubmitError(null);

    try {
      const result = await createListing({
        storeId,
        platformId: formData.platformId,
        listingType: formData.listingType,
        skuId: formData.listingType === "SKU" ? formData.skuId : undefined,
        itemUnitId:
          formData.listingType === "ITEM_UNIT" ? formData.itemUnitId : undefined,
        listedPrice: formData.listedPrice || undefined,
        currency: formData.currency || undefined,
        feeRateOverride: formData.feeRateOverride || undefined,
        shippingFeeOverride: formData.shippingFeeOverride || undefined,
        estimatedNet: estimatedNet != null ? estimatedNet.toFixed(4) : undefined,
      });
      if (!result.success) {
        setSubmitError(result.error);
        return;
      }

      router.push(returnHref);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "添加上架记录失败，请重试",
      );
    } finally {
      setLoading(false);
    }
  };

  const activeFeeRate = formData.feeRateOverride
    ? parseFloat(formData.feeRateOverride)
    : selectedPlatform?.defaultFeeRate
      ? Number(selectedPlatform.defaultFeeRate)
      : null;

  const shippingRules = Array.isArray(selectedPlatform?.shippingRules)
    ? (selectedPlatform.shippingRules as Array<{
        name?: string;
        carrier?: string | null;
        sizeClass?: string | null;
        maxWeightKg?: string | null;
        fee?: string | null;
        currency?: string | null;
        notes?: string | null;
      }>)
    : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="platformId">销售平台</Label>
        <Select
          id="platformId"
          value={formData.platformId}
          onChange={(e) => handlePlatformChange(e.target.value)}
          required
        >
          <option value="">选择平台</option>
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
              {platform.defaultFeeRate ? ` (${(Number(platform.defaultFeeRate) * 100).toFixed(1)}%)` : ""}
            </option>
          ))}
        </Select>
        {platforms.length === 0 && (
          <p className="text-xs text-muted-foreground">
            请先在「库存设置 → 销售平台配置」中添加销售平台
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          上架负责人字段将在后续版本支持；当前仅记录平台、价格与上架时间。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="listingType">商品类型</Label>
        <Select
          id="listingType"
          value={formData.listingType}
          onChange={(e) =>
            setFormData({
              ...formData,
              listingType: e.target.value as "SKU" | "ITEM_UNIT",
              skuId: "",
              itemUnitId: "",
            })
          }
        >
          <option value="SKU">SKU（批量商品）</option>
          <option value="ITEM_UNIT">单品（独立商品）</option>
        </Select>
      </div>

      {formData.listingType === "SKU" ? (
        <div className="space-y-2">
          <Label htmlFor="skuId">选择SKU</Label>
          <Select
            id="skuId"
            value={formData.skuId}
            onChange={(e) => {
              setSubmitError(null);
              setFormData({ ...formData, skuId: e.target.value });
            }}
            required
          >
            <option value="">选择SKU</option>
            {skus
              .filter((sku) => sku.catalogRole !== "GROUP" && (sku.parentSkuId || !sku.childSkus?.length))
              .map((sku) => {
              const breakdown = stockMap[sku.id];
              const stockLabel = breakdown
                ? ` · 可发 ${breakdown.sellableQty}${
                    breakdown.inTransitQty > 0
                      ? ` / 转运 ${breakdown.inTransitQty}`
                      : ""
                  }`
                : "";
              return (
                <option key={sku.id} value={sku.id}>
                  {sku.code} - {sku.name}
                  {stockLabel}
                </option>
              );
            })}
          </Select>
          {formData.skuId ? <SkuStockHint breakdown={stockMap[formData.skuId]} /> : null}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="itemUnitId">选择单品</Label>
          <Select
            id="itemUnitId"
            value={formData.itemUnitId}
            onChange={(e) => {
              setSubmitError(null);
              setFormData({ ...formData, itemUnitId: e.target.value });
            }}
            required
          >
            <option value="">选择单品</option>
            {itemUnits.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku.code} - {item.conditionGrade || "未知成色"}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="listedPrice">Listing 价格（选填）</Label>
          <Input
            id="listedPrice"
            type="number"
            step="0.01"
            placeholder="留空自动使用 SKU 参考价"
            value={formData.listedPrice}
            onChange={(e) =>
              setFormData({ ...formData, listedPrice: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            不填写时将自动使用该 SKU 的参考价，最终成交价在登记售出时再填写。
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">货币</Label>
          <Select
            id="currency"
            value={formData.currency}
            onChange={(e) =>
              setFormData({ ...formData, currency: e.target.value })
            }
          >
            <option value="CNY">人民币 (CNY)</option>
            <option value="USD">美元 (USD)</option>
            <option value="JPY">日元 (JPY)</option>
            <option value="EUR">欧元 (EUR)</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="feeRateOverride">费率覆盖（选填）</Label>
          <Input
            id="feeRateOverride"
            type="number"
            step="0.0001"
            min="0"
            max="1"
            placeholder={
              activeFeeRate != null && !formData.feeRateOverride
                ? `平台默认: ${(activeFeeRate * 100).toFixed(1)}%`
                : "例如：0.12 (12%)"
            }
            value={formData.feeRateOverride}
            onChange={(e) =>
              setFormData({ ...formData, feeRateOverride: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            留空则使用平台默认费率
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="shippingFeeOverride">本次实际运费（选填）</Label>
          <Input
            id="shippingFeeOverride"
            type="number"
            step="0.01"
            min="0"
            placeholder="按实际配送方式填写金额"
            value={formData.shippingFeeOverride}
            onChange={(e) =>
              setFormData({ ...formData, shippingFeeOverride: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            运费通常按尺寸、重量和配送方式变化，留空则暂不扣除运费
          </p>
        </div>
      </div>

      {selectedPlatform && shippingRules.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-white/40 p-3">
          <p className="mb-2 text-sm font-medium">平台配送规则参考</p>
          <div className="space-y-2">
            {shippingRules.map((rule, index) => (
              <div key={index} className="rounded-md bg-white/50 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{rule.name || `规则 ${index + 1}`}</span>
                  {rule.fee && (
                    <span className="font-mono">
                      {rule.currency || formData.currency} {rule.fee}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {[rule.carrier, rule.sizeClass, rule.maxWeightKg, rule.notes]
                    .filter(Boolean)
                    .join(" · ") || "未填写适用条件"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 到手价计算卡片 */}
      {selectedPlatform && formData.listedPrice && (
        <Card className="border-brand-blue/30 bg-brand-blue/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="h-4 w-4 text-brand-blue" />
              <span className="text-sm font-medium">平台到手价估算</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Listing 价格</span>
              <span className="text-right font-medium">
                {formData.currency} {parseFloat(formData.listedPrice).toFixed(2)}
              </span>

              <span className="text-muted-foreground">平台费率</span>
              <span className="text-right">
                {activeFeeRate != null ? `${(activeFeeRate * 100).toFixed(1)}%` : "未设置"}
                {formData.feeRateOverride && (
                  <span className="ml-1 text-xs text-brand-blue">（已覆盖）</span>
                )}
              </span>

              <span className="text-muted-foreground">平台抽成</span>
              <span className="text-right text-destructive">
                -{formData.currency}{" "}
                {activeFeeRate != null
                  ? (parseFloat(formData.listedPrice) * activeFeeRate).toFixed(2)
                  : "0.00"}
              </span>

              <span className="text-muted-foreground">运费</span>
              <span className="text-right text-destructive">
                -{formData.currency}{" "}
                {formData.shippingFeeOverride
                  ? parseFloat(formData.shippingFeeOverride).toFixed(2)
                  : "0.00"}
              </span>

              <div className="col-span-2 border-t my-1" />

              <span className="font-medium">预估到手价</span>
              <span className="text-right font-bold text-lg text-brand-blue">
                {formData.currency} {estimatedNet != null ? estimatedNet.toFixed(2) : "-"}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {submitError ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{submitError}</p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading || platforms.length === 0}>
          {loading ? "保存中..." : "添加上架记录"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(returnHref)}
          disabled={loading}
        >
          取消
        </Button>
      </div>
    </form>
  );
}

function SkuStockHint({ breakdown }: { breakdown?: SkuStockBreakdown }) {
  const sellable = breakdown?.sellableQty ?? 0;
  const inTransit = breakdown?.inTransitQty ?? 0;

  if (sellable === 0 && inTransit === 0) {
    return (
      <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <p className="text-muted-foreground">
          该 SKU 暂无任何库存。Listing 仍可创建（仅做平台占位/提醒），登记售出前请确保到货。
        </p>
      </div>
    );
  }

  if (sellable === 0 && inTransit > 0) {
    return (
      <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
        <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="text-amber-700 font-medium">
            暂无可发货库存，仅有 {inTransit} 件在转运中
          </p>
          <p className="text-muted-foreground">
            {breakdown!.inTransitLocations
              .map((loc) => `${loc.code} ${loc.qty}`)
              .join(" · ")}
            。建议先调拨到本土仓 / 代发仓后再上架。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <Badge
        variant="default"
        className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
      >
        <CheckCircle className="mr-1 h-3 w-3" />
        可发 {sellable}
      </Badge>
      {inTransit > 0 ? (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-amber-700"
        >
          <Truck className="mr-1 h-3 w-3" />
          转运 {inTransit}
        </Badge>
      ) : null}
      {breakdown && breakdown.sellableLocations.length > 0 ? (
        <span className="text-muted-foreground">
          ·{" "}
          {breakdown.sellableLocations
            .map((loc) => `${loc.code} ${loc.qty}`)
            .join(" · ")}
        </span>
      ) : null}
    </div>
  );
}
