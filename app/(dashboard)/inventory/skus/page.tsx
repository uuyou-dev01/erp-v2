import { getSkuCardOverviews } from "@/app/actions/sku-card-overviews";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { SKUImportButton } from "@/components/inventory/sku-import-button";
import { SKUCardGrid } from "@/components/inventory/sku-card-grid";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function SKUsPage() {
  const products = await getSkuCardOverviews(STORE_ID);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">商品SKU</h1>
          <p className="text-muted-foreground">产品目录和定义管理</p>
        </div>
        <div className="flex items-center gap-2">
          <SKUImportButton />
          <Link href="/inventory/skus/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加SKU
            </Button>
          </Link>
        </div>
      </div>

      <SKUCardGrid products={products} />
    </div>
  );
}
