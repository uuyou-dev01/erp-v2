import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { prisma } from "@/lib/prisma";
import {
  listSkuLocationStocktakeRows,
  listTransferableInventoryRows,
} from "@/app/actions/stocktake";
import { MobilePage, MobileEntry } from "@/components/mobile/mobile-page";
import { MobileInventory } from "@/components/mobile/mobile-inventory";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; locationId?: string }>;
}) {
  const { activeStoreId: storeId } = await requireMobilePageContext("/m/inventory");
  const { q, locationId } = await searchParams;
  const [rows, transferRows, locations, skus, store] = await Promise.all([
    listSkuLocationStocktakeRows({ storeId, q, locationId }),
    listTransferableInventoryRows({ storeId, q, locationId }),
    prisma.location.findMany({ where: { storeId }, select: { id: true, code: true, name: true } }),
    prisma.sKU.findMany({
      where: { storeId, catalogRole: { not: "GROUP" }, childSkus: { none: {} } },
      select: { id: true, code: true, name: true },
    }),
    prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { currency: true } }),
  ]);
  return (
    <MobilePage title="库存" description="按仓库核对实物；盘点调整会保留库存流水。">
      <form className="flex flex-wrap gap-2">
        <input
          aria-label="搜索库存"
          name="q"
          defaultValue={q}
          placeholder="商品名或 SKU"
          className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
        />
        <select
          aria-label="仓库"
          name="locationId"
          defaultValue={locationId ?? ""}
          className="h-11 max-w-full rounded-xl border px-2 text-sm"
        >
          <option value="">全部仓库</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-xl bg-blue-600 px-4 text-sm text-white">查询</button>
      </form>
      <MobileInventory
        storeId={storeId}
        rows={rows}
        transferRows={transferRows}
        locations={locations}
        skus={skus}
        defaultCurrency={store.currency}
      />
      <MobileEntry
        href="/m/items"
        title="单件实物与照片"
        description="一物一单商品请按实物管理，不在批量盘点中直接改数量。"
      />
    </MobilePage>
  );
}
