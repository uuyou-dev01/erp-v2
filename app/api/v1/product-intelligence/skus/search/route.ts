import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth/user-context";
import { searchOperationalSkus } from "@/lib/capture/sku-matching";
import { mobileApiError, parseLimit } from "@/lib/mobile/http";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";

export async function GET(request: Request) {
  try {
    const context = await requireUserContext();
    await assertMobileRateLimit({
      organizationId: context.organizationId,
      subjectId: context.userId,
      key: "web-sku-search",
      limit: 120,
      windowSeconds: 60,
    });
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
