import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseMetadata } from "@/lib/runtime/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const release = releaseMetadata();
  const metadata = { appVersion: release.version, gitSha: release.sha };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ready", database: "ok", ...metadata },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", database: "unavailable", ...metadata },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
