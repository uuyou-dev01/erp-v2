import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatforms } from "@/app/actions/platforms";
import { getResaleListingById } from "@/app/actions/resale-listings";
import { ResaleListingForm } from "@/components/resale/resale-listing-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function EditResaleListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireUserContext();
  const [listing, platforms] = await Promise.all([
    getResaleListingById(id),
    getPlatforms(context.activeStoreId),
  ]);
  if (!listing) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">编辑代卖上架</h1>
          <p className="text-muted-foreground">调整平台、售价、费用假设和外部上架编号。</p>
        </div>
        <Link href={`/resale/${listing.id}`}>
          <Button variant="outline">返回详情</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>代卖信息</CardTitle>
        </CardHeader>
        <CardContent>
          <ResaleListingForm storeId={context.activeStoreId} platforms={platforms} initialData={listing} />
        </CardContent>
      </Card>
    </div>
  );
}
