import { requireUserContext } from "@/lib/auth/user-context";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InventoryLotForm } from "@/components/inventory/inventory-lot-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function safeReturnPath(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export default async function NewInventoryLotPage({
  searchParams,
}: {
  searchParams: Promise<{ skuId?: string; returnTo?: string }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { skuId, returnTo } = await searchParams;
  const presetSku = skuId
    ? await prisma.sKU.findFirst({
        where: {
          id: skuId,
          storeId,
          catalogRole: { not: "GROUP" },
        },
        select: { id: true, code: true, name: true },
      })
    : null;
  const returnHref = safeReturnPath(returnTo, "/inventory/lots");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link href={returnHref}>
          <Button variant="ghost" size="icon" className="mt-0.5" aria-label="返回">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="mb-0 flex-1"
          title="录入库存"
          description={
            presetSku
              ? `为 ${presetSku.name}（${presetSku.code}）在指定仓库建立新的库存批次。`
              : "选择商品和仓库，录入新增库存的数量、成本与入库日期。"
          }
        />
      </div>

      <InventoryLotForm
        storeId={storeId}
        initialSkuId={presetSku?.id}
        returnHref={returnHref}
      />
    </div>
  );
}
