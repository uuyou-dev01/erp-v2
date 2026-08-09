import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";
import { listCapturePlatformAdapters } from "@/lib/capture/platform-adapters";

export async function GET() {
  try {
    await requireUserContext();
    return NextResponse.json({ adapters: listCapturePlatformAdapters() });
  } catch (error) {
    return mobileApiError(error, "无法读取平台适配器状态");
  }
}
