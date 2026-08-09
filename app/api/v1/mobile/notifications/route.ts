import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { mobileApiError, parseLimit } from "@/lib/mobile/http";

export async function GET(request: Request) {
  try {
    const context = await requireUserContext();
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"), 40, 100);
    const cursor = url.searchParams.get("cursor");
    const rows = await prisma.notification.findMany({
      where: { organizationId: context.organizationId, recipientId: context.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((item) => ({
      ...item,
      actionUrl: item.actionUrl || (item.taskId ? `/m/tasks/${encodeURIComponent(item.taskId)}` : "/m/tasks"),
    }));
    return NextResponse.json({ items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
  } catch (error) {
    return mobileApiError(error, "无法加载通知");
  }
}
