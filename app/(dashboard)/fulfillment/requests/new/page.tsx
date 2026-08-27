import Link from "next/link";
import { notFound } from "next/navigation";
import { getResaleListingById } from "@/app/actions/resale-listings";
import { getSupplyOfferById } from "@/app/actions/supply-offers";
import { FulfillmentRequestForm } from "@/components/fulfillment/fulfillment-request-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function NewFulfillmentRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ resaleListingId?: string }>;
}) {
  const params = await searchParams;
  if (!params.resaleListingId) notFound();

  const context = await requireUserContext();
  const resaleListing = await getResaleListingById(params.resaleListingId, context.activeStoreId);
  if (!resaleListing) notFound();
  const liveSupplyOffer = await getSupplyOfferById(
    resaleListing.supplyOfferId,
    context.activeStoreId
  );
  if (!liveSupplyOffer) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">登记售出并创建履约</h1>
          <p className="text-muted-foreground">
            登记代卖销售订单，并向供给方或代发方发起发货请求。
          </p>
        </div>
        <Link href={`/resale/${resaleListing.id}`}>
          <Button variant="outline">返回代卖</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>履约信息</CardTitle>
        </CardHeader>
        <CardContent>
          <FulfillmentRequestForm
            storeId={context.activeStoreId}
            resaleListing={resaleListing}
            liveSupplyOffer={liveSupplyOffer}
          />
        </CardContent>
      </Card>
    </div>
  );
}
