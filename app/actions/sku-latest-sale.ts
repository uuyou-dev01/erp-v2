"use server";

import { requireUserContext } from "@/lib/auth/user-context";
import { getLatestNewSkuSale, type LatestSkuSale } from "@/lib/application/sku-latest-sale";

export async function getSkuLatestSale(input: {
  storeId: string;
  skuId: string;
}): Promise<{ success: true; sale: LatestSkuSale | null } | { success: false }> {
  try {
    const context = await requireUserContext({ storeId: input.storeId });
    const sale = await getLatestNewSkuSale(context.activeStoreId, input.skuId);
    return { success: true, sale };
  } catch {
    return { success: false };
  }
}
