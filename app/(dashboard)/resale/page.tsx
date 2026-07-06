import Link from "next/link";
import { Store, Plus } from "lucide-react";
import { getResaleListings } from "@/app/actions/resale-listings";
import { ResaleActions } from "@/components/resale/resale-actions";
import { ResaleStatusBadge } from "@/components/resale/resale-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

export default async function ResalePage() {
  const listings = await getResaleListings();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">代卖上架</h1>
          <p className="text-muted-foreground">管理本店从货盘创建的代卖商品、平台和利润估算。</p>
        </div>
        <Link href="/marketplace">
          <Button>
            <Plus className="h-4 w-4" />
            从货盘创建
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>代卖列表</CardTitle>
        </CardHeader>
        <CardContent>
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Store className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">还没有代卖上架</h3>
              <p className="mb-4 max-w-md text-sm text-muted-foreground">
                先去货盘市场选择一个可见供给，再创建本店的代卖上架。
              </p>
              <Link href="/marketplace">
                <Button>打开货盘市场</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {listings.map((listing) => (
                <div key={listing.id} className="grid gap-4 py-4 xl:grid-cols-[1fr_auto] xl:items-center">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/resale/${listing.id}`} className="font-semibold hover:underline">
                        {listing.title}
                      </Link>
                      <ResaleStatusBadge status={listing.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      平台 {listing.platform.name} · 来源 {listing.supplyOffer.title} · 计划 {listing.quantityPlanned} · 已售 {listing.quantitySold}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[auto_auto_auto] sm:items-center">
                    <div className="text-sm">
                      <div className="text-muted-foreground">售价</div>
                      <div className="font-medium">{formatMoney(listing.currency, listing.targetPrice)}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground">预估利润</div>
                      <div className="font-medium">{formatMoney(listing.currency, listing.estimatedGrossProfit)}</div>
                    </div>
                    <ResaleActions id={listing.id} status={listing.status} title={listing.title} />
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
