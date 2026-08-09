import { requireUserContext } from "@/lib/auth/user-context";
import { PurchaseWizard } from "@/components/procurement/purchase-wizard";
import { BackButton } from "@/components/shared/back-button";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ skuId?: string }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { skuId } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BackButton label="" fallbackHref="/procurement" className="mt-0.5 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold">新建采购订单</h1>
          <p className="text-muted-foreground">
            {skuId ? "已从商品情报预选 SKU，完成基本信息后确认采购数量与成本" : "按步骤创建采购订单并添加商品"}
          </p>
        </div>
      </div>

      <PurchaseWizard storeId={storeId} initialSkuId={skuId} />
    </div>
  );
}
