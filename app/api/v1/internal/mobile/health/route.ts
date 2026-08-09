import { NextResponse } from "next/server";
import { getMobileOperationalHealth } from "@/lib/mobile/health";

export async function GET(request: Request) {
  const secret = process.env.MOBILE_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const health = await getMobileOperationalHealth();
  return NextResponse.json(health, { status: health.healthy ? 200 : 503 });
}
