import { CustomerOrderForm } from "@/components/sales/customer-order-form";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

export default function NewCustomerOrderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Customer Order</h1>
        <p className="text-muted-foreground">
          Create a new sales order and allocate inventory
        </p>
      </div>

      <CustomerOrderForm storeId={STORE_ID} />
    </div>
  );
}
