import { NextResponse } from "next/server";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { getWebPushPublicKey } from "@/lib/mobile/web-push";
import { prisma } from "@/lib/prisma";
import { mobileApiError } from "@/lib/mobile/http";

export async function GET() {
  return NextResponse.json({ enabled: Boolean(getWebPushPublicKey()), publicKey: getWebPushPublicKey() });
}

export async function POST(request: Request) {
  try {
    const [{ context, device }, body] = await Promise.all([
      requireActiveCompanionDevice(),
      request.json() as Promise<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>,
    ]);
    if (!body.endpoint || !body.keys?.p256dh || !body.keys.auth) throw new Error("推送订阅格式不正确");
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        organizationId: context.organizationId,
        userId: context.userId,
        deviceId: device.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: request.headers.get("user-agent"),
      },
      update: {
        organizationId: context.organizationId,
        userId: context.userId,
        deviceId: device.id,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        revokedAt: null,
      },
    });
    return NextResponse.json({ success: true, id: subscription.id });
  } catch (error) {
    return mobileApiError(error, "推送订阅失败");
  }
}
