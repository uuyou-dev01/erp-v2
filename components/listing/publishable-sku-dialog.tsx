"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X, CheckCircle, Truck, AlertTriangle } from "lucide-react";

interface LocationBreakdown {
  locationId: string;
  code: string;
  name: string;
  type: string;
  qty: number;
}

interface PublishableSkuItem {
  skuId: string;
  skuCode: string;
  skuName: string;
  sellableQty: number;
  inTransitQty: number;
  sellableLocations: LocationBreakdown[];
  inTransitLocations: LocationBreakdown[];
  availablePlatforms: Array<{
    id: string;
    name: string;
  }>;
}

interface PublishableSkuDialogProps {
  items: PublishableSkuItem[];
}

type Tab = "sellable" | "inTransit";

function StockHint({ locations }: { locations: LocationBreakdown[] }) {
  if (locations.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {locations
        .map((loc) => `${loc.code} ${loc.qty}`)
        .join(" · ")}
    </p>
  );
}

export function PublishableSkuDialog({ items }: PublishableSkuDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("sellable");

  const { sellableItems, inTransitItems } = useMemo(() => {
    const sellable = items.filter((item) => item.sellableQty > 0);
    const inTransit = items.filter(
      (item) => item.sellableQty === 0 && item.inTransitQty > 0
    );
    return { sellableItems: sellable, inTransitItems: inTransit };
  }, [items]);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        可上架商品
        {sellableItems.length > 0 ? (
          <Badge
            variant="default"
            className="ml-2 bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
          >
            {sellableItems.length}
          </Badge>
        ) : null}
      </Button>
    );
  }

  const list = tab === "sellable" ? sellableItems : inTransitItems;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <Card className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>可上架商品</CardTitle>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 inline-flex rounded-lg bg-muted p-1 text-sm">
            <button
              type="button"
              onClick={() => setTab("sellable")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition ${
                tab === "sellable"
                  ? "bg-white shadow-sm font-medium"
                  : "text-muted-foreground"
              }`}
            >
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              可发货 ({sellableItems.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("inTransit")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition ${
                tab === "inTransit"
                  ? "bg-white shadow-sm font-medium"
                  : "text-muted-foreground"
              }`}
            >
              <Truck className="h-3.5 w-3.5 text-amber-600" />
              转运中 ({inTransitItems.length})
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {tab === "inTransit" && inTransitItems.length > 0 ? (
            <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-muted-foreground">
                这些 SKU 还没有可直接发货的库存，仅有库存在转运/集运仓中。建议先把货调拨到本土仓 / 代发仓再上架。
                如果其中有&quot;代发型转运仓&quot;，请到「仓库位置」把它的「默认可销售」打开。
              </p>
            </div>
          ) : null}

          {list.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {tab === "sellable"
                ? "暂无可上架的可发货 SKU。已全部覆盖目标平台，或库存均在转运中。"
                : "暂无仅在转运中的 SKU。"}
            </div>
          ) : (
            list.map((item) => (
              <div
                key={item.skuId}
                className="rounded-lg border border-border/60 bg-white/60 p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{item.skuCode}</p>
                    <p className="text-sm text-muted-foreground">{item.skuName}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {item.sellableQty > 0 ? (
                        <Badge
                          variant="default"
                          className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          可发 {item.sellableQty}
                        </Badge>
                      ) : null}
                      {item.inTransitQty > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-700"
                        >
                          <Truck className="mr-1 h-3 w-3" />
                          转运 {item.inTransitQty}
                        </Badge>
                      ) : null}
                    </div>

                    {item.sellableLocations.length > 0 && tab === "sellable" ? (
                      <StockHint locations={item.sellableLocations} />
                    ) : null}
                    {item.inTransitLocations.length > 0 && tab === "inTransit" ? (
                      <StockHint locations={item.inTransitLocations} />
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.availablePlatforms.map((platform) => (
                        <Badge key={platform.id} variant="secondary">
                          可上架到 {platform.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link
                      href={`/listing/new?skuId=${item.skuId}`}
                      onClick={() => setOpen(false)}
                    >
                      <Button size="sm" variant={tab === "sellable" ? "default" : "outline"}>
                        创建上架
                      </Button>
                    </Link>
                    {item.availablePlatforms.slice(0, 2).map((platform) => (
                      <Link
                        key={platform.id}
                        href={`/listing/new?skuId=${item.skuId}&platformId=${platform.id}`}
                        onClick={() => setOpen(false)}
                      >
                        <Button size="sm" variant="outline">
                          上架到 {platform.name}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
