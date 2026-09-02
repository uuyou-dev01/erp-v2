import { requireUserContext } from "@/lib/auth/user-context";
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
import { formatQuantity } from "@/lib/decimal";
import Decimal from "decimal.js";

export const dynamic = "force-dynamic";

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

function MissingInfoValue() {
  return <span className="font-normal text-muted-foreground">未填写</span>;
}

type DetailView = "overview" | "inventory" | "sales" | "records" | "market";

const DETAIL_VIEWS: Array<{ id: DetailView; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "inventory", label: "库存与上架" },
  { id: "sales", label: "动销分析" },
  { id: "records", label: "业务流水" },
  { id: "market", label: "市场参考" },
];

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

function inventoryIdentitySummary(sku: SkuCatalogDetail) {
  const newStockQty = sku.inventorySections.newStockLots.reduce(
    (sum, lot) => sum.plus(lot.quantity),
    new Decimal(0)
  );
  return `全新 ${formatQuantity(newStockQty.toString())} · 单件 ${sku.inventorySections.itemUnitSummary.totalCount}`;
}

export default async function SKUDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    returnTo?: string;
    edit?: string;
    variantId?: string;
    view?: string;
  }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { id } = await params;
  const { returnTo, edit, variantId, view } = await searchParams;
  const sku = await getSkuCatalogDetail(id);

  if (!sku) {
    notFound();
  }

  const isProductGroup =
    sku.catalogRole === "GROUP" || (!sku.parentSkuId && sku.childSkus.length > 0);
  const childDetails = isProductGroup
    ? (await Promise.all(sku.childSkus.map((child) => getSkuCatalogDetail(child.id)))).filter(
        (child): child is SkuCatalogDetail => Boolean(child)
      )
    : [];
  const selectedVariant = variantId
    ? (childDetails.find((child) => child.id === variantId) ?? null)
    : null;
  const displaySku = selectedVariant ?? sku;
  const isViewingChildFromParent = Boolean(selectedVariant);
  const sharedCatalogSku = isViewingChildFromParent ? sku : displaySku;
  const activeView: DetailView = DETAIL_VIEWS.some((item) => item.id === view)
    ? (view as DetailView)
    : "overview";

  const parentOptions = await getSKUParentOptions(storeId, displaySku.id);
  const variantEntries = Object.entries(displaySku.variantAttributes);
  const images = displaySku.meta.images ?? [];
  const returnHref = safeReturnPath(returnTo, "/inventory/skus");
  const actionReturnHref = isViewingChildFromParent ? `/inventory/skus/${sku.id}` : returnHref;
  const ownCoverUrl = images.find((i) => i.isCover)?.url ?? images[0]?.url ?? displaySku.imageUrl;
  const groupImages = isViewingChildFromParent ? (sku.meta.images ?? []) : [];
  const groupCoverUrl = isViewingChildFromParent
    ? (groupImages.find((image) => image.isCover)?.url ?? groupImages[0]?.url ?? sku.imageUrl)
    : null;
  const intelligenceCoverUrl = displaySku.intelligence.recentMarketObservations.find(
    (observation) => observation.imageUrl
  )?.imageUrl;
  const coverUrl = ownCoverUrl ?? groupCoverUrl ?? intelligenceCoverUrl;
  const isUsingGroupImage = Boolean(isViewingChildFromParent && !ownCoverUrl && groupCoverUrl);
  const imageScopeLabel = isViewingChildFromParent
    ? ownCoverUrl
      ? "变体图"
      : groupCoverUrl
        ? "商品组图"
        : intelligenceCoverUrl
          ? "来源图"
          : "暂无图片"
    : isProductGroup
      ? "商品组图"
      : intelligenceCoverUrl && !ownCoverUrl
        ? "来源图"
        : "SKU 图";
  const selectedVariantName = isViewingChildFromParent ? variantDisplayName(sku, displaySku) : null;
  const variantHref = (childId: string) => {
    const query = new URLSearchParams({ variantId: childId });
    if (returnTo) query.set("returnTo", returnTo);
    if (activeView !== "overview") query.set("view", activeView);
    return `/inventory/skus/${sku.id}?${query.toString()}`;
  };
  const viewHref = (nextView: DetailView) => {
    const query = new URLSearchParams();
    if (variantId) query.set("variantId", variantId);
    if (returnTo) query.set("returnTo", returnTo);
    if (nextView !== "overview") query.set("view", nextView);
    const queryString = query.toString();
    return `/inventory/skus/${sku.id}${queryString ? `?${queryString}` : ""}`;
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
            meta: inventoryIdentitySummary(child),
          })),
          selectedAttributes: isViewingChildFromParent
            ? variantEntries.map(([label, value]) => ({
                label,
                value: String(value),
              }))
            : [],
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
          <div className="shrink-0">
            <ProductImage src={coverUrl} alt={displaySku.name} size="md" className="rounded-lg" />
            <p className="mt-1 text-center text-[9px] leading-none text-muted-foreground">
              {imageScopeLabel}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={`text-[10px] ${selectedVariantName ? "" : "font-mono"}`}
              >
                {selectedVariantName ? `变体：${selectedVariantName}` : displaySku.code}
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
              {displaySku.brand ? <Badge className="text-[10px]">{displaySku.brand}</Badge> : null}
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
            {isViewingChildFromParent ? (
              <p
                className={`mt-1 text-[11px] ${
                  isUsingGroupImage ? "text-amber-700" : "text-muted-foreground"
                }`}
              >
                {ownCoverUrl
                  ? "当前显示该变体自己的图片"
                  : isUsingGroupImage
                    ? "当前变体未设置图片，正在沿用商品组主图"
                    : "当前变体和商品组均未设置图片"}
              </p>
            ) : null}
          </div>
        </div>
        <SKUDetailActions
          storeId={storeId}
          returnHref={actionReturnHref}
          initialEditOpen={edit === "1"}
          groupImageEditHref={
            displaySku.catalogRole === "VARIANT" && displaySku.parentSku
              ? `/inventory/skus/${displaySku.parentSku.id}?edit=1`
              : undefined
          }
          structureSku={{
            id: sku.id,
            code: sku.code,
            name: sku.name,
            catalogRole: sku.catalogRole,
            parentSkuId: sku.parentSkuId,
            variantLabel: sku.variantLabel,
            childSkus: sku.childSkus,
          }}
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
            categoryId: displaySku.categoryId,
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

      {variantFilter ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2">
          <span className="mr-1 text-xs font-medium text-muted-foreground">查看规格</span>
          {variantFilter.options.map((option) => (
            <Link
              key={option.id}
              href={option.href}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                option.selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              <span className="font-medium">{option.label}</span>
              <span
                className={`ml-1 ${
                  option.selected ? "text-primary-foreground/75" : "text-muted-foreground"
                }`}
              >
                {option.meta}
              </span>
            </Link>
          ))}
          {variantFilter.addHref ? (
            <Link
              href={variantFilter.addHref}
              className="rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-muted"
            >
              + 新增规格
            </Link>
          ) : null}
        </div>
      ) : null}

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="商品详情视图">
        {DETAIL_VIEWS.map((item) => {
          const count =
            item.id === "inventory"
              ? displaySku.inventorySections.newStockLots.length +
                displaySku.inventorySections.itemUnitSummary.totalCount
              : item.id === "sales"
                ? displaySku.analysis.activeListings.length
                : item.id === "records"
                  ? displaySku.reference.salesLineCount + displaySku.reference.purchaseLineCount
                  : item.id === "market"
                    ? displaySku.intelligence.marketObservationCount
                    : null;
          return (
            <Link
              key={item.id}
              href={viewHref(item.id)}
              aria-current={activeView === item.id ? "page" : undefined}
              className={`relative shrink-0 px-3 py-2 text-sm font-medium transition-colors ${
                activeView === item.id
                  ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
              {count !== null ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {activeView === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">商品档案</CardTitle>
                <p className="text-xs text-muted-foreground">
                  稳定的商品身份信息；价格、库存与成交数据在下方经营摘要中统一查看。
                </p>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {images.length > 1 ? (
                  <details className="border-b pb-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      查看全部图片（{images.length}）
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {images.map((img) => (
                        <div key={img.url} className="relative overflow-hidden rounded-md border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt="" className="h-16 w-16 object-cover" />
                          {img.isCover ? (
                            <Badge className="absolute left-1 top-1 px-1 text-[9px]">封面</Badge>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoCell
                    label="系列"
                    value={
                      displaySku.series ||
                      displaySku.meta.series ||
                      sharedCatalogSku.series ||
                      sharedCatalogSku.meta.series || <MissingInfoValue />
                    }
                  />
                  <InfoCell
                    label="厂商货号"
                    value={
                      displaySku.manufacturerCode ||
                      sharedCatalogSku.manufacturerCode || <MissingInfoValue />
                    }
                  />
                  <InfoCell
                    label="商品条码"
                    value={
                      displaySku.meta.barcode ||
                      sharedCatalogSku.meta.barcode || <MissingInfoValue />
                    }
                  />
                  <InfoCell
                    label="标签"
                    value={
                      displaySku.meta.tags?.length ? (
                        displaySku.meta.tags.join("、")
                      ) : sharedCatalogSku.meta.tags?.length ? (
                        sharedCatalogSku.meta.tags.join("、")
                      ) : (
                        <MissingInfoValue />
                      )
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
      ) : null}

      {activeView === "market" ? (
        <div className="max-w-3xl">
          <SKUReferencePanel sku={displaySku} />
        </div>
      ) : null}

      {activeView !== "market" ? (
        <SkuOperationsPanel sku={displaySku} section={activeView} />
      ) : null}
    </div>
  );
}
