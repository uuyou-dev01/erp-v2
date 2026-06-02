import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Package, Percent } from "lucide-react";
import { getListingById } from "@/app/actions/listings";
import { ListingEditForm } from "@/components/listing/listing-edit-form";
import { ListingPlatformMark } from "@/components/listing/listing-platform-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductImage } from "@/components/ui/product-image";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  if (status === "ACTIVE") return "在售中";
  if (status === "DELISTED") return "已下架";
  if (status === "SOLD_OUT") return "已售罄";
  return status;
}

function firstPhoto(value: unknown) {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

function formatDate(value: Date | null) {
  if (!value) return "-";
  return value.toLocaleDateString("zh-CN");
}

function safeReturnPath(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const listing = await getListingById(id);

  if (!listing) {
    notFound();
  }

  const sku = listing.sku || listing.itemUnit?.sku;
  if (!sku) {
    notFound();
  }
  const returnHref = safeReturnPath(returnTo, "/listing");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <Link href={returnHref}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <ProductImage
            src={firstPhoto(listing.itemUnit?.photos) ?? sku.imageUrl}
            alt={sku.name}
            size="lg"
            className="mt-1 rounded-xl"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ListingPlatformMark
                code={listing.platform.code}
                name={listing.platform.name}
              />
              <Badge>{statusLabel(listing.status)}</Badge>
              <Badge variant="secondary">
                {listing.listingType === "ITEM_UNIT" ? "中古单品" : "SKU"}
              </Badge>
            </div>
            <h1 className="mt-2 text-3xl font-bold">{sku.name}</h1>
            <p className="font-mono text-sm text-muted-foreground">{sku.code}</p>
          </div>
        </div>
        <Link href={`/listing/platforms/${listing.platform.id}`}>
          <Button variant="outline">
            <ExternalLink className="mr-2 h-4 w-4" />
            查看平台
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              平台售价
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {listing.listedPrice
                ? `${listing.currency ?? ""} ${listing.listedPrice.toString()}`
                : "未定价"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Percent className="h-4 w-4" />
              预估到手价
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {listing.estimatedNet
                ? `${listing.currency ?? ""} ${listing.estimatedNet.toString()}`
                : "未计算"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">发布时间</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(listing.listedAt)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">最近更新</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(listing.updatedAt)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>编辑 Listing</CardTitle>
        </CardHeader>
        <CardContent>
          <ListingEditForm
            listingId={listing.id}
            listedPrice={listing.listedPrice?.toString() ?? ""}
            currency={listing.currency ?? listing.platform.defaultCurrency ?? "CNY"}
            status={listing.status}
            returnHref={returnHref}
          />
        </CardContent>
      </Card>
    </div>
  );
}
