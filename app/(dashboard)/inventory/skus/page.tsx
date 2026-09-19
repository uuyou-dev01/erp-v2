import { resolveCatalogRange } from "@/lib/application/catalog-operations";
import { requireUserContext } from "@/lib/auth/user-context";
import { getSkuCatalogList } from "@/lib/application/sku-catalog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Plus } from "lucide-react";
import Link from "next/link";
import { SKUImportButton } from "@/components/inventory/sku-import-button";
import { SkuCatalogGrid } from "@/components/inventory/sku-catalog-grid";
import { ProductWorkspaceNav } from "@/components/inventory/product-workspace-nav";

export const dynamic = "force-dynamic";

export default async function SKUsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; view?: string }>;
}) {
  const params = await searchParams;
  const period = resolveCatalogRange(params);
  const context = await requireUserContext();
  const storeId = context.activeStoreId;
  const items = await getSkuCatalogList(storeId, period);

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        title="商品资料"
        description="查找商品与规格，查看当前库存和近期经营情况。"
        actions={
          <>
            <SKUImportButton storeId={storeId} />
            <Link href="/inventory/skus/new">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                新增商品
              </Button>
            </Link>
          </>
        }
      />

      <ProductWorkspaceNav active="catalog" role={context.role} />

      <SkuCatalogGrid
        items={items}
        initialView={params.view === "business" ? "business" : "stock"}
        period={{ range: period.range, from: period.from, to: period.to, error: period.error }}
      />
    </div>
  );
}
