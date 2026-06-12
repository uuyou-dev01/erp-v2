import { SKUForm } from "@/components/inventory/sku-form";
import { getSKUParentOptions } from "@/app/actions/skus";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function NewSKUPage() {
  const parentOptions = await getSKUParentOptions(STORE_ID);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link href="/inventory/skus">
          <Button variant="ghost" size="icon" className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="mb-0 flex-1"
          title="新增 SKU"
          description="创建商品主数据；保存后进入详情页。"
        />
      </div>

      <SKUForm storeId={STORE_ID} parentOptions={parentOptions} />
    </div>
  );
}
