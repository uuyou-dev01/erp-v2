"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuickSellButton } from "@/components/listing/quick-sell-button";
import { delistListingAction } from "@/app/actions/listings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import type { StockLocationBreakdown } from "@/lib/application/inventory";
type Row = {
  listingId: string;
  name: string;
  imageUrl: string | null;
  status: string;
  platformName: string;
  platformCountry: string | null;
  listingScope: "SKU" | "ITEM_UNIT";
  listedPrice: string | null;
  currency: string | null;
  platformFeeRate: string | null;
  defaultShippingFee: string | null;
  sellableQty: number;
  sellableLocations: StockLocationBreakdown[];
};
export function MobileListings({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const visible = rows.filter(
    (r) =>
      r.status === status && `${r.name} ${r.platformName}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="space-y-4">
      <Input
        aria-label="搜索在售商品"
        placeholder="搜索商品或平台"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-11"
      />
      <div className="flex gap-2">
        {[
          ["ACTIVE", "在售"],
          ["SOLD_OUT", "已售完"],
          ["DELISTED", "已下架"],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={status === key ? "default" : "outline"}
            onClick={() => setStatus(key)}
          >
            {label} {rows.filter((r) => r.status === key).length}
          </Button>
        ))}
      </div>
      <p className="text-xs leading-5 text-slate-500">
        这里只更新 ERP 记录。其他平台的同件商品，请在平台确认下架，避免重复出售。
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {!visible.length && (
        <p className="py-12 text-center text-sm text-slate-500">没有匹配的商品</p>
      )}
      {visible.map((row) => (
        <article key={row.listingId} className="space-y-3 border-b border-slate-200 pb-4">
          <div className="flex gap-3">
            <ProductImage src={row.imageUrl} alt={row.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{row.name}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {row.platformName} · 可售 {row.sellableQty} 件
              </p>
              <p className="mt-2 font-semibold">
                {row.currency} {row.listedPrice ?? "待定价"}
              </p>
            </div>
          </div>
          {row.status === "ACTIVE" && (
            <div className="flex flex-wrap items-center gap-3">
              <QuickSellButton
                listingId={row.listingId}
                listingType={row.listingScope}
                status={row.status}
                productLabel={row.name}
                listedPrice={row.listedPrice}
                currency={row.currency}
                platformName={row.platformName}
                platformCountry={row.platformCountry}
                platformFeeRate={row.platformFeeRate}
                defaultShippingFee={row.defaultShippingFee}
                sellableLocations={row.sellableLocations}
                mobile
              />
              <Button variant="ghost" onClick={() => setConfirm(row.listingId)}>
                仅下架
              </Button>
            </div>
          )}
          {confirm === row.listingId && (
            <div className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm">
              <p>确认在 ERP 中下架此条记录？不会生成销售订单。</p>
              <div className="flex gap-2">
                <Button
                  disabled={pending}
                  onClick={() => {
                    setError("");
                    start(async () => {
                      try {
                        const result = await delistListingAction(row.listingId);
                        if (!result.success) {
                          setError(result.error);
                          return;
                        }
                        setConfirm(null);
                        router.refresh();
                      } catch {
                        setError("下架失败，请重试");
                      }
                    });
                  }}
                >
                  确认下架
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => setConfirm(null)}>
                  取消
                </Button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
