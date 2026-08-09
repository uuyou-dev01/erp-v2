import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/auth/user-context";
import { readWebProductLink } from "@/lib/capture/web-link-reader";
import { mobileApiError } from "@/lib/mobile/http";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

const requestSchema = z.object({
  url: z.string().trim().min(1, "请粘贴商品链接或分享文案").max(4_096, "分享内容过长"),
});

export async function POST(request: Request) {
  try {
    const context = await requireUserContext();
    await assertMobileRateLimit({
      organizationId: context.organizationId,
      subjectId: context.userId,
      key: "web-link-preview",
      limit: 12,
      windowSeconds: 60,
    });
    const body = requestSchema.parse(await request.json());
    const preview = await readWebProductLink(body.url);
    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: { code: "INVALID_REQUEST", message: error.issues[0]?.message || "链接格式不正确" },
        },
        { status: 400 }
      );
    }
    return mobileApiError(error, "暂时无法解析该商品页");
  }
}
