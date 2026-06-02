import { listSkuLocationStocktakeRows } from "@/app/actions/stocktake";
import { StocktakeGrid } from "@/components/inventory/stocktake-grid";
import { StocktakeToolbar } from "@/components/inventory/stocktake-toolbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function InventoryStocktakePage({
  searchParams,
}: {
  searchParams: Promise<{
    locationId?: string;
    q?: string;
    onlyDiff?: string;
  }>;
}) {
  const params = await searchParams;
  const [rows, locations] = await Promise.all([
    listSkuLocationStocktakeRows({
      storeId: STORE_ID,
      locationId: params.locationId,
      q: params.q,
    }),
    prisma.location.findMany({
      where: { storeId: STORE_ID },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }],
    }),
  ]);

  const totalBookQty = rows.reduce((sum, row) => sum + row.bookQty, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">库存盘点</h1>
        <p className="text-muted-foreground">
          按 SKU 和仓位录入实盘数量，确认后写入 ADJUST 流水调整库存。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">SKU 行数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
            <p className="text-xs text-muted-foreground">当前筛选结果</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">账面总件数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBookQty}</div>
            <p className="text-xs text-muted-foreground">整数汇总，来自 StockLedger</p>
          </CardContent>
        </Card>
      </div>

      <StocktakeToolbar
        locations={locations}
        activeLocationId={params.locationId}
        query={params.q}
        onlyDiff={params.onlyDiff === "1"}
      />

      <StocktakeGrid storeId={STORE_ID} rows={rows} onlyDiff={params.onlyDiff === "1"} />
    </div>
  );
}
