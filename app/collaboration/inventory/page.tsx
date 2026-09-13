import { requireAuthenticatedUser } from "@/lib/auth/user-context";
import { getManagedWarehouseInventory } from "@/lib/application/warehouse-inventory";
import { WarehouseInventoryView } from "@/components/collaboration/warehouse-inventory-view";

export const dynamic = "force-dynamic";

export default async function CollaborationInventoryPage() {
  const user = await requireAuthenticatedUser();
  const warehouses = await getManagedWarehouseInventory(user.id);
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">仓库库存</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          查看负责仓库内的商品和实物数量，包含已成交但尚未发出的商品；已发出的在途商品不计入在仓数。发现差异可请货主盘点。
        </p>
      </div>
      <WarehouseInventoryView warehouses={warehouses} />
    </div>
  );
}
