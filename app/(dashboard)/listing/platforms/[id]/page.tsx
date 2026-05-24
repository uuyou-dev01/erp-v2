import { getPlatformById } from "@/app/actions/platforms";
import { PlatformForm } from "@/components/listing/platform-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/decimal";
import { COUNTRIES, CURRENCIES } from "@/lib/i18n";
import { ArrowLeft, Globe, Package, Percent, Truck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

const countryMap = Object.fromEntries(COUNTRIES.map((c) => [c.value, c.label]));
const currencyMap = Object.fromEntries(CURRENCIES.map((c) => [c.value, c.label]));

function formatRate(value: string | null) {
  if (!value) return "未设置";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export default async function PlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const platform = await getPlatformById(id);

  if (!platform) {
    notFound();
  }

  const shippingRules = Array.isArray(platform.shippingRules)
    ? (platform.shippingRules as Array<{
        name?: string;
        carrier?: string | null;
        sizeClass?: string | null;
        maxWeightKg?: string | null;
        fee?: string | null;
        currency?: string | null;
        notes?: string | null;
      }>)
    : [];
  const activeListings = platform.listings.filter((listing) => listing.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <Link href="/listing/platforms">
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {platform.code}
              </Badge>
              {platform.country && (
                <Badge variant="secondary">
                  {countryMap[platform.country] || platform.country}
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-3xl font-bold">{platform.name}</h1>
            <p className="text-muted-foreground">查看平台费率、配送规则和当前上架记录。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4" />
              默认币种
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {platform.defaultCurrency
                ? currencyMap[platform.defaultCurrency] || platform.defaultCurrency
                : "未设置"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Percent className="h-4 w-4" />
              默认费率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatRate(platform.defaultFeeRate)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Truck className="h-4 w-4" />
              配送规则
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shippingRules.length}</div>
            <p className="text-xs text-muted-foreground">条规则模板</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              上架中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeListings.length}</div>
            <p className="text-xs text-muted-foreground">共 {platform.listings.length} 条记录</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>配送规则</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {shippingRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无配送规则。</p>
            ) : (
              shippingRules.map((rule, index) => (
                <div key={index} className="rounded-lg border bg-white/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{rule.name || `规则 ${index + 1}`}</p>
                    {rule.fee && (
                      <span className="font-mono text-sm">
                        {rule.currency || platform.defaultCurrency || ""} {rule.fee}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[rule.carrier, rule.sizeClass, rule.maxWeightKg, rule.notes]
                      .filter(Boolean)
                      .join(" · ") || "未填写适用条件"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>上架记录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {platform.listings.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无上架记录。</p>
            ) : (
              platform.listings.slice(0, 6).map((listing) => {
                const product = listing.sku || listing.itemUnit?.sku;
                return (
                  <div key={listing.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{product?.code || "未关联商品"}</p>
                      <p className="text-sm text-muted-foreground">
                        {product?.name || "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={listing.status === "ACTIVE" ? "default" : "outline"}>
                        {listing.status}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {listing.listedPrice && listing.currency
                          ? formatCurrency(listing.listedPrice, listing.currency)
                          : "未设置价格"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>编辑平台信息</CardTitle>
        </CardHeader>
        <CardContent>
          <PlatformForm
            storeId={STORE_ID}
            initialData={{
              id: platform.id,
              code: platform.code,
              name: platform.name,
              country: platform.country,
              defaultFeeRate: platform.defaultFeeRate,
              defaultCurrency: platform.defaultCurrency,
              defaultShippingFee: platform.defaultShippingFee,
              shippingRules: platform.shippingRules,
              notes: platform.notes,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
