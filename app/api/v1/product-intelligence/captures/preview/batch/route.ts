import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/auth/user-context";
import { extractWebLinkBatchInputs, mapWithConcurrency } from "@/lib/capture/web-link-batch";
import { readWebProductLink } from "@/lib/capture/web-link-reader";
import { mobileApiError } from "@/lib/mobile/http";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  input: z.string().trim().min(1, "请粘贴商品链接").max(20_000, "粘贴内容过长"),
});

export async function POST(request: Request) {
  try {
    const context = await requireUserContext();
    await assertMobileRateLimit({
      organizationId: context.organizationId,
      subjectId: context.userId,
      key: "web-link-batch-preview",
      limit: 4,
      windowSeconds: 60,
    });
    const body = requestSchema.parse(await request.json());
    const batch = extractWebLinkBatchInputs(body.input);
    const parsedResults = await mapWithConcurrency(batch.inputs, 3, async (input) => {
      try {
        return { input, success: true as const, preview: await readWebProductLink(input) };
      } catch (error) {
        return {
          input,
          success: false as const,
          error: error instanceof Error ? error.message : "商品页解析失败",
        };
      }
    });
    const seenIdentities = new Set<string>();
    let resolvedDuplicateCount = 0;
    const results = parsedResults.filter((result) => {
      if (!result.success) return true;
      const key = result.preview.externalListingId
        ? `${result.preview.platformName}:${result.preview.externalListingId}`
        : result.preview.normalizedUrl;
      if (seenIdentities.has(key)) {
        resolvedDuplicateCount += 1;
        return false;
      }
      seenIdentities.add(key);
      return true;
    });
    return NextResponse.json({
      ...batch,
      duplicateCount: batch.duplicateCount + resolvedDuplicateCount,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: { code: "INVALID_REQUEST", message: error.issues[0]?.message || "内容格式不正确" },
        },
        { status: 400 }
      );
    }
    return mobileApiError(error, "批量解析商品页失败");
  }
}
