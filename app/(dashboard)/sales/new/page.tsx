import { CustomerOrderForm } from "@/components/sales/customer-order-form";

const STORE_ID = "store_1";

export default function NewCustomerOrderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">新建销售订单</h1>
        <p className="text-muted-foreground">
          创建客户订单并分配库存
        </p>
      </div>

      <CustomerOrderForm storeId={STORE_ID} />
    </div>
  );
}
