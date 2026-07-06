import { SKUForm } from "@/components/inventory/sku-form";
import { getSKUParentOptions } from "@/app/actions/skus";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { SkuCatalogRole } from "@/lib/application/sku-identity";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

function modeToRole(mode?: string): SkuCatalogRole {
  if (mode === "variant") return "VARIANT";
  if (mode === "simple") return "SIMPLE";
  return "GROUP";
}

function titleForRole(role: SkuCatalogRole) {
  if (role === "VARIANT") return "新增规格 SKU";
  if (role === "SIMPLE") return "新增独立 SKU";
  return "新增商品组";
}

export default async function NewSKUPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; parentSkuId?: string }>;
}) {
  const { mode, parentSkuId } = await searchParams;
  const defaultCatalogRole = modeToRole(mode);
  const parentOptions = await getSKUParentOptions(STORE_ID);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link href="/inventory/skus">
          <Button variant="ghost" size="icon" className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="mb-0 flex-1"
          title={titleForRole(defaultCatalogRole)}
          description="商品组类似 SPU，只做系列壳子；规格 SKU 和独立 SKU 承接采购、库存、上架与销售。"
        />
      </div>

      <SKUForm
        storeId={STORE_ID}
        parentOptions={parentOptions}
        defaultCatalogRole={defaultCatalogRole}
        defaultParentSkuId={parentSkuId}
      />
    </div>
  );
}
