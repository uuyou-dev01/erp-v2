import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemUnitForm } from "@/components/inventory/item-unit-form";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

export default function NewItemUnitPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add Item Unit</h1>
        <p className="text-muted-foreground">
          Create a new individual item (used, defective, or unique item)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Item Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemUnitForm storeId={STORE_ID} mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
