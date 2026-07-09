"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createListing } from "@/app/actions/listings";
import { getPlatforms } from "@/app/actions/platforms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import { getMissingPlatforms } from "@/lib/application/sellable-listing-guide";
import { X } from "lucide-react";

const STORE_ID = "store_1";
const FALLBACK_CURRENCY_OPTIONS = ["CNY", "JPY", "USD"] as const;

interface QuickAddListingDialogProps {
  open: boolean;
  onClose: () => void;
  product: ListingCoverageProduct;
  initialPlatformId?: string;
  initialListingScope?: "SKU" | "ITEM_UNIT";
  initialItemUnitId?: string;
}

export function QuickAddListingDialog({
  open,
  onClose,
  product,
  initialPlatformId,
  initialListingScope,
  initialItemUnitId,
}: QuickAddListingDialogProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [platformId, setPlatformId] = useState(initialPlatformId ?? "");
  const [listedPrice, setListedPrice] = useState(
    product.referencePrice ?? ""
  );
  const [listingScope, setListingScope] = useState<"SKU" | "ITEM_UNIT">(
    product.hasItemUnits && !product.hasLotStock ? "ITEM_UNIT" : "SKU"
  );
  const [itemUnitId, setItemUnitId] = useState("");
  const [currency, setCurrency] = useState(
    product.referenceCurrency ?? "CNY"
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [platformMeta, setPlatformMeta] = useState<
    Record<string, { defaultCurrency: string | null }>
  >({});

  const productLabel = `${product.skuCode} · ${product.skuName}`;
  const sellableUnits = useMemo(
    () => product.itemUnits.filter((unit) => unit.sellable),
    [product.itemUnits]
  );
  const availablePlatforms = useMemo(
    () =>
      getMissingPlatforms(product, {
        listingScope,
        itemUnitId: listingScope === "ITEM_UNIT" ? itemUnitId : undefined,
      }),
    [itemUnitId, listingScope, product]
  );
  const currencyOptions = useMemo(() => {
    const options = new Set<string>();
    const addCurrency = (value?: string | null) => {
      const normalized = value?.trim().toUpperCase();
      if (normalized) options.add(normalized);
    };

    addCurrency(currency);
    addCurrency(product.referenceCurrency);
    for (const meta of Object.values(platformMeta)) {
      addCurrency(meta.defaultCurrency);
    }
    for (const fallback of FALLBACK_CURRENCY_OPTIONS) {
      addCurrency(fallback);
    }

    return [...options];
  }, [currency, platformMeta, product.referenceCurrency]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const nextScope =
      initialListingScope ?? (product.hasItemUnits && !product.hasLotStock ? "ITEM_UNIT" : "SKU");
    const nextItemUnitId = initialItemUnitId ?? sellableUnits[0]?.id ?? "";
    const firstMissing = getMissingPlatforms(product, {
      listingScope: nextScope,
      itemUnitId: nextScope === "ITEM_UNIT" ? nextItemUnitId : undefined,
    })[0]?.id;

    setPlatformId(initialPlatformId ?? firstMissing ?? "");
    setListedPrice(product.referencePrice ?? "");
    setListingScope(nextScope);
    setItemUnitId(nextItemUnitId);
    setCurrency(product.referenceCurrency ?? "CNY");
    setSubmitError(null);
  }, [
    open,
    initialPlatformId,
    initialListingScope,
    initialItemUnitId,
    product,
    product.referencePrice,
    product.hasItemUnits,
    product.hasLotStock,
    product.referenceCurrency,
    sellableUnits,
  ]);

  useEffect(() => {
    if (!open) return;
    if (availablePlatforms.length === 0) {
      if (platformId) setPlatformId("");
      return;
    }
    if (!availablePlatforms.some((platform) => platform.id === platformId)) {
      setPlatformId(availablePlatforms[0].id);
    }
  }, [availablePlatforms, open, platformId]);

  useEffect(() => {
    if (!open || Object.keys(platformMeta).length > 0) return;
    let cancelled = false;
    getPlatforms(STORE_ID).then((rows) => {
      if (cancelled) return;
      const map: Record<string, { defaultCurrency: string | null }> = {};
      for (const row of rows) {
        map[row.id] = { defaultCurrency: row.defaultCurrency };
      }
      setPlatformMeta(map);
    });
    return () => {
      cancelled = true;
    };
  }, [open, platformMeta]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const selectedPlatform = availablePlatforms.find((p) => p.id === platformId);

  const handlePlatformChange = (id: string) => {
    setPlatformId(id);
    setSubmitError(null);
    const meta = platformMeta[id];
    if (meta?.defaultCurrency) setCurrency(meta.defaultCurrency);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platformId) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const result = await createListing({
        storeId: STORE_ID,
        platformId,
        listingType: listingScope,
        skuId: product.skuId,
        itemUnitId: listingScope === "ITEM_UNIT" ? itemUnitId || undefined : undefined,
        listedPrice: listedPrice || undefined,
        currency: currency || undefined,
      });
      if (!result.success) {
        setSubmitError(result.error);
        return;
      }
      onClose();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "添加上架记录失败");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => !loading && onClose()} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border bg-card p-4 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">添加上架记录</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{productLabel}</p>
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
            {product.hasLotStock && product.hasItemUnits ? (
              <div className="space-y-1.5">
                <Label className="text-xs">上架对象</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={listingScope === "SKU" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setListingScope("SKU")}
                    disabled={loading}
                  >
                    批次（可售 {product.sellableLotQty}）
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={listingScope === "ITEM_UNIT" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setListingScope("ITEM_UNIT")}
                    disabled={loading || product.sellableItemUnitCount === 0}
                  >
                    中古单件（{product.sellableItemUnitCount}）
                  </Button>
                </div>
              </div>
            ) : null}

            {product.hasItemUnits && listingScope === "ITEM_UNIT" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">选择单件</Label>
                <select
                  value={itemUnitId}
                  onChange={(e) => setItemUnitId(e.target.value)}
                  disabled={loading}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {sellableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.conditionGrade ? `品相 ${u.conditionGrade}` : "中古单件"} · {u.locationName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs">平台</Label>
              {availablePlatforms.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {availablePlatforms.map((platform) => (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => handlePlatformChange(platform.id)}
                      className={`rounded-full p-0.5 transition ring-2 ${
                        platformId === platform.id
                          ? "ring-primary"
                          : "ring-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <ListingPlatformMark
                        code={platform.code}
                        name={platform.name}
                        className="h-8 w-8"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  当前上架对象已覆盖所有可用平台。
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-listed-price" className="text-xs">
                  挂牌价
                </Label>
                <Input
                  id="quick-listed-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={listedPrice}
                  onChange={(e) => setListedPrice(e.target.value)}
                  placeholder="选填"
                  disabled={loading}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-currency" className="text-xs">
                  币种
                </Label>
                <Select
                  id="quick-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={loading}
                  className="h-9"
                >
                  {currencyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {selectedPlatform ? (
              <p className="text-xs text-muted-foreground">
                将记录为已在 {selectedPlatform.name} 上架
              </p>
            ) : null}

            {submitError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {submitError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  loading ||
                  !platformId ||
                  availablePlatforms.length === 0 ||
                  (listingScope === "ITEM_UNIT" && !itemUnitId)
                }
              >
                {loading ? "保存中…" : "确认添加"}
              </Button>
            </div>
          </form>
      </div>
    </div>,
    document.body
  );
}
