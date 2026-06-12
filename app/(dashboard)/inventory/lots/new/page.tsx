import { InventoryLotForm } from "@/components/inventory/inventory-lot-form";

export const dynamic = "force-dynamic";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

export default function NewInventoryLotPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Inventory Lot</h1>
        <p className="text-muted-foreground">
          Add a new batch of inventory with automatic StockLedger tracking
        </p>
      </div>

      <InventoryLotForm storeId={STORE_ID} />
    </div>
  );
}
