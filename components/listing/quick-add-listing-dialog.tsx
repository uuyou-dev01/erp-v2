"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createListing } from "@/app/actions/listings";
import { getPlatforms } from "@/app/actions/platforms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import type { ListingCoverageProduct } from "@/lib/application/listing-coverage";
import { getMissingPlatforms } from "@/lib/application/sellable-listing-guide";
import { X } from "lucide-react";

const STORE_ID = "store_1";

interface QuickAddListingDialogProps {
  open: boolean;
  onClose: () => void;
  product: ListingCoverageProduct;
  initialPlatformId?: string;
}

export function QuickAddListingDialog({
  open,
  onClose,
  product,
  initialPlatformId,
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
  const [platformMeta, setPlatformMeta] = useState<
    Record<string, { defaultCurrency: string | null }>
  >({});

  const missing = getMissingPlatforms(product);
  const productLabel = `${product.skuCode} · ${product.skuName}`;
  const sellableUnits = product.itemUnits.filter((u) => u.sellable);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const firstMissing = getMissingPlatforms(product)[0]?.id;
    setPlatformId(initialPlatformId ?? firstMissing ?? "");
    setListedPrice(product.referencePrice ?? "");
    setListingScope(product.hasItemUnits && !product.hasLotStock ? "ITEM_UNIT" : "SKU");
    setItemUnitId(sellableUnits[0]?.id ?? "");
    setCurrency(product.referenceCurrency ?? "CNY");
    getPlatforms(STORE_ID).then((rows) => {
      const map: Record<string, { defaultCurrency: string | null }> = {};
      for (const row of rows) {
        map[row.id] = { defaultCurrency: row.defaultCurrency };
      }
      setPlatformMeta(map);
    });
  }, [open, initialPlatformId, product, sellableUnits]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const selectedPlatform = missing.find((p) => p.id === platformId);

  const handlePlatformChange = (id: string) => {
    setPlatformId(id);
    const meta = platformMeta[id];
    if (meta?.defaultCurrency) setCurrency(meta.defaultCurrency);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platformId) return;
    setLoading(true);
    try {
      await createListing({
        storeId: STORE_ID,
        platformId,
        listingType: listingScope,
        skuId: product.skuId,
        itemUnitId: listingScope === "ITEM_UNIT" ? itemUnitId || undefined : undefined,
        listedPrice: listedPrice || undefined,
        currency: currency || undefined,
      });
      onClose();
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "添加上架记录失败");
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

        {missing.length === 0 ? (
          <p className="text-sm text-muted-foreground">所有平台均已有上架记录。</p>
        ) : (
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
              <div className="flex flex-wrap gap-1.5">
                {missing.map((platform) => (
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
                <Input
                  id="quick-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={loading}
                  className="h-9"
                />
              </div>
            </div>

            {selectedPlatform ? (
              <p className="text-xs text-muted-foreground">
                将记录为已在 {selectedPlatform.name} 上架
              </p>
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
                  (listingScope === "ITEM_UNIT" && !itemUnitId)
                }
              >
                {loading ? "保存中…" : "确认添加"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
