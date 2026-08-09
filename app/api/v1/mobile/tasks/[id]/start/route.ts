import { NextResponse } from "next/server";
import { startMobileTaskAction } from "@/app/actions/mobile";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await startMobileTaskAction(decodeURIComponent(id));
    if (!result.success) throw new Error(result.error);
    return NextResponse.json(result);
  } catch (error) {
    return mobileApiError(error, "开始任务失败");
  }
}
