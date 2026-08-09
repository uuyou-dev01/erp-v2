import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { confirmPriceObservation, type ConfirmObservationInput } from "@/lib/capture/service";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }, body] = await Promise.all([requireUserContext(), params, request.json() as Promise<Partial<ConfirmObservationInput>>]);
    const capture = await prisma.productIntelligenceCapture.findFirst({ where: { id, organizationId: context.organizationId, storeId: context.activeStoreId } });
    if (!capture) throw new Error("采集记录不存在或无权访问");
    const result = await confirmPriceObservation({
      businessIntent: "OBSERVE_PRICE",
      idempotencyKey: capture.idempotencyKey || `confirm-observation:${capture.id}`,
      captureType: capture.captureType,
      sourceUrl: body.sourceUrl ?? capture.sourceUrl ?? undefined,
      sourceText: body.sourceText ?? capture.sourceText ?? undefined,
      platformName: body.platformName ?? capture.platformName ?? undefined,
      externalListingId: body.externalListingId ?? capture.externalListingId ?? undefined,
      title: body.title ?? capture.title ?? undefined,
      amount: body.amount ?? capture.amount?.toString(),
      currency: body.currency ?? capture.currency ?? undefined,
      conditionText: body.conditionText ?? capture.conditionText ?? undefined,
      visibility: body.visibility ?? capture.visibility,
      capturedAt: capture.capturedAt.toISOString(),
      itemId: body.itemId,
      note: body.note,
    });
    return NextResponse.json(result);
  } catch (error) {
    return mobileApiError(error, "确认价格失败");
  }
}
