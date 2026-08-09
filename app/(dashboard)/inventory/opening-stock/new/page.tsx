import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { OpeningStockForm } from "@/components/inventory/opening-stock-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function NewOpeningStockPage({
  searchParams,
}: {
  searchParams: Promise<{ skuIds?: string }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { skuIds } = await searchParams;
  const [store, skus, locations] = await Promise.all([
    prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { currency: true },
    }),
    prisma.sKU.findMany({
      where: {
        storeId,
        catalogRole: { not: "GROUP" },
      },
      select: {
        id: true,
        code: true,
        name: true,
        catalogRole: true,
        parentSku: { select: { name: true } },
      },
      orderBy: [{ parentSkuId: "asc" }, { name: "asc" }],
    }),
    prisma.location.findMany({
      where: { storeId },
      select: { id: true, code: true, name: true, region: true },
      orderBy: [{ isSellableDefault: "desc" }, { name: "asc" }],
    }),
  ]);
  const defaultDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link href="/inventory/opening-stock">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5"
            aria-label="返回期初库存"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="mb-0 flex-1"
          title="录入期初库存"
          description="把系统启用前已经存在的真实库存，按商品、仓库、数量和成本正式开账。"
        />
      </div>

      <OpeningStockForm
        storeId={storeId}
        defaultCurrency={store.currency}
        defaultDate={defaultDate}
        skus={skus.map((sku) => ({
          id: sku.id,
          code: sku.code,
          name: sku.name,
          catalogRole: sku.catalogRole,
          parentName: sku.parentSku?.name ?? null,
        }))}
        locations={locations}
        presetSkuIds={(skuIds ?? "").split(",").filter(Boolean)}
      />
    </div>
  );
}
