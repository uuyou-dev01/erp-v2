import { getSKUs } from "@/app/actions/skus";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { SKUImportButton } from "@/components/inventory/sku-import-button";
import { SKUManagementTable } from "@/components/inventory/sku-management-table";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function SKUsPage() {
  const skus = await getSKUs(STORE_ID);

  const categories = [
    ...new Set(skus.map((s) => s.category).filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const brands = [
    ...new Set(skus.map((s) => s.brand).filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
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

      <SKUManagementTable skus={skus} categories={categories} brands={brands} />
    </div>
  );
}
