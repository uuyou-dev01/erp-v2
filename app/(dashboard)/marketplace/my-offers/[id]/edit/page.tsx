import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivePartners } from "@/app/actions/partners";
import { getSupplyOfferById, getSupplyOfferVisibilityStoreOptions } from "@/app/actions/supply-offers";
import { SupplyOfferForm } from "@/components/marketplace/supply-offer-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function EditSupplyOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [context, partners, visibilityStoreOptions, offer] = await Promise.all([
    requireUserContext(),
    getActivePartners(),
    getSupplyOfferVisibilityStoreOptions(),
    getSupplyOfferById(id),
  ]);

  if (!offer) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">编辑货盘</h1>
          <p className="text-muted-foreground">修改供给信息会同步影响市场展示；已下架货盘不能继续编辑。</p>
        </div>
        <Link href={`/marketplace/my-offers/${offer.id}`}>
          <Button variant="outline">返回详情</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>货盘信息</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplyOfferForm
            storeId={context.activeStoreId}
            partners={partners}
            visibilityStoreOptions={visibilityStoreOptions}
            initialData={offer}
          />
        </CardContent>
      </Card>
    </div>
  );
}
