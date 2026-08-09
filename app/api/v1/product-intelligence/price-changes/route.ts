import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError, parseLimit } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const context = await requireUserContext();
    const params = new URL(request.url).searchParams;
    const rows = await prisma.sourcePriceChange.findMany({
      where: { sourceListing: { organizationId: context.organizationId, storeId: context.activeStoreId }, ...(params.get("sourceListingId") ? { sourceListingId: params.get("sourceListingId")! } : {}) },
      include: { sourceListing: { select: { title: true, platformName: true, sourceUrl: true } } },
      orderBy: { observedAt: "desc" },
      take: parseLimit(params.get("limit"), 50, 200),
    });
    return NextResponse.json({ items: rows.map((row) => ({ ...row, previousAmount: row.previousAmount.toString(), amount: row.amount.toString(), deltaAmount: row.deltaAmount.toString(), deltaRate: row.deltaRate?.toString() ?? null })) });
  } catch (error) {
    return mobileApiError(error, "无法读取价格变化");
  }
}
