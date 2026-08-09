import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageIcon, Workflow } from "lucide-react";
import { getProductIntelligenceItemById } from "@/app/actions/product-intelligence";
import { ProductIntelligenceActions } from "@/components/product-intelligence/product-intelligence-actions";
import { VisibilityBadge } from "@/components/product-intelligence/product-intelligence-status";
import { VariantMarketPanel } from "@/components/product-intelligence/variant-market-panel";
import {
  IntelligenceBusinessActions,
  type IntelligenceBusinessSku,
} from "@/components/product-intelligence/intelligence-business-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type ObservationRow = {
  id: string;
  amount: string;
  currency: string;
  priceType: string;
  sourceType: string;
  sourceName: string | null;
  platformName: string | null;
  quantity: string | null;
  confidence: string;
  visibility: string;
  observedAt: string | Date;
  note: string | null;
  conditionGrade: string | null;
  store: { id: string; name: string; code: string };
};

function buildMarketGroups(
  item: NonNullable<Awaited<ReturnType<typeof getProductIntelligenceItemById>>>,
) {
  if (item.parentItem) {
    return {
      variants: [
        {
          id: item.id,
          title: item.title,
          subtitle: [item.brand, item.category].filter(Boolean).join(" · "),
          visibility: item.visibility,
          observations: item.observations as unknown as ObservationRow[],
        },
      ],
    };
  }
  return {
    variants: item.childItems.map((child) => ({
      id: child.id,
      title: child.title,
      subtitle: [child.brand, child.category].filter(Boolean).join(" · "),
      visibility: child.visibility,
      observations: child.observations as unknown as ObservationRow[],
    })),
  };
}

export default async function ProductIntelligenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getProductIntelligenceItemById(id);
  if (!item) notFound();
  const marketGroups = buildMarketGroups(item);
  const operationalSkuRows = item.parentItem
    ? item.sku && item.sku.catalogRole !== "GROUP"
      ? [{ itemTitle: item.title, sku: item.sku }]
      : []
    : item.childItems.length > 0
      ? item.childItems
          .filter((child) => child.sku && child.sku.catalogRole !== "GROUP")
          .map((child) => ({ itemTitle: child.title, sku: child.sku! }))
      : item.sku && item.sku.catalogRole !== "GROUP"
        ? [{ itemTitle: item.title, sku: item.sku }]
        : [];
  const linkedSkus: IntelligenceBusinessSku[] = operationalSkuRows.map(({ itemTitle, sku }) => ({
    id: sku.id,
    code: sku.code,
    name: sku.name,
    label: itemTitle || sku.name,
  }));

  return (
    <div className="space-y-4">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link href="/product-intelligence" className="mt-0.5 shrink-0">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回
            </Button>
          </Link>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{item.title}</h1>
              <VisibilityBadge visibility={item.visibility} />
            </div>
            <p className="text-sm text-muted-foreground">
              {item.parentItem
                ? `归属商品组：${item.parentItem.title}`
                : item.childItems.length > 0
                  ? "商品组详情会聚合规格 SKU、成色和会员贡献的行情观察。"
                  : "当前是独立商品情报；后续可以编辑挂到商品组，或在同组下新增 SKU。"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <ProductIntelligenceActions id={item.id} isOwner={item.isOwner} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader>
              <CardTitle>商品卡片</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <div className="overflow-hidden rounded-md border bg-muted/40">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="aspect-square h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square h-full min-h-[160px] flex-col items-center justify-center gap-2 text-muted-foreground">
                      <ImageIcon className="h-8 w-8" />
                      <span className="text-xs">暂无图片</span>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    {item.parentItem ? (
                      <div>
                        <p className="text-xs text-muted-foreground">归属商品组</p>
                        <Link
                          href={`/product-intelligence/${item.parentItem.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {item.parentItem.title}
                        </Link>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs text-muted-foreground">品牌</p>
                      <p className="font-medium">{item.brand || "未填写"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">品类</p>
                      <p className="font-medium">{item.category || "未分类"}</p>
                    </div>
                    {!item.parentItem ? (
                      <div>
                        <p className="text-xs text-muted-foreground">型号/款式</p>
                        <p className="font-medium">{item.model || "未填写"}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs text-muted-foreground">贡献会员</p>
                      <p className="font-medium">{item.store.name}</p>
                    </div>
                  </div>
                  {Array.isArray(item.tags) && item.tags.filter((tag): tag is string => typeof tag === "string").length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => (
                        <span key={tag} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {item.description ? <p className="whitespace-pre-wrap text-sm leading-6">{item.description}</p> : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Workflow className="h-4 w-4" />
                业务入口
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IntelligenceBusinessActions
                itemId={item.id}
                linkedSkus={linkedSkus}
                catalogSkuId={item.skuId}
              />
            </CardContent>
          </Card>
        </div>

        {marketGroups.variants.length > 0 ? (
          <VariantMarketPanel
            parentItemId={item.parentItem?.id ?? item.id}
            activeStoreId={item.activeStoreId}
            defaultVisibility={item.visibility}
            variants={marketGroups.variants}
            allowVariantCreation={!item.parentItem}
          />
        ) : null}
      </div>
    </div>
  );
}
