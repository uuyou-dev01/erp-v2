import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveOrganizationIdForUser, requireAuthenticatedUser } from "@/lib/auth/user-context";
import { absoluteAssetPath } from "@/lib/assets/storage";
import { canReadPrivateAssetReference } from "@/lib/assets/references";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const asset = await prisma.mobileAsset.findFirst({
      where: { id, status: "READY" },
      select: {
        organizationId: true,
        storeId: true,
        storageKey: true,
        mimeType: true,
        byteSize: true,
        visibility: true,
        purpose: true,
        userId: true,
        refType: true,
        refId: true,
      },
    });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (asset.visibility !== "CATALOG_PUBLIC") {
      const user = await requireAuthenticatedUser();
      const activeOrganizationId = await getActiveOrganizationIdForUser(user.id);
      if (!(await canReadPrivateAssetReference(user.id, activeOrganizationId, asset))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const bytes = await readFile(absoluteAssetPath(asset.storageKey));
    return new NextResponse(bytes, {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.byteLength),
        "cache-control":
          asset.visibility === "CATALOG_PUBLIC"
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
