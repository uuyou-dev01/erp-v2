import { requireAuthenticatedUser } from "@/lib/auth/user-context";
import { getManagedWarehouseInventory } from "@/lib/application/warehouse-inventory";
import { WarehouseInventoryView } from "@/components/collaboration/warehouse-inventory-view";

export const dynamic = "force-dynamic";

export default async function CollaborationInventoryPage() {
  const user = await requireAuthenticatedUser();
  const warehouses = await getManagedWarehouseInventory(user.id);
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">仓库库存</h1>
      </div>
      <WarehouseInventoryView warehouses={warehouses} />
    </div>
  );
}
