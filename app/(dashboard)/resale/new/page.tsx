import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatforms } from "@/app/actions/platforms";
import { getSupplyOfferById } from "@/app/actions/supply-offers";
import { ResaleListingForm } from "@/components/resale/resale-listing-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function NewResaleListingPage({
  searchParams,
}: {
  searchParams: Promise<{ supplyOfferId?: string }>;
}) {
  const params = await searchParams;
  if (!params.supplyOfferId) notFound();

  const context = await requireUserContext();
  const [offer, platforms] = await Promise.all([
    getSupplyOfferById(params.supplyOfferId),
    getPlatforms(context.activeStoreId),
  ]);
  if (!offer || offer.status !== "PUBLISHED") notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">创建代卖上架</h1>
          <p className="text-muted-foreground">从可见货盘创建本店平台销售记录，暂不改变库存归属。</p>
        </div>
        <Link href={`/marketplace/${offer.id}`}>
          <Button variant="outline">返回货盘</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>代卖信息</CardTitle>
        </CardHeader>
        <CardContent>
          {platforms.length === 0 ? (
            <div className="rounded-md border border-border/60 p-6 text-sm text-muted-foreground">
              需要先维护销售平台后才能创建代卖上架。
              <Link href="/listing/platforms/new" className="ml-2 text-primary hover:underline">
                添加平台
              </Link>
            </div>
          ) : (
            <ResaleListingForm storeId={context.activeStoreId} platforms={platforms} supplyOffer={offer} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
