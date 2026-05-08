import { PurchaseWizard } from "@/components/procurement/purchase-wizard";

const STORE_ID = "store_1";

export default function NewPurchaseOrderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">新建采购订单</h1>
        <p className="text-muted-foreground">
          按步骤创建采购订单并添加商品
        </p>
      </div>

      <PurchaseWizard storeId={STORE_ID} />
    </div>
  );
}
