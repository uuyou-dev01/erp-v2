import { SKUForm } from "@/components/inventory/sku-form";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

export default function NewSKUPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New SKU</h1>
        <p className="text-muted-foreground">
          Add a new product to your catalog
        </p>
      </div>

      <SKUForm storeId={STORE_ID} />
    </div>
  );
}
