import type { PrismaClient } from "@prisma/client";

type SkuReader = Pick<PrismaClient, "sKU">;

export async function assertOperationalSku(
  db: SkuReader,
  input: { storeId: string; skuId: string; actionLabel?: string }
) {
  const sku = await db.sKU.findFirst({
    where: { id: input.skuId, storeId: input.storeId },
    select: {
      id: true,
      parentSkuId: true,
      _count: { select: { childSkus: true } },
    },
  });

  if (!sku) {
    throw new Error("SKU 不存在或不属于当前店铺");
  }

  if (!sku.parentSkuId && sku._count.childSkus > 0) {
    throw new Error(
      `父 SKU 仅用于分组，请选择具体子 SKU${input.actionLabel ? `后再${input.actionLabel}` : ""}`
    );
  }
}
