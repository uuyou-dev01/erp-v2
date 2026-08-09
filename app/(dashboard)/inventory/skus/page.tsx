import { requireUserContext } from "@/lib/auth/user-context";
import { getSkuCatalogList } from "@/lib/application/sku-catalog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Plus } from "lucide-react";
import Link from "next/link";
import { SKUImportButton } from "@/components/inventory/sku-import-button";
import { SkuCatalogGrid } from "@/components/inventory/sku-catalog-grid";

export const dynamic = "force-dynamic";


export default async function SKUsPage() {
  const { activeStoreId: storeId } = await requireUserContext();
  const items = await getSkuCatalogList(storeId);

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        title="商品档案"
        description="按商品组（类似 SPU）管理系列档案；规格 SKU 和独立 SKU 承接采购、库存、上架与销售。"
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

      <SkuCatalogGrid items={items} />
    </div>
  );
}
