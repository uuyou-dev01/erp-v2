import Link from "next/link";
import { getActivePartners } from "@/app/actions/partners";
import { getSupplyOfferVisibilityStoreOptions } from "@/app/actions/supply-offers";
import { SupplyOfferForm } from "@/components/marketplace/supply-offer-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function NewSupplyOfferPage() {
  const [context, partners, visibilityStoreOptions] = await Promise.all([
    requireUserContext(),
    getActivePartners(),
    getSupplyOfferVisibilityStoreOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">发布货盘</h1>
          <p className="text-muted-foreground">先创建草稿，确认明细、可见性和履约方式后再发布。</p>
        </div>
        <Link href="/marketplace/my-offers">
          <Button variant="outline">返回我的供给</Button>
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
