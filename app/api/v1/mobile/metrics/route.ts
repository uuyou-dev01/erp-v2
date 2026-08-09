import { NextResponse } from "next/server";
import { getMobileSlaMetrics } from "@/lib/mobile/metrics";
import { mobileApiError } from "@/lib/mobile/http";

export async function GET() {
  try {
    return NextResponse.json(await getMobileSlaMetrics());
  } catch (error) {
    return mobileApiError(error, "无法读取移动任务指标");
  }
}
