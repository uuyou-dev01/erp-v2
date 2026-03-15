import { PurchaseOrderForm } from "@/components/procurement/purchase-order-form";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

export default function NewPurchaseOrderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Purchase Order</h1>
        <p className="text-muted-foreground">
          Create a new purchase order to track incoming inventory
        </p>
      </div>

      <PurchaseOrderForm storeId={STORE_ID} />
    </div>
  );
}
