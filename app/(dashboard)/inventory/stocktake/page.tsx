import { requireUserContext } from "@/lib/auth/user-context";
import {
  listSkuLocationStocktakeRows,
  listTransferableInventoryRows,
} from "@/app/actions/stocktake";
import { StocktakeGrid } from "@/components/inventory/stocktake-grid";
import { StocktakeToolbar } from "@/components/inventory/stocktake-toolbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InventoryStocktakePage({
  searchParams,
}: {
  searchParams: Promise<{
    locationId?: string;
    q?: string;
    onlyDiff?: string;
    action?: string;
  }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const params = await searchParams;
  const [rows, transferRows, locations, skus, store, lotStockLocations, unitStockLocations] =
    await Promise.all([
      listSkuLocationStocktakeRows({
        storeId: storeId,
        locationId: params.locationId,
        q: params.q,
      }),
      listTransferableInventoryRows({
        storeId,
        locationId: params.locationId,
        q: params.q,
      }),
      prisma.location.findMany({
        where: { storeId: storeId },
        select: { id: true, code: true, name: true },
        orderBy: [{ code: "asc" }],
      }),
      prisma.sKU.findMany({
        where: {
          storeId,
          catalogRole: { not: "GROUP" },
          childSkus: { none: {} },
        },
        select: { id: true, code: true, name: true },
        orderBy: [{ code: "asc" }],
      }),
      prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { currency: true },
      }),
      prisma.inventoryLot.findMany({
        where: { storeId, status: "ACTIVE" },
        select: { skuId: true, locationId: true },
        distinct: ["skuId", "locationId"],
      }),
      prisma.itemUnit.findMany({
        where: {
          storeId,
          status: { in: ["AVAILABLE", "CONSOLIDATING", "ALLOCATED", "RETURN_CHECK"] },
        },
        select: { skuId: true, locationId: true },
        distinct: ["skuId", "locationId"],
      }),
    ]);
  const existingStockLocations = [
    ...lotStockLocations,
    ...unitStockLocations.filter(
      (unit) =>
        !lotStockLocations.some(
          (lot) => lot.skuId === unit.skuId && lot.locationId === unit.locationId
        )
    ),
  ];

  const totalTransferableQty = transferRows.reduce((sum, row) => sum + row.bookQty, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">库存维护</h1>
        <p className="text-muted-foreground">
          修正现有账面数量，也可为 SKU 录入其他仓库库存或发起仓间调拨。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">可调整的批量库存</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
            <p className="text-xs text-muted-foreground">
              按 SKU 与仓位汇总；单件商品不在此直接改数量
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">可发起转仓件数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransferableQty}</div>
            <p className="text-xs text-muted-foreground">
              包括批量库存和未被订单占用的一物一单商品
            </p>
          </CardContent>
        </Card>
      </div>

      <StocktakeToolbar
        locations={locations}
        activeLocationId={params.locationId}
        query={params.q}
        onlyDiff={params.onlyDiff === "1"}
      />

      <StocktakeGrid
        storeId={storeId}
        rows={rows}
        transferRows={transferRows}
        locations={locations}
        skus={skus}
        existingStockLocations={existingStockLocations}
        defaultCurrency={store.currency}
        onlyDiff={params.onlyDiff === "1"}
        defaultMaintenanceMode={params.action === "transfer" ? "TRANSFER" : undefined}
      />
    </div>
  );
}
