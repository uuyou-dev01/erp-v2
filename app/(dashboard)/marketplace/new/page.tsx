import Link from "next/link";
import { getActivePartners } from "@/app/actions/partners";
import {
  getSupplyOfferFormContext,
} from "@/app/actions/supply-offers";
import { SupplyOfferForm } from "@/components/marketplace/supply-offer-form";
import { Button } from "@/components/ui/button";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function NewSupplyOfferPage() {
  const [context, partners, formContext] = await Promise.all([
    requireUserContext(),
    getActivePartners(),
    getSupplyOfferFormContext(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">发布货盘</h1>
          <p className="text-muted-foreground">
            从库存选择商品，确定供货价后即可发布；上架不会占用库存。
          </p>
        </div>
        <Link href="/marketplace/my-offers">
          <Button variant="outline">返回我的供给</Button>
        </Link>
      </div>

      <SupplyOfferForm
        storeId={context.activeStoreId}
        partners={partners}
        formContext={formContext}
      />
    </div>
  );
}
