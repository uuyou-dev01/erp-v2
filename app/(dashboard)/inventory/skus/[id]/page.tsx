import { getSKUParentOptions } from "@/app/actions/skus";
import { getSkuCatalogDetail } from "@/lib/application/sku-catalog";
import {
  catalogStatusLabel,
  productKindLabel,
} from "@/lib/application/sku-catalog";
import { SKUDetailActions } from "@/components/inventory/sku-detail-actions";
import { SKUReferencePanel } from "@/components/inventory/sku-reference-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ui/product-image";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { GitBranch } from "lucide-react";
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

export default async function SKUDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { returnTo, edit } = await searchParams;
  const sku = await getSkuCatalogDetail(id);

  if (!sku) {
    notFound();
  }

  const parentOptions = await getSKUParentOptions(STORE_ID, sku.id);
  const variantEntries = Object.entries(sku.variantAttributes);
  const images = sku.meta.images ?? [];
  const returnHref = safeReturnPath(returnTo, "/inventory/skus");
  const coverUrl =
    images.find((i) => i.isCover)?.url ?? images[0]?.url ?? sku.imageUrl;

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
            alt={sku.name}
            size="md"
            className="shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="font-mono text-[10px]">
                {sku.code}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {productKindLabel(sku.productKind)}
              </Badge>
              <Badge
                variant={sku.catalogStatus === "active" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {catalogStatusLabel(sku.catalogStatus)}
              </Badge>
              {sku.category ? (
                <Badge variant="secondary" className="text-[10px]">
                  {sku.category}
                </Badge>
              ) : null}
              {sku.brand ? (
                <Badge className="text-[10px]">{sku.brand}</Badge>
              ) : null}
            </div>
            <h1 className="mt-1 text-xl font-semibold leading-tight">{sku.name}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              主数据档案 · 上架/售出请至「可售库存」
            </p>
          </div>
        </div>
        <SKUDetailActions
          storeId={STORE_ID}
          returnHref={returnHref}
          initialEditOpen={edit === "1"}
          sku={{
            id: sku.id,
            code: sku.code,
            name: sku.name,
            category: sku.category,
            brand: sku.brand,
            attributes: {
              ...sku.variantAttributes,
              catalogStatus: sku.meta.catalogStatus,
              productKind: sku.meta.productKind,
              referencePrice: sku.meta.referencePrice,
              referenceCost: sku.meta.referenceCost,
              currency: sku.meta.currency,
              tags: sku.meta.tags,
              series: sku.meta.series,
              notes: sku.meta.notes,
              images: sku.meta.images,
              newFields: sku.meta.newFields,
              usedFields: sku.meta.usedFields,
            },
            description: sku.description,
            imageUrl: sku.imageUrl,
            parentSkuId: sku.parentSkuId,
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
                      <img
                        src={img.url}
                        alt=""
                        className="h-16 w-16 object-cover"
                      />
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
                <InfoCell label="系列" value={sku.series || sku.meta.series || "—"} />
                <InfoCell
                  label="参考售价"
                  value={
                    sku.referencePrice
                      ? formatCurrency(sku.referencePrice, sku.currency ?? "CNY")
                      : "—"
                  }
                />
                <InfoCell
                  label="参考成本"
                  value={
                    sku.meta.referenceCost
                      ? formatCurrency(sku.meta.referenceCost, sku.currency ?? "CNY")
                      : "—"
                  }
                />
                <InfoCell
                  label="标签"
                  value={sku.meta.tags?.length ? sku.meta.tags.join("、") : "—"}
                />
              </dl>
              {sku.description ? (
                <InfoCell label="描述" value={sku.description} />
              ) : null}
              {sku.meta.notes ? (
                <InfoCell label="备注" value={sku.meta.notes} />
              ) : null}
            </CardContent>
          </Card>

          {(sku.parentSku || sku.childSkus.length > 0 || variantEntries.length > 0) && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                  <GitBranch className="h-3.5 w-3.5" />
                  变体与规格
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-sm">
                {sku.parentSku ? (
                  <p>
                    <span className="text-muted-foreground">父 SKU：</span>
                    <Link
                      href={`/inventory/skus/${sku.parentSku.id}`}
                      className="font-medium hover:underline"
                    >
                      {sku.parentSku.code} · {sku.parentSku.name}
                    </Link>
                  </p>
                ) : null}
                {sku.childSkus.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">子 SKU</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sku.childSkus.map((child) => (
                        <Link key={child.id} href={`/inventory/skus/${child.id}`}>
                          <Badge
                            variant="outline"
                            className="font-mono text-xs hover:bg-muted"
                          >
                            {child.code}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {variantEntries.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {variantEntries.map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {String(value)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>

        <SKUReferencePanel sku={sku} compact />
      </div>
    </div>
  );
}
