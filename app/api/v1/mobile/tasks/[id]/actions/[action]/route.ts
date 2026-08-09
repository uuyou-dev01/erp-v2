import { NextResponse } from "next/server";
import { executeMobileTaskAction } from "@/app/actions/mobile";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const [{ id, action }, body] = await Promise.all([
      params,
      request.json() as Promise<{
        expectedVersion?: string;
        fields?: Record<string, string | boolean | string[] | undefined>;
        confirmation?: { acceptedImpact?: boolean };
      }>,
    ]);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) throw new Error("缺少 Idempotency-Key");
    if (!body.expectedVersion) throw new Error("缺少 expectedVersion");
    const result = await executeMobileTaskAction({
      taskId: decodeURIComponent(id),
      action,
      expectedVersion: body.expectedVersion,
      idempotencyKey,
      fields: body.fields ?? {},
      confirmation: body.confirmation,
    });
    return NextResponse.json(result);
  } catch (error) {
    return mobileApiError(error, "移动任务执行失败");
  }
}
