import { requireUserContext } from "@/lib/auth/user-context";
import { CustomerOrderForm } from "@/components/sales/customer-order-form";
import { BackButton } from "@/components/shared/back-button";

export const dynamic = "force-dynamic";

export default async function NewCustomerOrderPage() {
  const { activeStoreId: storeId } = await requireUserContext();
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BackButton label="" fallbackHref="/sales" className="mt-0.5 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold">新建销售订单</h1>
          <p className="text-muted-foreground">创建客户订单并分配库存</p>
        </div>
      </div>

      <CustomerOrderForm storeId={storeId} />
    </div>
  );
}
