import { getProductCategoryManagementData } from "@/app/actions/categories";
import { ProductCategoryManager } from "@/components/inventory/product-category-manager";

export const dynamic = "force-dynamic";

export default async function ProductCategoriesPage() {
  const { categories } = await getProductCategoryManagementData();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">商品分类</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            系统标准品类用于跨店铺统计与未来公共货盘；企业品类用于你们自己的命名和细分习惯。
          </p>
        </div>
        <p className="text-xs text-muted-foreground">当前共 {categories.length} 个可见节点</p>
      </div>
      <ProductCategoryManager categories={categories} />
    </div>
  );
}
