import { NextResponse } from "next/server";
import { getMobileHome } from "@/lib/mobile/tasks";
import { mobileApiError } from "@/lib/mobile/http";
import { getMobileFeatureFlags } from "@/lib/mobile/features";

export async function GET() {
  try {
    const home = await getMobileHome();
    return NextResponse.json({ ...home, featureFlags: getMobileFeatureFlags() });
  } catch (error) {
    return mobileApiError(error, "无法加载移动首页");
  }
}
