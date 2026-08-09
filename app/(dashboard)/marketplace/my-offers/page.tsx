import Link from "next/link";
import { PackagePlus, Plus } from "lucide-react";
import { getMySupplyOffers } from "@/app/actions/supply-offers";
import { SupplyOfferActions } from "@/components/marketplace/supply-offer-actions";
import {
  SupplyOfferStatusBadge,
  SupplyOfferVisibilityBadge,
} from "@/components/marketplace/supply-offer-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function MySupplyOffersPage() {
  const offers = await getMySupplyOffers();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">我的供给货盘</h1>
          <p className="text-muted-foreground">管理当前经营主体的共享货盘、销售账号、代卖方和履约规则。</p>
        </div>
        <Link href="/marketplace/new">
          <Button>
            <Plus className="h-4 w-4" />
            发布货盘
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>供给列表</CardTitle>
        </CardHeader>
        <CardContent>
          {offers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <PackagePlus className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">还没有供给货盘</h3>
              <p className="mb-4 max-w-md text-sm text-muted-foreground">
                从这里发布本店自有货，或登记合作方给你的外部供给。
              </p>
              <Link href="/marketplace/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  创建第一条货盘
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {offers.map((offer) => (
                <div key={offer.id} className="grid gap-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/marketplace/my-offers/${offer.id}`} className="font-semibold hover:underline">
                        {offer.title}
                      </Link>
                      <SupplyOfferStatusBadge status={offer.status} />
                      <SupplyOfferVisibilityBadge visibility={offer.visibility} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {offer.items.length} 个商品 · 可接单 {Math.max(Number(offer.availableQty) - Number(offer.reservedQty), 0)} · 订单占用 {offer.reservedQty} · 在售渠道 {offer.salesChannels.filter((channel) => channel.status === "ACTIVE").length}
                    </div>
                  </div>
                  <SupplyOfferActions id={offer.id} title={offer.title} status={offer.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
