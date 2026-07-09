import { getSKUParentOptions } from "@/app/actions/skus";
import {
  catalogStatusLabel,
  getSkuCatalogDetail,
  type SkuCatalogDetail,
} from "@/lib/application/sku-catalog";
import { SKUDetailActions } from "@/components/inventory/sku-detail-actions";
import { SkuOperationsPanel } from "@/components/inventory/sku-operations-panel";
import { SKUReferencePanel } from "@/components/inventory/sku-reference-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ui/product-image";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/decimal";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

function safeReturnPath(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

function wordParts(value: string) {
  return value
    .replace(/[·・|/：:()（）]/g, " ")
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function variantDisplayName(parent: SkuCatalogDetail, child: SkuCatalogDetail) {
  if (child.variantLabel) return child.variantLabel;

  const raw = child.name.trim();
  const prefixes = [parent.name, parent.series, parent.meta.series]
    .filter((item): item is string => Boolean(item?.trim()))
    .sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (!raw.startsWith(prefix) || raw.length <= prefix.length) continue;
    const stripped = raw
      .slice(prefix.length)
      .replace(/^[\s·・\-_:：|/]+/, "")
      .trim();
    if (stripped) return stripped;
  }

  const rawWords = wordParts(raw);
  const parentWords = wordParts(parent.name);
  let commonCount = 0;
  while (
    commonCount < rawWords.length &&
    commonCount < parentWords.length &&
    rawWords[commonCount].toLowerCase() === parentWords[commonCount].toLowerCase()
  ) {
    commonCount += 1;
  }
  if (commonCount >= 2 && commonCount < rawWords.length) {
    return rawWords.slice(commonCount).join(" ");
  }

  const variantValues = Object.entries(child.variantAttributes)
    .filter(([key, value]) => {
      const normalized = `${key}:${String(value)}`.toLowerCase();
      return !/(condition|品相|状态|new|全新)/.test(normalized);
    })
    .map(([, value]) => String(value).trim())
    .filter(Boolean);
  if (variantValues.length > 0) return variantValues.slice(0, 2).join(" / ");

  return raw;
}

export default async function SKUDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; edit?: string; variantId?: string }>;
}) {
  const { id } = await params;
  const { returnTo, edit, variantId } = await searchParams;
  const sku = await getSkuCatalogDetail(id);

  if (!sku) {
    notFound();
  }

  const isProductGroup = sku.catalogRole === "GROUP" || (!sku.parentSkuId && sku.childSkus.length > 0);
  const childDetails = isProductGroup
    ? (
        await Promise.all(sku.childSkus.map((child) => getSkuCatalogDetail(child.id)))
      ).filter((child): child is SkuCatalogDetail => Boolean(child))
    : [];
  const selectedVariant =
    childDetails.find((child) => child.id === variantId) ?? childDetails[0] ?? null;
  const displaySku = selectedVariant ?? sku;
  const isViewingChildFromParent = Boolean(selectedVariant);

  const parentOptions = await getSKUParentOptions(STORE_ID, displaySku.id);
  const variantEntries = Object.entries(displaySku.variantAttributes);
  const images = displaySku.meta.images ?? [];
  const returnHref = safeReturnPath(returnTo, "/inventory/skus");
  const actionReturnHref = isViewingChildFromParent
    ? `/inventory/skus/${sku.id}`
    : returnHref;
  const coverUrl =
    images.find((i) => i.isCover)?.url ?? images[0]?.url ?? displaySku.imageUrl;
  const selectedVariantName = isViewingChildFromParent
    ? variantDisplayName(sku, displaySku)
    : null;
  const variantHref = (childId: string) => {
    const query = new URLSearchParams({ variantId: childId });
    if (returnTo) query.set("returnTo", returnTo);
    return `/inventory/skus/${sku.id}?${query.toString()}`;
  };
  const variantFilter =
    isProductGroup && childDetails.length > 0
      ? {
          label: sku.name,
          addHref: `/inventory/skus/new?mode=variant&parentSkuId=${sku.id}`,
          options: childDetails.map((child) => ({
            id: child.id,
            label: variantDisplayName(sku, child),
            href: variantHref(child.id),
            selected: child.id === displaySku.id,
            meta: child.business.averageSalePrice
              ? formatCurrency(
                  child.business.averageSalePrice,
                  child.business.salesCurrency ?? child.currency ?? "CNY"
                )
              : `${child.business.salesCount}笔`,
          })),
          selectedAttributes: variantEntries.map(([label, value]) => ({
            label,
            value: String(value),
          })),
        }
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Link href={returnHref} className="shrink-0">
            <Button variant="ghost" size="icon" className="mt-0.5 h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <ProductImage
            src={coverUrl}
            alt={displaySku.name}
            size="md"
            className="shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  selectedVariantName ? "" : "font-mono"
                }`}
              >
                {selectedVariantName
                  ? `变体：${selectedVariantName}`
                  : displaySku.code}
              </Badge>
              <Badge
                variant={displaySku.catalogStatus === "active" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {catalogStatusLabel(displaySku.catalogStatus)}
              </Badge>
              {isViewingChildFromParent ? (
                <Badge variant="secondary" className="text-[10px]">
                  当前变体
                </Badge>
              ) : null}
              {displaySku.category ? (
                <Badge variant="secondary" className="text-[10px]">
                  {displaySku.category}
                </Badge>
              ) : null}
              {displaySku.brand ? (
                <Badge className="text-[10px]">{displaySku.brand}</Badge>
              ) : null}
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight">
              {isViewingChildFromParent ? sku.name : displaySku.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedVariantName ? `当前变体：${selectedVariantName} · ` : ""}
              {isProductGroup
                ? "商品组档案 · 选择规格查看采购、库存、上架与成交"
                : "SKU 商业档案 · 价格、采购均价、成交记录与利润表现"}
            </p>
          </div>
        </div>
        <SKUDetailActions
          storeId={STORE_ID}
          returnHref={actionReturnHref}
          initialEditOpen={edit === "1"}
          sku={{
            id: displaySku.id,
            code: displaySku.code,
            name: displaySku.name,
            catalogRole: displaySku.catalogRole,
            manufacturerCode: displaySku.manufacturerCode,
            variantLabel: displaySku.variantLabel,
            variantAxes: displaySku.variantAxes,
            variantValues: displaySku.variantValues,
            nameSource: displaySku.nameSource,
            codeSource: displaySku.codeSource,
            category: displaySku.category,
            brand: displaySku.brand,
            attributes: {
              ...displaySku.variantAttributes,
              catalogStatus: displaySku.meta.catalogStatus,
              productKind: displaySku.meta.productKind,
              referencePrice: displaySku.meta.referencePrice,
              referenceCost: displaySku.meta.referenceCost,
              currency: displaySku.meta.currency,
              tags: displaySku.meta.tags,
              series: displaySku.meta.series,
              notes: displaySku.meta.notes,
              images: displaySku.meta.images,
              newFields: displaySku.meta.newFields,
              usedFields: displaySku.meta.usedFields,
            },
            description: displaySku.description,
            imageUrl: displaySku.imageUrl,
            parentSkuId: displaySku.parentSkuId,
          }}
          parentOptions={parentOptions}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">基础信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {images.length > 1 ? (
                <div className="flex flex-wrap gap-2 border-b pb-3">
                  {images.map((img) => (
                    <div
                      key={img.url}
                      className="relative overflow-hidden rounded-md border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="h-16 w-16 object-cover" />
                      {img.isCover ? (
                        <Badge className="absolute left-1 top-1 px-1 text-[9px]">
                          封面
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <InfoCell
                  label="系列"
                  value={displaySku.series || displaySku.meta.series || "—"}
                />
                <InfoCell
                  label="参考售价"
                  value={
                    displaySku.referencePrice
                      ? formatCurrency(
                          displaySku.referencePrice,
                          displaySku.currency ?? "CNY"
                        )
                      : "—"
                  }
                />
                <InfoCell
                  label="参考成本"
                  value={
                    displaySku.meta.referenceCost
                      ? formatCurrency(
                          displaySku.meta.referenceCost,
                          displaySku.currency ?? "CNY"
                        )
                      : "—"
                  }
                />
                <InfoCell
                  label="标签"
                  value={
                    displaySku.meta.tags?.length ? displaySku.meta.tags.join("、") : "—"
                  }
                />
              </dl>
              {displaySku.description ? (
                <InfoCell label="描述" value={displaySku.description} />
              ) : null}
              {displaySku.meta.notes ? (
                <InfoCell label="备注" value={displaySku.meta.notes} />
              ) : null}
            </CardContent>
          </Card>

        </div>

        <div className="space-y-4">
          <SKUReferencePanel sku={displaySku} compact />
        </div>
      </div>

      <SkuOperationsPanel sku={displaySku} variantFilter={variantFilter} />
    </div>
  );
}
