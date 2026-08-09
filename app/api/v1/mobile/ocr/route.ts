import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { mobileApiError } from "@/lib/mobile/http";
import { recognizeCaptureImage } from "@/lib/capture/ocr";
import { readMobileAsset } from "@/lib/mobile/asset-storage";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";
import { getMobileFeatureFlags } from "@/lib/mobile/features";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const [{ context, device }, body] = await Promise.all([
      requireActiveCompanionDevice(),
      request.json() as Promise<{ assetId?: string; language?: "chi_sim" | "jpn" | "eng" }>,
    ]);
    if (!getMobileFeatureFlags().ocr) throw new Error("截图识别功能暂未开放");
    await assertMobileRateLimit({ organizationId: context.organizationId, subjectId: device.id, key: "ocr", limit: 10 });
    if (!body.assetId) throw new Error("请选择需要识别的截图");
    const asset = await prisma.mobileAsset.findFirst({
      where: { id: body.assetId, organizationId: context.organizationId, userId: context.userId, status: "READY" },
    });
    if (!asset) throw new Error("当前证据文件不存在或无权访问");
    const result = await recognizeCaptureImage(await readMobileAsset(asset.storageKey), body.language || "chi_sim");
    return NextResponse.json(result);
  } catch (error) {
    return mobileApiError(error, "截图识别失败");
  }
}
