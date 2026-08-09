import { NextResponse } from "next/server";
import { getMobileTasks, type MobileTaskScope } from "@/lib/mobile/tasks";
import { mobileApiError, parseLimit } from "@/lib/mobile/http";

const SCOPES = new Set<MobileTaskScope>(["today", "mine", "open", "delegated", "completed"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawScope = url.searchParams.get("scope") as MobileTaskScope | null;
    const scope = rawScope && SCOPES.has(rawScope) ? rawScope : "today";
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursor = url.searchParams.get("cursor");
    const all = await getMobileTasks(scope);
    const start = cursor ? Math.max(0, all.findIndex((item) => item.id === cursor) + 1) : 0;
    const items = all.slice(start, start + limit);
    return NextResponse.json({
      items,
      nextCursor: start + limit < all.length ? items.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return mobileApiError(error, "无法加载任务");
  }
}
