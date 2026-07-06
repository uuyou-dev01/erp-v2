import Link from "next/link";
import { PackageSearch, Plus } from "lucide-react";
import { getMarketplaceOffers } from "@/app/actions/supply-offers";
import {
  SupplyOfferStatusBadge,
  SupplyOfferVisibilityBadge,
} from "@/components/marketplace/supply-offer-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

export default async function MarketplacePage() {
  const offers = await getMarketplaceOffers();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">货盘市场</h1>
          <p className="text-muted-foreground">查看公开或授权可见的供给货盘，后续可从这里创建代卖上架。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/marketplace/my-offers">
            <Button variant="outline">我的供给</Button>
          </Link>
          <Link href="/marketplace/new">
            <Button>
              <Plus className="h-4 w-4" />
              发布货盘
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>可见货盘</CardTitle>
        </CardHeader>
        <CardContent>
          {offers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <PackageSearch className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">暂无可见货盘</h3>
              <p className="mb-4 max-w-md text-sm text-muted-foreground">
                当前还没有公开或授权给你的货盘。可以先发布自己的供给，或在合作方中建立关系。
              </p>
              <Link href="/marketplace/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  发布货盘
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {offers.map((offer) => (
                <div key={offer.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/marketplace/${offer.id}`} className="font-semibold hover:underline">
                        {offer.title}
                      </Link>
                      <SupplyOfferStatusBadge status={offer.status} />
                      <SupplyOfferVisibilityBadge visibility={offer.visibility} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      供给方：{offer.ownerPartner?.name ?? "本店自有"} · 发货地：{offer.shipFromLocation ?? "-"} · 履约：{offer.fulfillmentMode}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">可供数量</div>
                      <div className="font-medium">{offer.availableQty}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">供货价</div>
                      <div className="font-medium">{formatMoney(offer.currency, offer.unitPrice)}</div>
                    </div>
                    <Link href={`/marketplace/${offer.id}`}>
                      <Button variant="outline" size="sm">查看</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
