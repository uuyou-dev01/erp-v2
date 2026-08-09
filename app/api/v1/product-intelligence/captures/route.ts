import { NextResponse } from "next/server";
import { createCaptureDraft, getMyRecentCaptures, type CaptureEvidenceInput } from "@/lib/capture/service";
import { mobileApiError, parseLimit } from "@/lib/mobile/http";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";
import { getMobileFeatureFlags } from "@/lib/mobile/features";

export async function GET(request: Request) {
  try {
    const limit = parseLimit(new URL(request.url).searchParams.get("limit"), 30, 100);
    const captures = await getMyRecentCaptures(limit);
    return NextResponse.json({ captures });
  } catch (error) {
    return mobileApiError(error, "无法读取采集记录");
  }
}

export async function POST(request: Request) {
  try {
    const { context, device } = await requireActiveCompanionDevice();
    if (!getMobileFeatureFlags().capture) throw new Error("随手采集功能暂未开放");
    await assertMobileRateLimit({ organizationId: context.organizationId, subjectId: device.id, key: "capture", limit: 30 });
    const body = await request.json() as CaptureEvidenceInput;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    const result = await createCaptureDraft({ ...body, idempotencyKey: idempotencyKey || body.idempotencyKey });
    return NextResponse.json({ captureId: result.id, status: result.status, reviewUrl: `/product-intelligence/captures/${result.id}` }, { status: 201 });
  } catch (error) {
    return mobileApiError(error, "创建采集失败");
  }
}
