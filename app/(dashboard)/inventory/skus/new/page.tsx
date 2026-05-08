import { SKUForm } from "@/components/inventory/sku-form";
import { getSKUParentOptions } from "@/app/actions/skus";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

export default async function NewSKUPage() {
  const parentOptions = await getSKUParentOptions(STORE_ID);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">新增SKU</h1>
        <p className="text-muted-foreground">
          创建新的商品主数据，补充分类、品牌、图片和属性
        </p>
      </div>

      <SKUForm storeId={STORE_ID} parentOptions={parentOptions} />
    </div>
  );
}
