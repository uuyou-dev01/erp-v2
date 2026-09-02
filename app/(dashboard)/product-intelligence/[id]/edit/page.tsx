import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getProductIntelligenceItemById,
  getProductIntelligenceParentOptions,
} from "@/app/actions/product-intelligence";
import { ProductIntelligenceForm } from "@/components/product-intelligence/product-intelligence-form";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function EditProductIntelligencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [item, parentOptions] = await Promise.all([
    getProductIntelligenceItemById(id),
    getProductIntelligenceParentOptions(),
  ]);
  if (!item || !item.isOwner) notFound();
  const selectableParents = parentOptions.filter((parent) => parent.id !== item.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="编辑市场参考"
        description="只编辑来源商品信息；价格记录请在详情页追加。"
        actions={
          <Link href={`/product-intelligence/${item.id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回
            </Button>
          </Link>
        }
      />
      <ProductIntelligenceForm initialData={item} parentOptions={selectableParents} />
    </div>
  );
}
