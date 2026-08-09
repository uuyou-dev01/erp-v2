import { NextResponse } from "next/server";
import { runMobileRetention } from "@/lib/mobile/retention";

export async function POST(request: Request) {
  const secret = process.env.MOBILE_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runMobileRetention());
}
