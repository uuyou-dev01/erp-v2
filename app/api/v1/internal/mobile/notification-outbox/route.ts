import { NextResponse } from "next/server";
import { processNotificationOutbox } from "@/lib/mobile/notification-outbox";

export async function POST(request: Request) {
  const secret = process.env.MOBILE_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await processNotificationOutbox({ limit: 200 });
  return NextResponse.json({ processed: results.length, results });
}
