import { requireUserContext } from "@/lib/auth/user-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListingForm } from "@/components/listing/listing-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SellableMarketCode } from "@/lib/application/sellable-market";

export const dynamic = "force-dynamic";

// Temporary hardcoded storeId

function safeReturnPath(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function parseMarket(value?: string): SellableMarketCode | undefined {
  if (
    value === "CN" ||
    value === "JP" ||
    value === "US" ||
    value === "EU" ||
    value === "GLOBAL" ||
    value === "UNKNOWN"
  ) {
    return value;
  }
  return undefined;
}

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{
    skuId?: string;
    itemUnitId?: string;
    platformId?: string;
    listingType?: "SKU" | "ITEM_UNIT";
    returnTo?: string;
    market?: string;
  }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const params = await searchParams;
  const returnHref = safeReturnPath(params.returnTo, "/inventory/sellable");
  const targetMarket = parseMarket(params.market);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={returnHref}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">添加上架记录</h1>
          <p className="text-muted-foreground">
            从销售平台配置中选择平台，记录该商品已在某平台上架。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>上架记录</CardTitle>
        </CardHeader>
        <CardContent>
          <ListingForm
            storeId={storeId}
            initialSkuId={params.skuId}
            initialItemUnitId={params.itemUnitId}
            initialPlatformId={params.platformId}
            initialListingType={params.listingType}
            returnHref={returnHref}
            targetMarket={targetMarket}
          />
        </CardContent>
      </Card>
    </div>
  );
}
