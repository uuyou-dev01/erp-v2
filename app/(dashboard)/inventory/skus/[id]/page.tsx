import { getSKUById } from "@/app/actions/skus";
import { SKUForm } from "@/components/inventory/sku-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { Package, PackageOpen } from "lucide-react";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

export default async function SKUDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sku = await getSKUById(id);

  if (!sku) {
    notFound();
  }

  const totalLots = sku.inventoryLots.length;
  const totalItems = sku.itemUnits.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        {sku.imageUrl && (
          <div className="w-32 h-32 rounded-lg border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
            <img
              src={sku.imageUrl}
              alt={sku.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Edit SKU</h1>
          <p className="text-muted-foreground">Update product details</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="font-mono">{sku.code}</Badge>
            {sku.category && <Badge variant="secondary">{sku.category}</Badge>}
            {sku.brand && <Badge>{sku.brand}</Badge>}
          </div>
        </div>
      </div>

      {(totalLots > 0 || totalItems > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Inventory Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Inventory Lots</p>
                  <p className="text-2xl font-bold">{totalLots}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <PackageOpen className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Item Units</p>
                  <p className="text-2xl font-bold">{totalItems}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <SKUForm
        storeId={STORE_ID}
        initialData={{
          id: sku.id,
          code: sku.code,
          name: sku.name,
          category: sku.category,
          brand: sku.brand,
          attributes: sku.attributes as Record<string, unknown> | null,
          description: sku.description,
          imageUrl: sku.imageUrl,
        }}
      />

      {(totalLots > 0 || totalItems > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Related Inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalLots > 0 && (
              <div>
                <h4 className="mb-2 font-medium">Inventory Lots</h4>
                <div className="space-y-2">
                  {sku.inventoryLots.slice(0, 5).map((lot) => (
                    <div
                      key={lot.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">{lot.location.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Cost: {lot.costCurrency} {lot.unitCost.toString()}
                        </p>
                      </div>
                      <Badge>{lot.status}</Badge>
                    </div>
                  ))}
                  {totalLots > 5 && (
                    <p className="text-sm text-muted-foreground">
                      And {totalLots - 5} more...
                    </p>
                  )}
                </div>
              </div>
            )}

            {totalItems > 0 && (
              <div>
                <h4 className="mb-2 font-medium">Item Units</h4>
                <div className="space-y-2">
                  {sku.itemUnits.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">{item.location.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Cost: {item.costCurrency} {item.unitCost.toString()}
                          {item.conditionGrade && ` • ${item.conditionGrade}`}
                        </p>
                      </div>
                      <Badge>{item.status}</Badge>
                    </div>
                  ))}
                  {totalItems > 5 && (
                    <p className="text-sm text-muted-foreground">
                      And {totalItems - 5} more...
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
