import { NextResponse } from "next/server";
import { releaseMetadata } from "@/lib/runtime/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const release = releaseMetadata();
  return NextResponse.json(
    { status: "ok", appVersion: release.version, gitSha: release.sha },
    { headers: { "cache-control": "no-store" } }
  );
}
