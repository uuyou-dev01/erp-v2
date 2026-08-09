import { NextResponse } from "next/server";
import { mobileApiError, parseLimit } from "@/lib/mobile/http";
import { searchOperationalSkus } from "@/lib/capture/sku-matching";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";

export async function GET(request: Request) {
  try {
    const { context, device } = await requireActiveCompanionDevice();
    await assertMobileRateLimit({ organizationId: context.organizationId, subjectId: device.id, key: "sku-search", limit: 120 });
    const params = new URL(request.url).searchParams;
    const results = await searchOperationalSkus(
      context.activeStoreId,
      {
        query: params.get("q") || undefined,
        brand: params.get("brand") || undefined,
        variant: params.get("variant") || undefined,
        barcode: params.get("barcode") || undefined,
        manufacturerCode: params.get("manufacturerCode") || undefined,
      },
      parseLimit(params.get("limit"), 8, 20)
    );
    return NextResponse.json({ results });
  } catch (error) {
    return mobileApiError(error, "无法搜索正式 SKU");
  }
}
