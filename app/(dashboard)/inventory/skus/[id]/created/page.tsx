import Link from "next/link";
import { ArrowRight, CheckCircle2, Layers3, PackagePlus } from "lucide-react";
import { notFound } from "next/navigation";
import { getSKUById } from "@/app/actions/skus";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function SkuCreatedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sku = await getSKUById(id);
  if (!sku) notFound();

  const isGroup = sku.catalogRole === "GROUP";
  const isVariant = sku.catalogRole === "VARIANT";
  const parentId = sku.parentSkuId;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        className="mb-0"
        title="商品档案已保存"
        description={`${sku.name} · ${sku.code}`}
      />

      <section className="rounded-lg border bg-background">
        <div className="flex gap-3 border-b px-5 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-sm font-semibold">下一步做什么？</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isGroup
                ? "商品组不承接库存，请先创建至少一个可交易规格。"
                : "商品已经可以承接库存；如果系统启用前已有实物，可现在完成开账。"}
            </p>
          </div>
        </div>

        <div className="divide-y">
          {isGroup ? (
            <Link
              href={`/inventory/skus/new?mode=variant&parentSkuId=${sku.id}`}
              className="group flex items-start gap-4 px-5 py-5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Layers3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="font-medium">添加第一个规格</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  规格会继承商品组的品牌、分类和官方货号，只需填写具体规格信息。
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <Link
              href={`/inventory/opening-stock/new?skuIds=${sku.id}`}
              className="group flex items-start gap-4 px-5 py-5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <PackagePlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="font-medium">录入期初库存</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  选择仓库并填写现有数量、实际单位成本和币种，确认后生成正式库存流水。
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}

          {isVariant && parentId ? (
            <Link
              href={`/inventory/skus/new?mode=variant&parentSkuId=${parentId}`}
              className="group flex items-start gap-4 px-5 py-5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Layers3 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">继续添加另一个规格</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  回到同一商品组，继续录入其他尺码、颜色或容量。
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Link href="/inventory/skus">
          <Button variant="outline">返回商品档案</Button>
        </Link>
        <Link
          href={
            isVariant && parentId
              ? `/inventory/skus/${parentId}?variantId=${sku.id}`
              : `/inventory/skus/${sku.id}`
          }
        >
          <Button>查看商品详情</Button>
        </Link>
      </div>
    </div>
  );
}
