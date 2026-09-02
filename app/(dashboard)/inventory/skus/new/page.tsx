import { requireUserContext } from "@/lib/auth/user-context";
import { SKUForm } from "@/components/inventory/sku-form";
import { getSKUParentOptions } from "@/app/actions/skus";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Boxes, Package, ArrowRight } from "lucide-react";
import type { SkuCatalogRole } from "@/lib/application/sku-identity";
import { safeSkuReturnPath } from "@/lib/application/sku-create-navigation";

export const dynamic = "force-dynamic";

function modeToRole(mode?: string): SkuCatalogRole | null {
  if (mode === "variant") return "VARIANT";
  if (mode === "simple") return "SIMPLE";
  if (mode === "group") return "GROUP";
  return null;
}

function titleForRole(role: SkuCatalogRole) {
  if (role === "VARIANT") return "新增规格 SKU";
  if (role === "SIMPLE") return "新增独立 SKU";
  return "新增商品组";
}

function newSkuHref({
  mode,
  parentSkuId,
  returnTo,
}: {
  mode: "group" | "simple" | "variant";
  parentSkuId?: string;
  returnTo?: string | null;
}) {
  const query = new URLSearchParams({ mode });
  if (parentSkuId) query.set("parentSkuId", parentSkuId);
  if (returnTo) query.set("returnTo", returnTo);
  return `/inventory/skus/new?${query.toString()}`;
}

export default async function NewSKUPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; parentSkuId?: string; returnTo?: string }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { mode, parentSkuId, returnTo } = await searchParams;
  const safeReturnTo = safeSkuReturnPath(returnTo);
  const backHref = safeReturnTo ?? "/inventory/skus";
  const defaultCatalogRole = modeToRole(mode);

  if (!defaultCatalogRole) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-start gap-2">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="mt-0.5" aria-label="返回商品档案">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeader
            className="mb-0 flex-1"
            title="新增商品"
            description="先按实际销售方式选择；系统会只显示这类商品需要填写的内容。"
          />
        </div>

        <section className="overflow-hidden rounded-lg border bg-background">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">这个商品是否有多个可交易规格？</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              例如尺码、颜色、容量或角色不同，并且需要分别管理库存和销售。
            </p>
          </div>
          <div className="divide-y">
            <Link
              href={newSkuHref({ mode: "group", returnTo: safeReturnTo })}
              className="group flex items-start gap-4 px-5 py-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">有多个规格</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  先建立共用的商品信息和规格维度，再添加每个可交易规格。库存只记在具体规格上。
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  例如：Nike AJ1 → 41码、42码、43码
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={newSkuHref({ mode: "simple", returnTo: safeReturnTo })}
              className="group flex items-start gap-4 px-5 py-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">没有规格拆分</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  直接建立一个可交易商品，随后可以录入期初库存。
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  例如：竹篮、单一型号设备、唯一款式商品
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const parentOptions = await getSKUParentOptions(storeId);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" className="mt-0.5" aria-label="返回上一页">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="mb-0 flex-1"
          title={titleForRole(defaultCatalogRole)}
          description={
            defaultCatalogRole === "GROUP"
              ? "维护系列共用信息和规格结构；保存后继续添加具体可交易规格。"
              : defaultCatalogRole === "VARIANT"
                ? "添加商品组下的具体可交易规格，库存将记录在这个规格上。"
                : "建立无需规格拆分的可交易商品，保存后可继续录入期初库存。"
          }
        />
      </div>

      <SKUForm
        storeId={storeId}
        parentOptions={parentOptions}
        defaultCatalogRole={defaultCatalogRole}
        defaultParentSkuId={parentSkuId}
        continueAfterCreate
        returnTo={safeReturnTo}
      />
    </div>
  );
}
