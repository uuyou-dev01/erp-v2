import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { OpeningStockForm } from "@/components/inventory/opening-stock-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { safeInternalReturnPath } from "@/lib/application/return-navigation";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewOpeningStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    skuIds?: string;
    createdSkuId?: string;
    createdLocationId?: string;
    locationId?: string;
    returnTo?: string;
  }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { skuIds, createdSkuId, createdLocationId, locationId, returnTo } = await searchParams;
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
  const targetLocation = locationId
    ? locations.find((location) => location.id === locationId)
    : undefined;
  if (locationId && !targetLocation) notFound();
  const backHref = safeInternalReturnPath(returnTo) ?? "/inventory/opening-stock";
  const returnQuery = new URLSearchParams();
  if (skuIds) returnQuery.set("skuIds", skuIds);
  if (createdSkuId) returnQuery.set("createdSkuId", createdSkuId);
  if (createdLocationId) returnQuery.set("createdLocationId", createdLocationId);
  if (locationId) returnQuery.set("locationId", locationId);
  if (returnTo) returnQuery.set("returnTo", backHref);
  const prerequisiteReturnTo = `/inventory/opening-stock/new${
    returnQuery.size > 0 ? `?${returnQuery.toString()}` : ""
  }`;
  const presetSkuIds = [...(skuIds ?? "").split(","), createdSkuId ?? ""].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" className="mt-0.5" aria-label="返回上一页">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="mb-0 flex-1"
          title={targetLocation ? `录入已有库存 · ${targetLocation.name}` : "录入已有库存"}
          description="把开始使用系统前已经存在的库存录入系统；这不是采购入库。"
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
        presetSkuIds={presetSkuIds}
        createdSkuId={createdSkuId}
        createdLocationId={createdLocationId}
        fixedLocationId={targetLocation?.id}
        returnTo={backHref}
        locationCreateReturnTo={prerequisiteReturnTo}
        skuCreateReturnTo={prerequisiteReturnTo}
      />
    </div>
  );
}
