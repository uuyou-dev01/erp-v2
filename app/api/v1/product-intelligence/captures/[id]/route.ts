import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError } from "@/lib/mobile/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireUserContext(), params]);
    const capture = await prisma.productIntelligenceCapture.findFirst({
      where: { id, organizationId: context.organizationId, storeId: context.activeStoreId },
      include: {
        assets: true,
        sourceListings: { include: { snapshots: { orderBy: { observedAt: "desc" } } } },
        purchaseDraft: { include: { lines: true } },
        businessLinks: true,
        extractedClaims: true,
        matchCandidates: { orderBy: { score: "desc" } },
      },
    });
    if (!capture) return NextResponse.json({ error: { code: "NOT_FOUND", message: "采集记录不存在" } }, { status: 404 });
    return NextResponse.json(capture);
  } catch (error) {
    return mobileApiError(error, "无法读取采集详情");
  }
}
