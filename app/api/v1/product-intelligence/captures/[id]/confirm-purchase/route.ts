import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { confirmPurchaseCapture, type ConfirmPurchaseInput } from "@/lib/capture/service";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }, body] = await Promise.all([requireUserContext(), params, request.json() as Promise<ConfirmPurchaseInput>]);
    const capture = await prisma.productIntelligenceCapture.findFirst({ where: { id, organizationId: context.organizationId, storeId: context.activeStoreId } });
    if (!capture) throw new Error("采集记录不存在或无权访问");
    const result = await confirmPurchaseCapture({
      ...body,
      businessIntent: "RECORD_PURCHASE",
      idempotencyKey: capture.idempotencyKey || `confirm-purchase:${capture.id}`,
      captureType: capture.captureType,
      sourceUrl: body.sourceUrl ?? capture.sourceUrl ?? undefined,
      sourceText: body.sourceText ?? capture.sourceText ?? undefined,
      platformName: body.platformName ?? capture.platformName ?? undefined,
      externalListingId: body.externalListingId ?? capture.externalListingId ?? undefined,
      visibility: body.visibility ?? capture.visibility,
      capturedAt: capture.capturedAt.toISOString(),
    });
    return NextResponse.json(result);
  } catch (error) {
    return mobileApiError(error, "确认购入失败");
  }
}
