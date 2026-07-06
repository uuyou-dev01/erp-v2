import type { PrismaClient } from "@prisma/client";
import { deriveCatalogRole } from "@/lib/application/sku-identity";

type SkuReader = Pick<PrismaClient, "sKU">;

export async function assertOperationalSku(
  db: SkuReader,
  input: { storeId: string; skuId: string; actionLabel?: string }
) {
  const sku = await db.sKU.findFirst({
    where: { id: input.skuId, storeId: input.storeId },
    select: {
      id: true,
      catalogRole: true,
      parentSkuId: true,
      _count: { select: { childSkus: true } },
    },
  });

  if (!sku) {
    throw new Error("SKU 不存在或不属于当前店铺");
  }

  const role = deriveCatalogRole({
    catalogRole: sku.catalogRole,
    parentSkuId: sku.parentSkuId,
    childCount: sku._count.childSkus,
  });

  if (role === "GROUP") {
    throw new Error(
      `商品组只用于管理规格，请选择规格 SKU 或独立 SKU${input.actionLabel ? `后再${input.actionLabel}` : ""}`
    );
  }
}
