import { getSkuCatalogList } from "@/lib/application/sku-catalog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Plus } from "lucide-react";
import Link from "next/link";
import { SKUImportButton } from "@/components/inventory/sku-import-button";
import { SkuCatalogGrid } from "@/components/inventory/sku-catalog-grid";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function SKUsPage() {
  const items = await getSkuCatalogList(STORE_ID);

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        title="商品档案"
        description="维护 SKU 主数据；上架与售出请至「可售库存」。"
        actions={
          <>
            <SKUImportButton />
            <Link href="/inventory/skus/new">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                添加 SKU
              </Button>
            </Link>
          </>
        }
      />

      <SkuCatalogGrid items={items} />
    </div>
  );
}
