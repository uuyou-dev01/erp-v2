import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const updateSchema = z.object({
  pushEnabled: z.boolean(),
  digestMode: z.enum(["IMMEDIATE", "HOURLY", "DAILY"]),
  quietStart: z.string().regex(clock).nullable(),
  quietEnd: z.string().regex(clock).nullable(),
  mutedTypes: z.array(z.string().min(1).max(80)).max(30).default([]),
});

export async function GET() {
  try {
    const context = await requireUserContext();
    const preference = await prisma.notificationPreference.findUnique({
      where: { organizationId_userId: { organizationId: context.organizationId, userId: context.userId } },
    });
    return NextResponse.json({
      preference: preference ?? { pushEnabled: true, digestMode: "IMMEDIATE", quietStart: null, quietEnd: null, mutedTypes: [] },
    });
  } catch (error) {
    return mobileApiError(error, "无法读取通知偏好");
  }
}

export async function PUT(request: Request) {
  try {
    const context = await requireUserContext();
    const body = updateSchema.parse(await request.json());
    if (Boolean(body.quietStart) !== Boolean(body.quietEnd)) throw new Error("静默开始和结束时间需要同时设置");
    const preference = await prisma.notificationPreference.upsert({
      where: { organizationId_userId: { organizationId: context.organizationId, userId: context.userId } },
      create: { organizationId: context.organizationId, userId: context.userId, ...body },
      update: body,
    });
    return NextResponse.json({ preference });
  } catch (error) {
    return mobileApiError(error, "保存通知偏好失败");
  }
}
