import { getProductIntelligenceParentOptions } from "@/app/actions/product-intelligence";
import { ProductIntelligenceForm } from "@/components/product-intelligence/product-intelligence-form";
import { BackButton } from "@/components/shared/back-button";

export const dynamic = "force-dynamic";

export default async function NewProductIntelligencePage() {
  const parentOptions = await getProductIntelligenceParentOptions();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <BackButton label="" fallbackHref="/product-intelligence" className="mt-0.5 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">添加市场参考</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            手工补充外部商品和价格记录；不会创建库存或采购单。
          </p>
        </div>
      </div>
      <ProductIntelligenceForm parentOptions={parentOptions} />
    </div>
  );
}
