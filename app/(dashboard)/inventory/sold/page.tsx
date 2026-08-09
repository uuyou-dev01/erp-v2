import { requireUserContext } from "@/lib/auth/user-context";
import Link from "next/link";
import { PackageCheck, ShoppingCart } from "lucide-react";
import { ProductImage } from "@/components/ui/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";


function firstPhoto(value: unknown) {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("zh-CN");
}

export default async function SoldInventoryPage() {
  const { activeStoreId: storeId } = await requireUserContext();
  const [soldUnits, soldOutListings] = await Promise.all([
    prisma.itemUnit.findMany({
      where: { storeId: storeId, status: "CONSUMED" },
      include: {
        sku: true,
        location: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.listing.findMany({
      where: { storeId: storeId, status: "SOLD_OUT" },
      include: {
        platform: true,
        sku: true,
        itemUnit: {
          include: { sku: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">已售库存</h1>
        <p className="text-muted-foreground">
          查看已经售出或售罄的上架记录，用于回溯销售后的库存生命周期。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="h-4 w-4" />
              已售单品
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {soldUnits.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                暂无已售单品
              </p>
            ) : (
              soldUnits.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductImage
                      src={firstPhoto(item.photos) ?? item.sku.imageUrl}
                      alt={item.sku.name}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.sku.code}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.sku.name} · {item.location.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        更新于 {formatDate(item.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <Link href={`/inventory/items/${item.id}`}>
                    <Button variant="outline" size="sm">
                      查看
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />
              售罄平台记录
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {soldOutListings.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                暂无售罄平台记录
              </p>
            ) : (
              soldOutListings.map((listing) => {
                const sku = listing.sku ?? listing.itemUnit?.sku;
                if (!sku) return null;
                return (
                  <div key={listing.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{sku.code}</p>
                        <Badge variant="outline">{listing.platform.name}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {sku.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        售罄于 {formatDate(listing.updatedAt)}
                      </p>
                    </div>
                    <Link href={`/listing/${listing.id}`}>
                      <Button variant="outline" size="sm">
                        查看
                      </Button>
                    </Link>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
